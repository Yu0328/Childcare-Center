import { runRequest, newUid } from '../storage/dbCore.js';
import { SYNC_STORES, serializeRecord, deserializeRecord, hashPayload, PHOTO_STORE } from './syncStores.js';

function refKey(store, value) {
  return `${store}:${value}`;
}

// Deliberately bypasses dbCore's gates: backfilling a uid, adopting a cloud uid, and applying a
// record the cloud already has must not bump updatedAt (that would make the record look
// locally-modified and bounce straight back up as a fake change) and must not fire the write
// listener (that would schedule another sync from inside a sync).
function rawPut(storeName, record) {
  return runRequest(storeName, 'readwrite', store => store.put(record));
}

export async function readLocalSnapshot() {
  const records = new Map();
  const uidById = new Map();
  const idByUid = new Map();

  const rows = new Map();
  for (const { store } of SYNC_STORES) {
    const all = await runRequest(store, 'readonly', objectStore => objectStore.getAll());
    rows.set(store, all);

    for (const row of all) {
      // Records written before the uid gate existed get one now. updatedAt falls back to
      // createdAt (or the epoch) rather than "now": stamping now would claim every pre-existing
      // record was just edited, and on a first sync between two such devices that would turn
      // every single record into a two-sided conflict.
      if (!row.uid || !row.updatedAt) {
        row.uid = row.uid || newUid();
        row.updatedAt = row.updatedAt || row.createdAt || new Date(0).toISOString();
        await rawPut(store, row);
      }
      // 點滴分享 photos added before this backfill existed never got a photoUid at all (the UI
      // never assigned one) — every sync lookup keys on it, so such a photo was invisible to
      // upload/download forever. Each device mints its own fresh id here, so a photo already
      // broken on more than one device becomes two separate Drive files rather than merging into
      // one; that's a one-time cost of healing already-broken history, not an ongoing issue.
      if (store === PHOTO_STORE && (row.photos || []).some(photo => photo && !photo.photoUid)) {
        row.photos = row.photos.map(photo =>
          photo && !photo.photoUid ? { ...photo, photoUid: newUid() } : photo
        );
        await rawPut(store, row);
      }
      uidById.set(refKey(store, row.id), row.uid);
      idByUid.set(refKey(store, row.uid), row.id);
    }
  }

  const uidOf = (store, id) => uidById.get(refKey(store, id));

  for (const { store } of SYNC_STORES) {
    for (const row of rows.get(store)) {
      const payload = serializeRecord(store, row, uidOf);
      records.set(row.uid, { store, id: row.id, payload, hash: await hashPayload(payload), record: row });
    }
  }

  return { records, uidById, idByUid };
}

// Writes one downloaded record straight to IndexedDB — one at a time, each independently
// complete, so a sync interrupted halfway (a phone that loses signal mid-download on its first
// sign-in) keeps everything it already got and only fetches the rest next time.
export async function applyRemoteRecord({ store, uid, payload }, snapshot) {
  const idOf = (refStore, refUid) => snapshot.idByUid.get(refKey(refStore, refUid));
  const existingId = snapshot.idByUid.get(refKey(store, uid));
  const existing = existingId === undefined
    ? undefined
    : await runRequest(store, 'readonly', objectStore => objectStore.get(existingId));

  const record = deserializeRecord(store, payload, idOf, existing && existing.photos);
  if (record === null) return 'deferred';

  record.uid = uid;
  let finalId = existingId;
  if (existingId === undefined) {
    finalId = await runRequest(store, 'readwrite', objectStore => objectStore.add(record));
  } else {
    await rawPut(store, { ...existing, ...record, id: existingId });
  }

  snapshot.uidById.set(refKey(store, finalId), uid);
  snapshot.idByUid.set(refKey(store, uid), finalId);
  snapshot.records.set(uid, {
    store,
    id: finalId,
    payload,
    hash: await hashPayload(payload),
    record: { ...record, id: finalId },
  });
  return 'written';
}

// No tombstone: this delete is us carrying out a delete another device already recorded, and a
// tombstone here would race back as a fresh instruction to delete on that device too.
export async function deleteLocalByUid(store, uid, snapshot) {
  const id = snapshot.idByUid.get(refKey(store, uid));
  if (id === undefined) return;
  await runRequest(store, 'readwrite', objectStore => objectStore.delete(id));
  snapshot.idByUid.delete(refKey(store, uid));
  snapshot.uidById.delete(refKey(store, id));
  snapshot.records.delete(uid);
}

// First sign-in only: this device and the cloud each invented their own uid for what is really
// the same record (both were kept in step by hand-carried backups). Swapping the local uid for
// the cloud one is all it takes — every local foreign key points at the local integer id, not
// the uid, so nothing downstream needs rewriting.
export async function adoptUid(store, id, cloudUid, snapshot) {
  const existing = await runRequest(store, 'readonly', objectStore => objectStore.get(id));
  if (!existing) return;
  const oldUid = existing.uid;
  await rawPut(store, { ...existing, uid: cloudUid });

  const entry = snapshot.records.get(oldUid);
  snapshot.records.delete(oldUid);
  snapshot.idByUid.delete(refKey(store, oldUid));
  if (entry) {
    entry.payload = { ...entry.payload, uid: cloudUid };
    entry.hash = await hashPayload(entry.payload);
    entry.record = { ...entry.record, uid: cloudUid };
    snapshot.records.set(cloudUid, entry);
  }
  snapshot.uidById.set(refKey(store, id), cloudUid);
  snapshot.idByUid.set(refKey(store, cloudUid), id);
}

export { PHOTO_STORE };
