// A plain, visible folder in My Drive rather than appDataFolder: the design asks for a folder the
// teacher can open in the Drive web UI and copy for herself. The drive.file scope still limits
// this app to files it created, so nothing else in her Drive is reachable.
export const FOLDER_NAME = '育英公托填表系統';
export const MANIFEST_NAME = 'sync-manifest.json';
export const FORMAT_VERSION = 1;
export const MAX_CONCURRENCY = 5;

const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

// Thrown when the cloud folder is not shaped the way this app left it (manifest deleted, or a
// formatVersion from a newer build). Everything stops: guessing whether the remaining files are
// a complete dataset is how you turn a manual mistake into silent data loss.
export class DriveFormatError extends Error {}
export class AuthExpiredError extends Error {}

// Small worker pool. One request at a time would make a first sync on a new device pay the
// round-trip latency once per record; unbounded parallelism gets rate-limited instead. Never
// rejects — a single unreadable photo is reported in its own result and the batch continues.
export async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;

  async function run() {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { item: items[index], ok: true, value: await worker(items[index]), error: null };
      } catch (error) {
        results[index] = { item: items[index], ok: false, value: null, error };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export function createDriveClient({ auth, fetchImpl = (...args) => fetch(...args) }) {
  async function request(url, options = {}) {
    const token = await auth.getAccessToken();
    const response = await fetchImpl(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
    // 403 covers a revoked grant as well as quota; both need the teacher to act, and both are
    // surfaced as the same persistent "登入已失效" warning rather than a vanishing toast.
    if (response.status === 401 || response.status === 403) throw new AuthExpiredError('AUTH_EXPIRED');
    if (!response.ok) throw new Error(`DRIVE_${response.status}`);
    return response;
  }

  async function listQuery(query) {
    const url =
      `${FILES_URL}?q=${encodeURIComponent(query)}` +
      `&fields=${encodeURIComponent('files(id,name,appProperties)')}&spaces=drive&pageSize=1000`;
    const response = await request(url);
    return (await response.json()).files || [];
  }

  // The body must be a Blob, not a concatenated string: photo bytes do not survive string
  // concatenation. Blob parts keep the binary part untouched.
  async function multipartUpload({ metadata, body, contentType, fileId }) {
    const boundary = 'cform-boundary-7f3a';
    const head =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`;
    const blob = new Blob([head, body, `\r\n--${boundary}--`], {
      type: `multipart/related; boundary=${boundary}`,
    });
    // Updating the same fileId rather than replacing the file is what gives the design's first
    // safety net for free: Drive keeps ~30 days of prior versions per file, restorable from the
    // Drive web UI with no version bookkeeping of our own.
    const url = fileId
      ? `${UPLOAD_URL}/${fileId}?uploadType=multipart&fields=id`
      : `${UPLOAD_URL}?uploadType=multipart&fields=id`;
    const response = await request(url, {
      method: fileId ? 'PATCH' : 'POST',
      body: blob,
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    });
    return (await response.json()).id;
  }

  async function ensureFolder() {
    const found = await listQuery(
      `name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`
    );
    if (found.length === 0) {
      const created = await request(`${FILES_URL}?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
      });
      const folderId = (await created.json()).id;
      await multipartUpload({
        metadata: { name: MANIFEST_NAME, parents: [folderId] },
        body: JSON.stringify({ formatVersion: FORMAT_VERSION }),
        contentType: 'application/json',
      });
      return folderId;
    }

    const folderId = found[0].id;
    const manifests = await listQuery(
      `name='${MANIFEST_NAME}' and '${folderId}' in parents and trashed=false`
    );
    if (manifests.length === 0) throw new DriveFormatError('MANIFEST_MISSING');
    const manifest = await (await request(`${FILES_URL}/${manifests[0].id}?alt=media`)).json();
    if (!manifest || manifest.formatVersion !== FORMAT_VERSION) throw new DriveFormatError('MANIFEST_VERSION');
    return folderId;
  }

  async function listCloud(folderId) {
    const records = new Map();
    const photos = new Map();
    let pageToken = '';
    let cloudNow = null;

    do {
      const query = `'${folderId}' in parents and trashed=false`;
      const url =
        `${FILES_URL}?q=${encodeURIComponent(query)}` +
        `&fields=${encodeURIComponent('nextPageToken,files(id,name,appProperties)')}` +
        `&spaces=drive&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`;
      const response = await request(url);
      // The cloud's own clock, taken from the response header. A device whose clock has drifted
      // would otherwise label a sync with a time that is simply wrong.
      cloudNow = cloudNow || response.headers.get('Date');
      const body = await response.json();

      for (const file of body.files || []) {
        const props = file.appProperties || {};
        if (props.cformPhotoUid) {
          photos.set(props.cformPhotoUid, { fileId: file.id });
        } else if (props.cformUid) {
          records.set(props.cformUid, { store: props.cformStore, hash: props.cformHash, fileId: file.id });
        }
        // Anything else (the manifest, or a file the teacher dropped in herself) is ignored.
      }
      pageToken = body.nextPageToken || '';
    } while (pageToken);

    return { records, photos, cloudNow: cloudNow || new Date().toISOString() };
  }

  // The content hash rides along in appProperties so one files.list answers "what changed" for
  // the entire dataset without downloading a single record.
  async function uploadRecord(folderId, { uid, store, hash, payload, fileId }) {
    const metadata = fileId
      ? { appProperties: { cformUid: uid, cformStore: store, cformHash: hash } }
      : {
          name: `rec-${uid}.json`,
          parents: [folderId],
          appProperties: { cformUid: uid, cformStore: store, cformHash: hash },
        };
    const id = await multipartUpload({
      metadata, body: JSON.stringify(payload), contentType: 'application/json', fileId,
    });
    return { fileId: id };
  }

  async function downloadRecord(fileId) {
    return (await request(`${FILES_URL}/${fileId}?alt=media`)).json();
  }

  async function uploadPhoto(folderId, { photoUid, blob, fileId }) {
    const metadata = fileId
      ? { appProperties: { cformPhotoUid: photoUid } }
      : { name: `photo-${photoUid}.jpg`, parents: [folderId], appProperties: { cformPhotoUid: photoUid } };
    const id = await multipartUpload({
      metadata, body: blob, contentType: blob.type || 'image/jpeg', fileId,
    });
    return { fileId: id };
  }

  async function downloadPhoto(fileId) {
    return (await request(`${FILES_URL}/${fileId}?alt=media`)).blob();
  }

  async function trashFile(fileId) {
    await request(`${FILES_URL}/${fileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    });
  }

  return { ensureFolder, listCloud, uploadRecord, downloadRecord, uploadPhoto, downloadPhoto, trashFile };
}
