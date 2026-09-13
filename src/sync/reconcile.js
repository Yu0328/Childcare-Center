import { SYNC_STORES, canonicalJson, storeSpec } from './syncStores.js';

// Fields that say nothing about whether two records hold the same information.
const IGNORED_FIELDS = new Set(['uid', 'updatedAt', 'isNew', 'createdAt']);

function comparable(payload) {
  return canonicalJson(
    Object.fromEntries(Object.entries(payload).filter(([key]) => !IGNORED_FIELDS.has(key)))
  );
}

// Rewrites a payload's foreign keys through the adoptions decided so far, so a child record's
// natural key is expressed in the cloud's uids before being looked up.
function remapRefs(storeName, payload, adopt) {
  const { refs } = storeSpec(storeName);
  const remapped = { ...payload };
  for (const [field, ref] of Object.entries(refs)) {
    const value = payload[field];
    if (ref.kind === 'id') {
      remapped[field] = adopt.get(value) || value;
    } else if (ref.kind === 'idArray') {
      remapped[field] = (value || []).map(uid => adopt.get(uid) || uid);
    } else {
      remapped[field] = Object.fromEntries(
        Object.entries(value || {}).map(([uid, inner]) => [adopt.get(uid) || uid, inner])
      );
    }
  }
  return remapped;
}

// Runs once, on a device's first sign-in, when there is no sync state to tell local and cloud
// records apart. Both sides invented their own uid for records the teacher kept in step by
// hand-carried backup files, so without this pass every record would look cloud-only *and*
// local-only and the first sync would silently duplicate the entire dataset.
//
// Matching walks SYNC_STORES in dependency order because a child record's natural key contains
// its parent's uid: the parent has to be paired up first for the child's key to line up at all.
// That ordering is also what stops two different children's forms being confused for each other.
export function reconcileByNaturalKey({ localRecords, cloudRecords }) {
  const adopt = new Map();
  const differing = [];

  for (const { store, naturalKey } of SYNC_STORES) {
    const cloudByKey = new Map();
    for (const [uid, entry] of cloudRecords) {
      if (entry.store !== store) continue;
      cloudByKey.set(naturalKey(entry.payload), uid);
    }

    for (const [uid, entry] of localRecords) {
      if (entry.store !== store) continue;
      const localPayload = remapRefs(store, entry.payload, adopt);
      const cloudUid = cloudByKey.get(naturalKey(localPayload));
      if (!cloudUid || cloudUid === uid) continue;

      adopt.set(uid, cloudUid);
      if (comparable(localPayload) !== comparable(cloudRecords.get(cloudUid).payload)) {
        differing.push({ localUid: uid, cloudUid, store });
      }
    }
  }

  return { adopt, differing };
}
