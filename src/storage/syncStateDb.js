import { runRequest } from './dbCore.js';

// One syncState row per synced thing, keyed by uid: { uid, store, hash, fileId, syncedAt }.
// `hash` is the content hash of the version both sides agreed on at the last successful sync —
// the *base* of a three-way merge. Without it, "both sides differ" is indistinguishable from
// "one side changed", which is the difference between a correct merge and a silent overwrite.
// A photo's row has store: 'photo' and hash: null (photos are never edited, only added or
// replaced, so there is nothing to three-way merge).

export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function readSyncState() {
  const rows = await runRequest('syncState', 'readonly', store => store.getAll());
  return new Map(rows.map(row => [row.uid, row]));
}

export async function writeSyncState(entry) {
  await runRequest('syncState', 'readwrite', store => store.put(entry));
}

export async function deleteSyncState(uid) {
  await runRequest('syncState', 'readwrite', store => store.delete(uid));
}

export async function listTombstones() {
  return runRequest('tombstones', 'readonly', store => store.getAll());
}

export async function deleteTombstone(uid) {
  await runRequest('tombstones', 'readwrite', store => store.delete(uid));
}

// A tombstone has to outlive every device's sync interval, or a phone left in a drawer for a
// week would re-upload records this device deleted. 30 days matches how long Google Drive keeps
// trashed files and file version history, so both safety nets expire together.
export async function purgeExpiredTombstones(nowMs) {
  let purged = 0;
  for (const tombstone of await listTombstones()) {
    if (nowMs - Date.parse(tombstone.deletedAt) > TOMBSTONE_TTL_MS) {
      await deleteTombstone(tombstone.uid);
      purged += 1;
    }
  }
  return purged;
}

// Every syncState row describes agreement with one specific cloud folder. Kept in localStorage
// (not the syncState store) so readSyncState's "empty means first sync" check stays exact.
const SYNC_FOLDER_KEY = 'c-form-sync-folder-id';

// A different folder than last time — another Google account signed in on this device, or the
// folder was deleted from Drive and recreated — makes every stored base meaningless. Keeping them
// would read "local has it, cloud doesn't, base exists" as a cloud-side delete and wipe every
// local record, so the state is dropped and this sync runs as a first sync instead (everything
// local gets uploaded to the new folder).
export async function bindSyncStateToFolder(folderId) {
  const previous = localStorage.getItem(SYNC_FOLDER_KEY);
  if (previous && previous !== folderId) {
    await runRequest('syncState', 'readwrite', store => store.clear());
  }
  localStorage.setItem(SYNC_FOLDER_KEY, folderId);
}
