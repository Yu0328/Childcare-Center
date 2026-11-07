import { describe, it, expect } from 'vitest';
import { createDriveClient, FOLDER_NAME } from '../src/sync/driveClient.js';
import { createFakeDrive } from '../video/lib/fakeDrive.mjs';

// jsdom's Blob has no arrayBuffer(); FileReader works in both jsdom and browsers.
const readBlob = blob => new Promise(resolve => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.readAsArrayBuffer(blob);
});

// The real Drive client talking to the fake through a fetch that mimics Playwright's route hand-off.
function setup() {
  const drive = createFakeDrive();
  const fetchImpl = async (url, opts = {}) => {
    const body = opts.body == null ? null
      : Buffer.from(typeof opts.body === 'string' ? opts.body : await readBlob(opts.body));
    const res = drive.handle({ method: opts.method || 'GET', url, headers: opts.headers || {}, body });
    return new Response(res.status === 204 ? null : res.body, { status: res.status, headers: { 'Content-Type': res.contentType || 'application/json', Date: new Date().toUTCString() } });
  };
  const client = createDriveClient({ auth: { getAccessToken: async () => 'fake-token' }, fetchImpl });
  return { drive, client, fetchImpl };
}

const folders = drive => [...drive.files.values()].filter(f => f.mimeType === 'application/vnd.google-apps.folder' && !f.trashed);

describe('fake Drive behind the real driveClient', () => {
  it('ensureFolder creates one folder and returns the same id twice', async () => {
    const { drive, client } = setup();
    const a = await client.ensureFolder();
    const b = await client.ensureFolder();
    expect(b).toBe(a);
    expect(folders(drive).map(f => f.name)).toEqual([FOLDER_NAME]);
  });

  it('uploads, lists, downloads and updates a record in place', async () => {
    const { client } = setup();
    const folderId = await client.ensureFolder();
    const { fileId } = await client.uploadRecord(folderId, { uid: 'u1', store: 'children', hash: 'h1', payload: { name: '王小明' } });
    let cloud = await client.listCloud(folderId);
    expect(cloud.records.get('u1')).toEqual({ store: 'children', hash: 'h1', fileId });
    expect(await client.downloadRecord(fileId)).toEqual({ name: '王小明' });

    const again = await client.uploadRecord(folderId, { uid: 'u1', store: 'children', hash: 'h2', payload: { name: '王小明2' }, fileId });
    expect(again.fileId).toBe(fileId);
    cloud = await client.listCloud(folderId);
    expect(cloud.records.size).toBe(1);
    expect(cloud.records.get('u1').hash).toBe('h2');
    expect(await client.downloadRecord(fileId)).toEqual({ name: '王小明2' });
  });

  it('round-trips photo bytes', async () => {
    const { client } = setup();
    const folderId = await client.ensureFolder();
    const { fileId } = await client.uploadPhoto(folderId, { photoUid: 'p1', blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }) });
    expect((await client.listCloud(folderId)).photos.get('p1')).toEqual({ fileId });
    const back = await client.downloadPhoto(fileId);
    expect([...new Uint8Array(await readBlob(back))]).toEqual([1, 2, 3]);
  });

  it('trashFile hides a file from listCloud', async () => {
    const { client } = setup();
    const folderId = await client.ensureFolder();
    const { fileId } = await client.uploadRecord(folderId, { uid: 'u1', store: 'children', hash: 'h', payload: {} });
    await client.trashFile(fileId);
    expect((await client.listCloud(folderId)).records.size).toBe(0);
  });

  it('records nothing unhandled for the client, and reports an unknown request', async () => {
    const { drive, client, fetchImpl } = setup();
    const folderId = await client.ensureFolder();
    await client.uploadRecord(folderId, { uid: 'u1', store: 'children', hash: 'h', payload: {} });
    await client.listCloud(folderId);
    expect(drive.unhandled).toEqual([]);
    const res = await fetchImpl('https://www.googleapis.com/drive/v3/about');
    expect(res.status).toBe(501);
    expect(drive.unhandled).toEqual(['GET https://www.googleapis.com/drive/v3/about']);
  });
});
