import { describe, it, expect, beforeEach } from 'vitest';
import { readLocalSnapshot, applyRemoteRecord, deleteLocalByUid, adoptUid } from '../src/sync/localSnapshot.js';
import { addChild, addForm, listChildren, listFormsForChild, clearAllData } from '../src/storage/db.js';
import { runRequest } from '../src/storage/dbCore.js';

async function clearTombstones() {
  await runRequest('tombstones', 'readwrite', store => store.clear());
}

describe('readLocalSnapshot', () => {
  beforeEach(async () => { await clearAllData(); await clearTombstones(); });

  it('把每一筆記錄收成 uid 索引的快照，外鍵已換成 uid', async () => {
    const child = await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年06月' });

    const snapshot = await readLocalSnapshot();
    expect(snapshot.records.get(child.uid)).toMatchObject({ store: 'children', id: child.id });
    expect(snapshot.records.get(form.uid).payload.childId).toBe(child.uid);
    expect(snapshot.records.get(form.uid).hash).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.idByUid.get(`children:${child.uid}`)).toBe(child.id);
    expect(snapshot.uidById.get(`children:${child.id}`)).toBe(child.uid);
  });

  it('替升級前就存在、沒有 uid 的舊記錄補上 uid，且不把 updatedAt 設成現在', async () => {
    const id = await runRequest('children', 'readwrite', store =>
      store.add({ name: '舊資料童', birthDate: '2023-05-05', createdAt: '2023-05-05T00:00:00.000Z' })
    );

    const snapshot = await readLocalSnapshot();
    const stored = (await listChildren()).find(c => c.id === id);
    expect(stored.uid).toBeTypeOf('string');
    expect(snapshot.records.has(stored.uid)).toBe(true);
    expect(stored.updatedAt).toBe('2023-05-05T00:00:00.000Z');
  });
});

describe('applyRemoteRecord', () => {
  beforeEach(async () => { await clearAllData(); await clearTombstones(); });

  it('新增雲端獨有的記錄，並讓後續記錄解得開外鍵', async () => {
    const snapshot = await readLocalSnapshot();

    expect(await applyRemoteRecord({
      store: 'children', uid: 'cloud-child',
      payload: { uid: 'cloud-child', name: '雲端童', birthDate: '2024-02-02', updatedAt: 'T1' },
    }, snapshot)).toBe('written');

    expect(await applyRemoteRecord({
      store: 'forms', uid: 'cloud-form',
      payload: { uid: 'cloud-form', childId: 'cloud-child', tier: 'Ⅳ', period: '115年06月', updatedAt: 'T1' },
    }, snapshot)).toBe('written');

    const children = await listChildren();
    expect(children.map(c => c.name)).toEqual(['雲端童']);
    expect((await listFormsForChild(children[0].id)).map(f => f.period)).toEqual(['115年06月']);
  });

  it('外鍵還沒到位時延後處理，不寫出斷掉的參照', async () => {
    const snapshot = await readLocalSnapshot();
    expect(await applyRemoteRecord({
      store: 'forms', uid: 'orphan',
      payload: { uid: 'orphan', childId: 'not-here-yet', tier: 'Ⅳ', period: '115年06月' },
    }, snapshot)).toBe('deferred');
    expect(await runRequest('forms', 'readonly', store => store.getAll())).toEqual([]);
  });

  it('同 uid 的記錄是就地更新，不會變成第二筆', async () => {
    const child = await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const snapshot = await readLocalSnapshot();

    await applyRemoteRecord({
      store: 'children', uid: child.uid,
      payload: { uid: child.uid, name: '改過的名字', birthDate: '2024-01-01', updatedAt: 'T2' },
    }, snapshot);

    const children = await listChildren();
    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({ id: child.id, name: '改過的名字' });
  });
});

describe('deleteLocalByUid / adoptUid', () => {
  beforeEach(async () => { await clearAllData(); await clearTombstones(); });

  it('依 uid 刪除本機記錄且不留墓碑', async () => {
    const child = await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const snapshot = await readLocalSnapshot();
    await deleteLocalByUid('children', child.uid, snapshot);

    expect(await listChildren()).toEqual([]);
    expect(await runRequest('tombstones', 'readonly', store => store.getAll())).toEqual([]);
  });

  it('把本機記錄的 uid 換成雲端那顆，且不動 updatedAt', async () => {
    const child = await addChild({ name: '測試童', birthDate: '2024-01-01', updatedAt: '2026-01-01T00:00:00.000Z' });
    const snapshot = await readLocalSnapshot();
    await adoptUid('children', child.id, 'cloud-uid', snapshot);

    const stored = (await listChildren())[0];
    expect(stored.uid).toBe('cloud-uid');
    expect(stored.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(snapshot.idByUid.get('children:cloud-uid')).toBe(child.id);
    expect(snapshot.records.has('cloud-uid')).toBe(true);
  });
});
