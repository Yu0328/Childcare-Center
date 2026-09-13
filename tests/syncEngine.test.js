import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSyncEngine } from '../src/sync/syncEngine.js';
import { readSyncState } from '../src/storage/syncStateDb.js';
import { addChild, listChildren, deleteChild, clearAllData } from '../src/storage/db.js';
import { runRequest, putRecord } from '../src/storage/dbCore.js';
import { AuthExpiredError, DriveFormatError } from '../src/sync/driveClient.js';

const CLOUD_NOW = 'Sat, 13 Sep 2026 06:32:00 GMT';

// An in-memory stand-in for the whole Drive folder.
function fakeDrive(initial = {}) {
  const files = new Map(Object.entries(initial.records || {})); // fileId -> { uid, store, hash, payload }
  let nextId = 1;
  return {
    files,
    ensureFolder: async () => 'folder-1',
    listCloud: async () => ({
      records: new Map([...files].map(([fileId, f]) => [f.uid, { store: f.store, hash: f.hash, fileId }])),
      photos: new Map(),
      cloudNow: CLOUD_NOW,
    }),
    uploadRecord: async (folderId, { uid, store, hash, payload, fileId }) => {
      const id = fileId || `file-${nextId++}`;
      files.set(id, { uid, store, hash, payload });
      return { fileId: id };
    },
    downloadRecord: async fileId => files.get(fileId).payload,
    uploadPhoto: async () => ({ fileId: `file-photo-${nextId++}` }),
    downloadPhoto: async () => new Blob(['x'], { type: 'image/jpeg' }),
    trashFile: async fileId => { files.delete(fileId); },
  };
}

async function reset() {
  await clearAllData();
  await runRequest('syncState', 'readwrite', store => store.clear());
  await runRequest('tombstones', 'readwrite', store => store.clear());
}

describe('runSync', () => {
  beforeEach(reset);

  it('第一次同步把本機記錄全部上傳，並記下同步基準', async () => {
    const child = await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const drive = fakeDrive();
    const engine = createSyncEngine({ drive, resolveConflicts: async () => [] });

    const status = await engine.runSync();

    expect([...drive.files.values()].map(f => f.payload.name)).toEqual(['測試童']);
    expect(status.phase).toBe('done');
    expect(new Date(status.textSyncedAt).toISOString()).toBe('2026-09-13T06:32:00.000Z');
    expect((await readSyncState()).get(child.uid)).toMatchObject({ store: 'children' });
  });

  it('雲端獨有的記錄直接下載補齊', async () => {
    const drive = fakeDrive({
      records: {
        'file-a': {
          uid: 'cloud-child', store: 'children', hash: 'h1',
          payload: { uid: 'cloud-child', name: '雲端童', birthDate: '2024-02-02', updatedAt: '2026-09-12T00:00:00.000Z' },
        },
      },
    });
    const engine = createSyncEngine({ drive, resolveConflicts: async () => [] });
    await engine.runSync();

    expect((await listChildren()).map(c => c.name)).toEqual(['雲端童']);
  });

  it('已同步過的記錄沒改動時不重傳', async () => {
    await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const drive = fakeDrive();
    const engine = createSyncEngine({ drive, resolveConflicts: async () => [] });
    await engine.runSync();

    const uploadSpy = vi.spyOn(drive, 'uploadRecord');
    await engine.runSync();
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('本機刪除會把雲端那份丟進垃圾桶', async () => {
    const child = await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const drive = fakeDrive();
    const engine = createSyncEngine({ drive, resolveConflicts: async () => [] });
    await engine.runSync();
    expect(drive.files.size).toBe(1);

    await deleteChild(child.id);
    await engine.runSync();

    expect(drive.files.size).toBe(0);
    expect(await runRequest('tombstones', 'readonly', store => store.getAll())).toEqual([]);
  });

  it('雲端刪除會同步刪掉本機那份', async () => {
    await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const drive = fakeDrive();
    const engine = createSyncEngine({ drive, resolveConflicts: async () => [] });
    await engine.runSync();

    drive.files.clear();
    await engine.runSync();

    expect(await listChildren()).toEqual([]);
  });

  it('兩邊改了不同欄位時自動合併，不問使用者', async () => {
    const child = await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const drive = fakeDrive();
    const engine = createSyncEngine({
      drive,
      resolveConflicts: async () => { throw new Error('不該問使用者'); },
    });
    await engine.runSync();

    // 雲端改生日、本機改名字。
    const [fileId, file] = [...drive.files][0];
    drive.files.set(fileId, {
      ...file, hash: 'changed',
      payload: { ...file.payload, birthDate: '2024-03-03', updatedAt: '2026-09-13T07:00:00.000Z' },
    });
    await putRecord('children', { ...child, name: '改名' });

    await engine.runSync();

    const stored = (await listChildren())[0];
    expect(stored.name).toBe('改名');
    expect(stored.birthDate).toBe('2024-03-03');
  });

  it('兩邊改了同一個欄位時詢問使用者，選「保留雲端」就採雲端值', async () => {
    const child = await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const drive = fakeDrive();
    const asked = [];
    const engine = createSyncEngine({
      drive,
      resolveConflicts: async conflicts => {
        asked.push(...conflicts);
        return conflicts.map(c => ({ uid: c.uid, choice: 'cloud' }));
      },
    });
    await engine.runSync();

    const [fileId, file] = [...drive.files][0];
    drive.files.set(fileId, {
      ...file, hash: 'changed',
      payload: { ...file.payload, name: '雲端改的', updatedAt: '2026-09-13T07:00:00.000Z' },
    });
    await putRecord('children', { ...child, name: '本機改的' });

    await engine.runSync();

    expect(asked).toHaveLength(1);
    expect(asked[0].fields).toEqual([{ field: 'name', local: '本機改的', cloud: '雲端改的' }]);
    expect((await listChildren())[0].name).toBe('雲端改的');
  });

  it('選「都保留」會變成兩筆並標記待確認', async () => {
    const child = await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const drive = fakeDrive();
    const engine = createSyncEngine({
      drive,
      resolveConflicts: async conflicts => conflicts.map(c => ({ uid: c.uid, choice: 'both' })),
    });
    await engine.runSync();

    const [fileId, file] = [...drive.files][0];
    drive.files.set(fileId, {
      ...file, hash: 'changed',
      payload: { ...file.payload, name: '雲端改的', updatedAt: '2026-09-13T07:00:00.000Z' },
    });
    await putRecord('children', { ...child, name: '本機改的' });

    const status = await engine.runSync();

    const children = await listChildren();
    expect(children.map(c => c.name).sort()).toEqual(['本機改的', '雲端改的']);
    expect(children.every(c => c.needsReview === true)).toBe(true);
    expect(status.needsReview).toBe(2);
  });

  it('登入失效時停下來並回報 auth 狀態', async () => {
    await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const drive = fakeDrive();
    drive.ensureFolder = async () => { throw new AuthExpiredError('AUTH_EXPIRED'); };

    const engine = createSyncEngine({ drive, resolveConflicts: async () => [] });
    const status = await engine.runSync();

    expect(status.phase).toBe('auth');
    expect(status.error).toBe('AUTH_EXPIRED');
  });

  it('雲端資料夾格式壞掉時整個停止，不寫入任何東西', async () => {
    await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const drive = fakeDrive();
    drive.ensureFolder = async () => { throw new DriveFormatError('MANIFEST_MISSING'); };

    const engine = createSyncEngine({ drive, resolveConflicts: async () => [] });
    const status = await engine.runSync();

    expect(status.phase).toBe('format');
    expect(drive.files.size).toBe(0);
    expect((await readSyncState()).size).toBe(0);
  });

  it('連續存檔只會觸發一次同步（debounce）', async () => {
    await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const drive = fakeDrive();
    const engine = createSyncEngine({ drive, resolveConflicts: async () => [], debounceMs: 10 });
    const spy = vi.spyOn(drive, 'listCloud');

    engine.scheduleSync();
    engine.scheduleSync();
    engine.scheduleSync();
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1), { timeout: 500 });
  });
});
