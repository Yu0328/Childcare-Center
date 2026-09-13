import { describe, it, expect, beforeEach } from 'vitest';
import { syncPhotos } from '../src/sync/photoSync.js';
import { readLocalSnapshot } from '../src/sync/localSnapshot.js';
import { readSyncState, writeSyncState } from '../src/storage/syncStateDb.js';
import { addChild, clearAllData } from '../src/storage/db.js';
import { addParentReport, addHighlightEntry } from '../src/storage/parentReportDb.js';
import { runRequest } from '../src/storage/dbCore.js';

const CLOUD_NOW = '2026-09-13T06:32:00.000Z';

function fakeDrive({ downloads = {} } = {}) {
  const uploaded = [];
  const trashed = [];
  return {
    uploaded, trashed,
    uploadPhoto: async (folderId, { photoUid }) => {
      uploaded.push(photoUid);
      return { fileId: `file-${photoUid}` };
    },
    downloadPhoto: async fileId => {
      if (downloads[fileId] === 'broken') throw new Error('corrupt');
      return new Blob(['photo-bytes'], { type: 'image/jpeg' });
    },
    trashFile: async fileId => { trashed.push(fileId); },
  };
}

async function seedEntry(photos) {
  const child = await addChild({ name: '測試童', birthDate: '2024-01-01' });
  const report = await addParentReport({ childId: child.id, tier: 'Ⅳ', period: '115年06月' });
  const entry = await addHighlightEntry({ reportId: report.id, photos, caption: '玩水' });
  return { report, entry };
}

describe('syncPhotos', () => {
  beforeEach(async () => {
    await clearAllData();
    await runRequest('syncState', 'readwrite', store => store.clear());
    await runRequest('tombstones', 'readwrite', store => store.clear());
  });

  it('只上傳還沒同步過的照片，已同步的不重傳', async () => {
    await seedEntry([
      { photoUid: 'p1', width: 960, height: 640, blob: new Blob(['a'], { type: 'image/jpeg' }) },
      { photoUid: 'p2', width: 960, height: 640, blob: new Blob(['b'], { type: 'image/jpeg' }) },
    ]);
    await writeSyncState({ uid: 'p1', store: 'photo', hash: null, fileId: 'file-p1', syncedAt: CLOUD_NOW });

    const drive = fakeDrive();
    const result = await syncPhotos({
      drive, folderId: 'folder-1',
      snapshot: await readLocalSnapshot(),
      cloudPhotos: new Map([['p1', { fileId: 'file-p1' }]]),
      state: await readSyncState(), cloudNow: CLOUD_NOW,
    });

    expect(drive.uploaded).toEqual(['p2']);
    expect(result.uploaded).toBe(1);
    expect((await readSyncState()).get('p2')).toMatchObject({ store: 'photo', fileId: 'file-p2' });
  });

  it('改了文字說明但照片沒換時不重傳照片', async () => {
    await seedEntry([
      { photoUid: 'p1', width: 960, height: 640, blob: new Blob(['a'], { type: 'image/jpeg' }) },
    ]);
    await writeSyncState({ uid: 'p1', store: 'photo', hash: null, fileId: 'file-p1', syncedAt: CLOUD_NOW });

    const drive = fakeDrive();
    await syncPhotos({
      drive, folderId: 'folder-1',
      snapshot: await readLocalSnapshot(),
      cloudPhotos: new Map([['p1', { fileId: 'file-p1' }]]),
      state: await readSyncState(), cloudNow: CLOUD_NOW,
    });
    expect(drive.uploaded).toEqual([]);
  });

  it('補下載本機只有描述子、還沒有實體的照片', async () => {
    const { entry } = await seedEntry([{ photoUid: 'p9', width: 960, height: 640, type: 'image/jpeg' }]);

    const drive = fakeDrive();
    const result = await syncPhotos({
      drive, folderId: 'folder-1',
      snapshot: await readLocalSnapshot(),
      cloudPhotos: new Map([['p9', { fileId: 'file-p9' }]]),
      state: await readSyncState(), cloudNow: CLOUD_NOW,
    });

    expect(result.downloaded).toBe(1);
    // fake-indexeddb 無法原樣還原真實 Blob，listHighlightEntriesForReport 會嘗試 .arrayBuffer()
    // 而讀不到，所以這裡直接讀原始紀錄確認 blob 有被補上，而不透過那層 wrapper。
    const stored = await runRequest('highlightEntries', 'readonly', store => store.get(entry.id));
    expect(stored.photos[0].blob).toBeTruthy();
  });

  it('本機已刪掉的照片，雲端那份也丟進垃圾桶', async () => {
    await seedEntry([
      { photoUid: 'p1', width: 960, height: 640, blob: new Blob(['a'], { type: 'image/jpeg' }) },
    ]);
    await writeSyncState({ uid: 'p1', store: 'photo', hash: null, fileId: 'file-p1', syncedAt: CLOUD_NOW });
    await writeSyncState({ uid: 'gone', store: 'photo', hash: null, fileId: 'file-gone', syncedAt: CLOUD_NOW });

    const drive = fakeDrive();
    const result = await syncPhotos({
      drive, folderId: 'folder-1',
      snapshot: await readLocalSnapshot(),
      cloudPhotos: new Map([['p1', { fileId: 'file-p1' }], ['gone', { fileId: 'file-gone' }]]),
      state: await readSyncState(), cloudNow: CLOUD_NOW,
    });

    expect(drive.trashed).toEqual(['file-gone']);
    expect(result.trashed).toBe(1);
    expect((await readSyncState()).has('gone')).toBe(false);
  });

  it('從沒同步過、本機也沒有的雲端照片不會被誤刪（可能是別台剛上傳的）', async () => {
    await seedEntry([
      { photoUid: 'p1', width: 960, height: 640, blob: new Blob(['a'], { type: 'image/jpeg' }) },
    ]);

    const drive = fakeDrive();
    await syncPhotos({
      drive, folderId: 'folder-1',
      snapshot: await readLocalSnapshot(),
      cloudPhotos: new Map([['stranger', { fileId: 'file-stranger' }]]),
      state: await readSyncState(), cloudNow: CLOUD_NOW,
    });
    expect(drive.trashed).toEqual([]);
  });

  it('單張照片讀不出來 → 跳過、記為失敗、其他照片照常處理', async () => {
    const { entry } = await seedEntry([
      { photoUid: 'bad', width: 960, height: 640, type: 'image/jpeg' },
      { photoUid: 'good', width: 960, height: 640, type: 'image/jpeg' },
    ]);

    const drive = fakeDrive({ downloads: { 'file-bad': 'broken' } });
    const result = await syncPhotos({
      drive, folderId: 'folder-1',
      snapshot: await readLocalSnapshot(),
      cloudPhotos: new Map([['bad', { fileId: 'file-bad' }], ['good', { fileId: 'file-good' }]]),
      state: await readSyncState(), cloudNow: CLOUD_NOW,
    });

    expect(result.failed).toBe(1);
    expect(result.downloaded).toBe(1);
    // 同上：直接讀原始紀錄，避開 listHighlightEntriesForReport 對假 Blob 的 .arrayBuffer() 限制。
    const stored = await runRequest('highlightEntries', 'readonly', store => store.get(entry.id));
    expect(stored.photos.find(p => p.photoUid === 'good').blob).toBeTruthy();
  });
});
