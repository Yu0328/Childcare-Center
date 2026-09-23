import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSyncEngine } from '../src/sync/syncEngine.js';
import { readSyncState } from '../src/storage/syncStateDb.js';
import { addChild, addForm, addEntry, listChildren, listEntriesForForm, deleteChild, clearAllData } from '../src/storage/db.js';
import { runRequest, putRecord } from '../src/storage/dbCore.js';
import {
  AuthExpiredError, DriveFormatError, createDriveClient, MAX_CONCURRENCY, FIRST_SYNC_CONCURRENCY,
} from '../src/sync/driveClient.js';
import { createGoogleAuth, writeSyncMode, clearSyncMode } from '../src/sync/googleAuth.js';

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
  localStorage.clear();
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

  it('換成另一個雲端資料夾（換 Google 帳號、或資料夾被整個刪掉重建）時，不會把本機資料當成已刪除', async () => {
    // 同一台裝置先用帳號 A 同步過（每筆都有同步基準），登出後改用帳號 B 登入：B 的雲端是空的新資料夾。
    // 若沿用 A 的同步基準，「本機有、雲端沒有、有基準」會被判成「雲端刪掉了」，把本機資料全部刪光。
    await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const driveA = fakeDrive();
    await createSyncEngine({ drive: driveA, resolveConflicts: async () => [] }).runSync();

    const driveB = { ...fakeDrive(), ensureFolder: async () => 'folder-2' };
    await createSyncEngine({ drive: driveB, resolveConflicts: async () => [] }).runSync();

    expect((await listChildren()).map(c => c.name)).toEqual(['測試童']);
    expect([...driveB.files.values()].map(f => f.payload.name)).toEqual(['測試童']);
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

  it('靜默續用失敗時回報 AUTH_EXPIRED，而不是 NETWORK', async () => {
    await addChild({ name: '測試童', birthDate: '2024-01-01' });
    writeSyncMode('google');

    // A real googleAuth + driveClient pair, wired the way wireSyncControls does it, so the actual
    // failure path (getAccessToken throwing on a failed silent resume) runs end to end instead of
    // a fake drive throwing AuthExpiredError directly.
    let gisCallback = null;
    const auth = createGoogleAuth({
      clientId: 'test-client',
      loadGis: async () => ({
        accounts: {
          oauth2: {
            initTokenClient: config => {
              gisCallback = config.callback;
              return { requestAccessToken: () => gisCallback({ error: 'access_denied' }) };
            },
          },
        },
      }),
    });
    const fetchImpl = vi.fn();
    const drive = createDriveClient({ auth, fetchImpl });
    const engine = createSyncEngine({ drive, resolveConflicts: async () => [] });

    const status = await engine.runSync();

    expect(status.phase).toBe('auth');
    expect(status.error).toBe('AUTH_EXPIRED');
    expect(fetchImpl).not.toHaveBeenCalled();
    clearSyncMode();
  });

  it('合併時若外鍵解不開會延後，不會用未合併的本機內容覆蓋雲端剛改過的欄位', async () => {
    const child = await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const form = await addForm({ childId: child.id, tier: 'Ⅱ', period: '2026-01' });
    const entry = await addEntry({ formId: form.id, indicatorCode: 'X1', date: '2026-01-01', status: 'developed' });
    const drive = fakeDrive();
    const engine = createSyncEngine({
      drive,
      resolveConflicts: async () => { throw new Error('不該問使用者'); },
    });
    await engine.runSync();

    // 雲端把這筆 entry 的 formId 改成指向一筆本機沒有的表單（外鍵解不開）；本機同時改了備註 ——
    // 兩邊改的是不同欄位，所以會走自動合併，而不是衝突畫面。
    const [entryFileId, entryFile] = [...drive.files].find(([, f]) => f.store === 'entries');
    drive.files.set(entryFileId, {
      ...entryFile, hash: 'changed',
      payload: { ...entryFile.payload, formId: 'missing-form-uid', updatedAt: '2026-09-13T07:00:00.000Z' },
    });
    await putRecord('entries', { ...entry, note: '本機改的' });

    await engine.runSync();

    // 本機沒有寫入被延後的合併結果，備註仍是本機自己改的那個值。
    expect((await listEntriesForForm(form.id))[0].note).toBe('本機改的');
    // 雲端那筆也沒被本機未合併的舊 payload 蓋掉 —— 延後的 uid 不能被當成「已解決」而重新上傳。
    expect(drive.files.get(entryFileId).payload.formId).toBe('missing-form-uid');
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

  it('這台裝置的第一次同步用比較高的並行數，一次搬完既有的大量資料', async () => {
    const drive = fakeDrive();
    let inFlight = 0;
    let peak = 0;
    const realUpload = drive.uploadRecord;
    drive.uploadRecord = async (...args) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise(r => setTimeout(r, 1));
      inFlight -= 1;
      return realUpload(...args);
    };
    for (let i = 0; i < 20; i += 1) {
      await addChild({ name: `測試童${i}`, birthDate: '2024-01-01' });
    }

    const engine = createSyncEngine({ drive, resolveConflicts: async () => [] });
    await engine.runSync();

    expect(peak).toBeGreaterThan(MAX_CONCURRENCY);
    expect(peak).toBeLessThanOrEqual(FIRST_SYNC_CONCURRENCY);
  });

  it('第一次同步過後，之後每天的同步就用平常的並行上限，不再衝高', async () => {
    const drive = fakeDrive();
    const engine = createSyncEngine({ drive, resolveConflicts: async () => [] });
    await addChild({ name: '測試童', birthDate: '2024-01-01' });
    await engine.runSync(); // 完成一次同步後 syncState 就不再是空的

    let inFlight = 0;
    let peak = 0;
    const realUpload = drive.uploadRecord;
    drive.uploadRecord = async (...args) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise(r => setTimeout(r, 1));
      inFlight -= 1;
      return realUpload(...args);
    };
    for (let i = 0; i < 20; i += 1) {
      await addChild({ name: `測試童${i}`, birthDate: '2024-01-01' });
    }
    await engine.runSync();

    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENCY);
  });
});
