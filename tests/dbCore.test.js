import { describe, it, expect, beforeEach } from 'vitest';
import { DB_NAME } from '../src/storage/dbCore.js';

function deleteDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

function openV1WithOldStoresOnly() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('children', { keyPath: 'id', autoIncrement: true });
      const forms = db.createObjectStore('forms', { keyPath: 'id', autoIncrement: true });
      forms.createIndex('by_childId', 'childId');
      const entries = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
      entries.createIndex('by_formId', 'formId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

describe('dbCore migration from a pre-existing version-1 database', () => {
  beforeEach(deleteDb);

  it('preserves existing v1 data and adds the new v2 stores', async () => {
    // Simulate a real user's existing v1 database, seeded with one child, before this
    // codebase's own dbCore.js has ever opened it.
    const v1db = await openV1WithOldStoresOnly();
    await new Promise((resolve, reject) => {
      const tx = v1db.transaction('children', 'readwrite');
      tx.objectStore('children').add({ name: '陳小安', birthDate: '2024-11-01' });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    v1db.close();

    // Now open through this codebase's real dbCore, which requests DB_VERSION (2).
    const { openDatabase } = await import('../src/storage/dbCore.js');
    const db = await openDatabase();

    expect([...db.objectStoreNames]).toEqual(
      expect.arrayContaining(['children', 'forms', 'entries', 'parentReports', 'coursePlanEntries', 'courseOccurrences', 'developmentRecordEntries', 'behaviorObservations', 'highlightEntries'])
    );

    const existingChildren = await new Promise((resolve, reject) => {
      const tx = db.transaction('children', 'readonly');
      const request = tx.objectStore('children').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(existingChildren).toEqual([{ id: 1, name: '陳小安', birthDate: '2024-11-01' }]);
    db.close();
  });
});

describe('dbCore monthly course plan stores', () => {
  beforeEach(deleteDb);

  it('creates the monthly course plan stores with their indexes', async () => {
    const { openDatabase } = await import('../src/storage/dbCore.js');
    const db = await openDatabase();
    expect(db.objectStoreNames.contains('monthlyCoursePlans')).toBe(true);
    expect(db.objectStoreNames.contains('planSlots')).toBe(true);
    expect(db.objectStoreNames.contains('planSlotItems')).toBe(true);
    expect(db.objectStoreNames.contains('childItemOverrides')).toBe(true);

    const tx = db.transaction(['planSlots', 'planSlotItems', 'childItemOverrides'], 'readonly');
    expect(tx.objectStore('planSlots').indexNames.contains('by_planId')).toBe(true);
    expect(tx.objectStore('planSlotItems').indexNames.contains('by_slotId')).toBe(true);
    expect(tx.objectStore('childItemOverrides').indexNames.contains('by_planId')).toBe(true);
    db.close();
  });
});

describe('dbCore 寫入閘門', () => {
  beforeEach(deleteDb);

  it('建立 tombstones 與 syncState 兩張同步用的表', async () => {
    const { openDatabase } = await import('../src/storage/dbCore.js');
    const db = await openDatabase();
    expect(db.objectStoreNames.contains('tombstones')).toBe(true);
    expect(db.objectStoreNames.contains('syncState')).toBe(true);
    db.close();
  });

  it('addRecord 蓋上 uid 與 updatedAt', async () => {
    const { addRecord } = await import('../src/storage/dbCore.js');
    const created = await addRecord('children', { name: '測試童', birthDate: '2024-01-01' });
    expect(created.id).toBeTypeOf('number');
    expect(created.uid).toMatch(/^[0-9a-f-]{32,36}$/);
    expect(created.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('addRecord 沿用呼叫端給的 uid 與 updatedAt（備份還原用）', async () => {
    const { addRecord } = await import('../src/storage/dbCore.js');
    const created = await addRecord('children', {
      name: '測試童', birthDate: '2024-01-01',
      uid: 'fixed-uid-1', updatedAt: '2026-01-02T03:04:05.000Z',
    });
    expect(created.uid).toBe('fixed-uid-1');
    expect(created.updatedAt).toBe('2026-01-02T03:04:05.000Z');
  });

  it('putRecord 一律把 updatedAt 蓋成新的時間', async () => {
    const { addRecord, putRecord } = await import('../src/storage/dbCore.js');
    const created = await addRecord('children', {
      name: '測試童', birthDate: '2024-01-01', updatedAt: '2020-01-01T00:00:00.000Z',
    });
    const updated = await putRecord('children', { ...created, name: '改名' });
    expect(updated.uid).toBe(created.uid);
    expect(updated.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('deleteRecord 留下墓碑', async () => {
    const { addRecord, deleteRecord, runRequest } = await import('../src/storage/dbCore.js');
    const created = await addRecord('children', { name: '測試童', birthDate: '2024-01-01' });
    await deleteRecord('children', created.id);

    const tombstones = await runRequest('tombstones', 'readonly', store => store.getAll());
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0]).toMatchObject({ uid: created.uid, store: 'children' });
    expect(tombstones[0].deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('每次寫入都通知 writeListener', async () => {
    const { addRecord, putRecord, deleteRecord, setWriteListener } = await import('../src/storage/dbCore.js');
    let calls = 0;
    setWriteListener(() => { calls += 1; });
    try {
      const created = await addRecord('children', { name: '測試童', birthDate: '2024-01-01' });
      await putRecord('children', { ...created, name: '改名' });
      await deleteRecord('children', created.id);
      expect(calls).toBe(3);
    } finally {
      setWriteListener(null);
    }
  });
});
