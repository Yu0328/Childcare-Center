import { newUid, runRequest, putRecord } from '../storage/dbCore.js';
import {
  readSyncState, writeSyncState, deleteSyncState,
  listTombstones, deleteTombstone, purgeExpiredTombstones,
} from '../storage/syncStateDb.js';
import { readLocalSnapshot, applyRemoteRecord, deleteLocalByUid, adoptUid } from './localSnapshot.js';
import { SYNC_STORES, hashPayload, PHOTO_STORE } from './syncStores.js';
import { planSync } from './diff.js';
import { mergeFields } from './fieldMerge.js';
import { reconcileByNaturalKey } from './reconcile.js';
import { mapWithConcurrency, MAX_CONCURRENCY, AuthExpiredError, DriveFormatError } from './driveClient.js';
import { syncPhotos } from './photoSync.js';

const STORE_ORDER = new Map(SYNC_STORES.map((spec, index) => [spec.store, index]));

function byDependencyOrder(a, b) {
  return STORE_ORDER.get(a.store) - STORE_ORDER.get(b.store);
}

export function createSyncEngine({ drive, resolveConflicts, onStatus = () => {}, debounceMs = 2000 }) {
  let status = {
    phase: 'idle', textSyncedAt: null, photoSyncedAt: null, photoPending: 0, needsReview: 0, error: null,
  };
  let running = null;
  let debounceTimer = null;

  function setStatus(changes) {
    status = { ...status, ...changes };
    onStatus(status);
    return status;
  }

  // The payload itself, not just its hash, is the base of the next three-way merge: without it
  // there is no way to tell "only the cloud changed this field" from a real disagreement.
  async function persistBase(uid, store, payload, fileId, cloudNow) {
    await writeSyncState({
      uid, store, hash: await hashPayload(payload), base: payload, fileId, syncedAt: cloudNow,
    });
  }

  // 都保留 = two records, both flagged so the teacher can sort them out later. The design is
  // explicit that the system must not guess a combined result.
  async function keepBoth(uid, store, cloudPayload, snapshot) {
    const localEntry = snapshot.records.get(uid);
    if (localEntry) {
      const stored = await runRequest(store, 'readonly', objectStore => objectStore.get(localEntry.id));
      if (stored) await putRecord(store, { ...stored, needsReview: true });
    }
    const freshUid = newUid();
    await applyRemoteRecord(
      { store, uid: freshUid, payload: { ...cloudPayload, uid: freshUid, needsReview: true } },
      snapshot
    );
  }

  async function runOnce() {
    setStatus({ phase: 'syncing', error: null });

    const folderId = await drive.ensureFolder();
    await purgeExpiredTombstones(Date.now());

    let snapshot = await readLocalSnapshot();
    let state = await readSyncState();
    const { records: cloudRecords, photos: cloudPhotos, cloudNow } = await drive.listCloud(folderId);

    // First sign-in on this device: no base for anything, so uids invented independently on each
    // side have to be matched up by natural key first or the sync duplicates the whole dataset.
    const recordState = new Map([...state].filter(([, row]) => row.store !== 'photo'));
    if (recordState.size === 0 && snapshot.records.size > 0 && cloudRecords.size > 0) {
      const cloudPayloads = new Map();
      await mapWithConcurrency([...cloudRecords], MAX_CONCURRENCY, async ([uid, cloudEntry]) => {
        cloudPayloads.set(uid, {
          store: cloudEntry.store, payload: await drive.downloadRecord(cloudEntry.fileId),
        });
      });

      const { adopt } = reconcileByNaturalKey({
        localRecords: new Map([...snapshot.records].map(([uid, e]) => [uid, { store: e.store, payload: e.payload }])),
        cloudRecords: cloudPayloads,
      });
      for (const [localUid, cloudUid] of adopt) {
        const entry = snapshot.records.get(localUid);
        if (entry) await adoptUid(entry.store, entry.id, cloudUid, snapshot);
      }
      // Adoption rewrote uids, so the payloads and indexes have to be rebuilt before diffing.
      if (adopt.size > 0) snapshot = await readLocalSnapshot();
    }

    const plan = planSync({
      local: snapshot.records, cloud: cloudRecords, state, tombstones: await listTombstones(),
    });

    // --- downloads (cloud-only or cloud-newer) ---
    const downloadTargets = plan.downloads.map(uid => ({ uid, ...cloudRecords.get(uid) }));
    const fetched = await mapWithConcurrency(downloadTargets, MAX_CONCURRENCY, async target => ({
      ...target, payload: await drive.downloadRecord(target.fileId),
    }));

    // Applied in dependency order, then retried once, because a record whose parent arrives later
    // in the same batch defers rather than writing a dangling reference.
    let pendingApply = fetched.filter(r => r.ok).map(r => r.value).sort(byDependencyOrder);
    for (let pass = 0; pass < 2 && pendingApply.length > 0; pass += 1) {
      const deferred = [];
      for (const item of pendingApply) {
        const outcome = await applyRemoteRecord(
          { store: item.store, uid: item.uid, payload: item.payload }, snapshot
        );
        if (outcome === 'deferred') deferred.push(item);
        else await persistBase(item.uid, item.store, item.payload, item.fileId, cloudNow);
      }
      pendingApply = deferred;
    }

    // --- merges (both sides changed since the last agreed base) ---
    const mergeTargets = plan.merges.map(uid => ({ uid, ...cloudRecords.get(uid) }));
    const mergeFetched = await mapWithConcurrency(mergeTargets, MAX_CONCURRENCY, async target => ({
      ...target, payload: await drive.downloadRecord(target.fileId),
    }));

    // Bookkeeping fields carry no content of their own — every edit re-stamps `updatedAt`, so
    // diffing it field-by-field would manufacture a "conflict" out of every genuine edit, even
    // ones whose actual fields don't clash at all. (Whatever value survives here is moot anyway:
    // this record gets re-uploaded below, so both sides converge on one value regardless.)
    const IGNORED_MERGE_FIELDS = new Set(['uid', 'updatedAt', 'isNew', 'createdAt']);
    const omitIgnored = payload =>
      Object.fromEntries(Object.entries(payload).filter(([key]) => !IGNORED_MERGE_FIELDS.has(key)));

    const conflicts = [];
    const autoMerged = [];
    for (const result of mergeFetched) {
      if (!result.ok) continue;
      const { uid, store, fileId, payload: cloudPayload } = result.value;
      const localEntry = snapshot.records.get(uid);
      if (!localEntry) continue;
      const stateRow = state.get(uid);
      const base = stateRow ? stateRow.base || null : null;
      const { merged, conflicts: clashes } = mergeFields(
        base && omitIgnored(base), omitIgnored(localEntry.payload), omitIgnored(cloudPayload),
        { unionArrayFields: store === PHOTO_STORE ? ['photos'] : [] }
      );
      if (clashes.length === 0) {
        autoMerged.push({ uid, store, fileId, merged: { ...localEntry.payload, ...merged } });
      } else {
        conflicts.push({
          uid, store, fileId, fields: clashes, localPayload: localEntry.payload, cloudPayload,
        });
      }
    }

    for (const item of autoMerged.sort(byDependencyOrder)) {
      await applyRemoteRecord({ store: item.store, uid: item.uid, payload: item.merged }, snapshot);
    }

    if (conflicts.length > 0) {
      const answers = await resolveConflicts(conflicts.map(c => ({
        uid: c.uid, store: c.store, fields: c.fields, localPayload: c.localPayload, cloudPayload: c.cloudPayload,
      })));
      const choices = new Map(answers.map(answer => [answer.uid, answer.choice]));
      for (const conflict of conflicts.sort(byDependencyOrder)) {
        const choice = choices.get(conflict.uid) || 'local';
        if (choice === 'cloud') {
          await applyRemoteRecord(
            { store: conflict.store, uid: conflict.uid, payload: conflict.cloudPayload }, snapshot
          );
        } else if (choice === 'both') {
          await keepBoth(conflict.uid, conflict.store, conflict.cloudPayload, snapshot);
        }
        // 'local' needs no local write; the upload pass below pushes it to the cloud.
      }
      snapshot = await readLocalSnapshot();
    }

    // --- uploads (local-only, local-newer, and everything a merge/conflict just settled) ---
    const settledUids = [...autoMerged, ...conflicts].map(item => item.uid);
    const uploadUids = new Set([...plan.creates, ...plan.uploads, ...settledUids]);
    // 都保留 minted brand-new uids; they are in neither the plan nor the state, so pick them up
    // by scanning for records the cloud has never seen.
    for (const [uid] of snapshot.records) {
      if (!state.has(uid) && !cloudRecords.has(uid)) uploadUids.add(uid);
    }

    const uploadTargets = [...uploadUids]
      .map(uid => {
        const entry = snapshot.records.get(uid);
        if (!entry) return null;
        const known = state.get(uid) || cloudRecords.get(uid);
        return { uid, store: entry.store, payload: entry.payload, fileId: known && known.fileId };
      })
      .filter(Boolean);

    const uploaded = await mapWithConcurrency(uploadTargets, MAX_CONCURRENCY, async target => {
      const hash = await hashPayload(target.payload);
      const { fileId } = await drive.uploadRecord(folderId, {
        uid: target.uid, store: target.store, hash, payload: target.payload, fileId: target.fileId,
      });
      await persistBase(target.uid, target.store, target.payload, fileId, cloudNow);
    });

    // --- deletes both ways ---
    await mapWithConcurrency(plan.trashes, MAX_CONCURRENCY, async ({ uid, fileId }) => {
      await drive.trashFile(fileId);
      await deleteSyncState(uid);
      await deleteTombstone(uid);
    });
    // A tombstone whose cloud file is already gone has done its job.
    for (const tombstone of await listTombstones()) {
      if (!cloudRecords.has(tombstone.uid)) await deleteTombstone(tombstone.uid);
    }

    for (const uid of plan.localDeletes) {
      const entry = snapshot.records.get(uid);
      if (entry) await deleteLocalByUid(entry.store, uid, snapshot);
      await deleteSyncState(uid);
    }

    // Records already identical on both sides still need a base row, or the next sync with a
    // one-sided edit would see "no base" and escalate it to a conflict.
    for (const uid of plan.upToDate) {
      const stateRow = state.get(uid);
      if (stateRow && stateRow.base) continue;
      const entry = snapshot.records.get(uid);
      const cloudEntry = cloudRecords.get(uid);
      if (entry && cloudEntry) await persistBase(uid, entry.store, entry.payload, cloudEntry.fileId, cloudNow);
    }

    // --- photos ---
    state = await readSyncState();
    snapshot = await readLocalSnapshot();
    const photoResult = await syncPhotos({ drive, folderId, snapshot, cloudPhotos, state, cloudNow });

    const needsReview = [...snapshot.records.values()].filter(entry => entry.record.needsReview).length;
    const textFailed = [...fetched, ...mergeFetched, ...uploaded].some(result => !result.ok);

    return setStatus({
      phase: 'done',
      textSyncedAt: textFailed ? status.textSyncedAt : cloudNow,
      photoSyncedAt: photoResult.failed > 0 ? status.photoSyncedAt : cloudNow,
      photoPending: photoResult.failed,
      needsReview,
      error: textFailed ? 'NETWORK' : null,
    });
  }

  async function runSync() {
    // Overlapping syncs would read a snapshot the other one is midway through changing, so a
    // second call just waits for the one in flight.
    if (running) return running;
    running = (async () => {
      try {
        return await runOnce();
      } catch (err) {
        if (err instanceof AuthExpiredError) return setStatus({ phase: 'auth', error: 'AUTH_EXPIRED' });
        if (err instanceof DriveFormatError) return setStatus({ phase: 'format', error: 'FORMAT' });
        return setStatus({ phase: 'error', error: 'NETWORK' });
      } finally {
        running = null;
      }
    })();
    return running;
  }

  // Every keystroke-driven save would otherwise be its own round trip.
  function scheduleSync() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      runSync();
    }, debounceMs);
  }

  return { runSync, scheduleSync, getStatus: () => status };
}
