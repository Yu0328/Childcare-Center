import { describe, it, expect } from 'vitest';
import {
  createDriveClient, mapWithConcurrency, DriveFormatError, AuthExpiredError, FOLDER_NAME,
} from '../src/sync/driveClient.js';

// Polyfill Blob.text() for test environments (jsdom) that don't support it yet.
if (typeof Blob !== 'undefined' && !Blob.prototype.text) {
  Blob.prototype.text = async function () {
    if (this.stream) return this.stream().getReader().read().then(r => new TextDecoder().decode(r.value));
    // Fallback for environments without stream()
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(this);
    });
  };
}

const auth = { getAccessToken: async () => 'tok' };

// A scripted fetch: each entry matches on a substring of the URL and returns a canned response.
function scriptedFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET', body: options.body });
    const route = routes.find(
      r => String(url).includes(r.match) && (!r.method || r.method === (options.method || 'GET'))
    );
    if (!route) throw new Error(`unscripted request: ${url}`);
    return {
      ok: route.status === undefined || route.status < 400,
      status: route.status || 200,
      headers: new Headers({ Date: 'Sat, 13 Sep 2026 06:32:00 GMT', ...(route.headers || {}) }),
      json: async () => route.json,
      blob: async () => route.blob,
    };
  };
  return { fetchImpl, calls };
}

describe('mapWithConcurrency', () => {
  it('不超過並行上限，且回傳每一項的結果', async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async n => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise(r => setTimeout(r, 1));
      inFlight -= 1;
      return n * 2;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(results.map(r => r.value)).toEqual([2, 4, 6, 8, 10, 12, 14]);
  });

  it('單一項失敗不會中斷其他項（一張壞照片不該拖垮整批）', async () => {
    const results = await mapWithConcurrency(['a', 'bad', 'c'], 2, async item => {
      if (item === 'bad') throw new Error('boom');
      return item.toUpperCase();
    });
    expect(results.map(r => r.ok)).toEqual([true, false, true]);
    expect(results[1].error.message).toBe('boom');
    expect(results[2].value).toBe('C');
  });
});

describe('ensureFolder', () => {
  it('資料夾不存在時建立資料夾與守門檔', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      { match: 'files?q=', json: { files: [] } },
      { match: 'drive/v3/files', method: 'POST', json: { id: 'new-folder' } },
      { match: 'upload/drive/v3/files', method: 'POST', json: { id: 'manifest-file' } },
    ]);
    const drive = createDriveClient({ auth, fetchImpl });
    expect(await drive.ensureFolder()).toBe('new-folder');
    expect(calls.some(c => c.url.includes(encodeURIComponent(FOLDER_NAME)))).toBe(true);
  });

  it('資料夾存在且守門檔正常時直接回傳 folderId', async () => {
    const { fetchImpl } = scriptedFetch([
      { match: encodeURIComponent(FOLDER_NAME), json: { files: [{ id: 'folder-1' }] } },
      { match: encodeURIComponent('sync-manifest.json'), json: { files: [{ id: 'manifest-1' }] } },
      { match: 'manifest-1?alt=media', json: { formatVersion: 1 } },
    ]);
    const drive = createDriveClient({ auth, fetchImpl });
    expect(await drive.ensureFolder()).toBe('folder-1');
  });

  it('資料夾存在但守門檔不見了 → 停止同步並報格式錯誤', async () => {
    const { fetchImpl } = scriptedFetch([
      { match: encodeURIComponent(FOLDER_NAME), json: { files: [{ id: 'folder-1' }] } },
      { match: encodeURIComponent('sync-manifest.json'), json: { files: [] } },
    ]);
    const drive = createDriveClient({ auth, fetchImpl });
    await expect(drive.ensureFolder()).rejects.toBeInstanceOf(DriveFormatError);
  });

  it('守門檔的 formatVersion 不認識 → 報格式錯誤', async () => {
    const { fetchImpl } = scriptedFetch([
      { match: encodeURIComponent(FOLDER_NAME), json: { files: [{ id: 'folder-1' }] } },
      { match: encodeURIComponent('sync-manifest.json'), json: { files: [{ id: 'manifest-1' }] } },
      { match: 'manifest-1?alt=media', json: { formatVersion: 99 } },
    ]);
    const drive = createDriveClient({ auth, fetchImpl });
    await expect(drive.ensureFolder()).rejects.toBeInstanceOf(DriveFormatError);
  });
});

describe('listCloud', () => {
  it('跨頁抓完所有檔案，分開記錄與照片，並取雲端時間', async () => {
    let page = 0;
    const fetchImpl = async url => {
      page += 1;
      const body = page === 1
        ? {
            nextPageToken: 'page2',
            files: [{
              id: 'f1', name: 'rec-u1.json',
              appProperties: { cformUid: 'u1', cformStore: 'children', cformHash: 'h1' },
            }],
          }
        : {
            files: [{ id: 'f2', name: 'photo-p1.jpg', appProperties: { cformPhotoUid: 'p1' } }],
          };
      expect(String(url)).toContain('files?q=');
      return {
        ok: true, status: 200,
        headers: new Headers({ Date: 'Sat, 13 Sep 2026 06:32:00 GMT' }),
        json: async () => body,
      };
    };

    const drive = createDriveClient({ auth, fetchImpl });
    const { records, photos, cloudNow } = await drive.listCloud('folder-1');
    expect(records.get('u1')).toEqual({ store: 'children', hash: 'h1', fileId: 'f1' });
    expect(photos.get('p1')).toEqual({ fileId: 'f2' });
    expect(new Date(cloudNow).toISOString()).toBe('2026-09-13T06:32:00.000Z');
  });
});

describe('uploadRecord / downloadRecord / trashFile', () => {
  it('新記錄用 POST 建檔，並把 uid/store/hash 存進 appProperties', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      { match: 'upload/drive/v3/files', method: 'POST', json: { id: 'new-file' } },
    ]);
    const drive = createDriveClient({ auth, fetchImpl });
    const result = await drive.uploadRecord('folder-1', {
      uid: 'u1', store: 'children', hash: 'h1', payload: { uid: 'u1', name: '測試童' },
    });
    expect(result).toEqual({ fileId: 'new-file' });
    const sent = await calls[0].body.text();
    expect(sent).toContain('"cformUid":"u1"');
    expect(sent).toContain('"cformHash":"h1"');
  });

  it('已存在的記錄用 PATCH 更新同一個檔案（讓 Drive 自己留版本歷史）', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      { match: 'upload/drive/v3/files/existing', method: 'PATCH', json: { id: 'existing' } },
    ]);
    const drive = createDriveClient({ auth, fetchImpl });
    await drive.uploadRecord('folder-1', {
      uid: 'u1', store: 'children', hash: 'h2', payload: {}, fileId: 'existing',
    });
    expect(calls[0].method).toBe('PATCH');
  });

  it('下載記錄回傳解析後的內容', async () => {
    const { fetchImpl } = scriptedFetch([
      { match: 'files/f1?alt=media', json: { uid: 'u1', name: '測試童' } },
    ]);
    const drive = createDriveClient({ auth, fetchImpl });
    expect(await drive.downloadRecord('f1')).toEqual({ uid: 'u1', name: '測試童' });
  });

  it('刪除是丟垃圾桶（保留 Drive 的 30 天還原空間），不是永久刪除', async () => {
    const { fetchImpl, calls } = scriptedFetch([{ match: 'files/f1', method: 'PATCH', json: {} }]);
    const drive = createDriveClient({ auth, fetchImpl });
    await drive.trashFile('f1');
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].body).toContain('"trashed":true');
  });

  it('401 一律當成登入失效', async () => {
    const { fetchImpl } = scriptedFetch([{ match: 'files/f1?alt=media', status: 401, json: {} }]);
    const drive = createDriveClient({ auth, fetchImpl });
    await expect(drive.downloadRecord('f1')).rejects.toBeInstanceOf(AuthExpiredError);
  });
});
