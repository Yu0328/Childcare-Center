// The 13 stores that sync, in dependency order (a parent always before its children). Every
// sync step — download, reconcile, apply — walks this array in order, which is what guarantees a
// record's foreign keys can already be resolved by the time it is written locally.
//
// `refs` names the foreign-key fields and what they point at. Locally these hold IndexedDB
// autoIncrement ints, which mean nothing on another device, so they are rewritten to uids on the
// way out and back to local ints on the way in.
//
// `naturalKey` is used only on first sign-in (see reconcile.js): two devices kept in step by
// hand-carried backup files hold two different uids for the same logical record, and the natural
// key is how they get recognised as one record instead of silently duplicating. It runs on the
// uid-form payload, so a child record's key is stable even though the parent's local id differs
// per device.
const CHILD_REF = { store: 'children', kind: 'id' };
const REPORT_REF = { store: 'parentReports', kind: 'id' };

export const SYNC_STORES = [
  { store: 'children', refs: {}, naturalKey: r => `${r.name}|${r.birthDate}` },
  { store: 'forms', refs: { childId: CHILD_REF }, naturalKey: r => `${r.childId}|${r.tier}|${r.period}` },
  {
    store: 'entries',
    refs: { formId: { store: 'forms', kind: 'id' } },
    naturalKey: r => `${r.formId}|${r.indicatorCode}|${r.date}`,
  },
  { store: 'parentReports', refs: { childId: CHILD_REF }, naturalKey: r => `${r.childId}|${r.tier}|${r.period}` },
  {
    store: 'coursePlanEntries',
    refs: { reportId: REPORT_REF },
    naturalKey: r => `${r.reportId}|${r.indicatorCode}|${r.activityName}`,
  },
  {
    store: 'courseOccurrences',
    refs: { entryId: { store: 'coursePlanEntries', kind: 'id' } },
    naturalKey: r => `${r.entryId}|${r.date}`,
  },
  {
    store: 'developmentRecordEntries',
    refs: { reportId: REPORT_REF, courseEntryIds: { store: 'coursePlanEntries', kind: 'idArray' } },
    naturalKey: r => `${r.reportId}|${r.domain}`,
  },
  { store: 'behaviorObservations', refs: { reportId: REPORT_REF }, naturalKey: r => `${r.reportId}|${r.title}` },
  { store: 'highlightEntries', refs: { reportId: REPORT_REF }, naturalKey: r => `${r.reportId}|${r.caption}` },
  {
    store: 'monthlyCoursePlans',
    refs: {
      childIds: { store: 'children', kind: 'idArray' },
      childTiers: { store: 'children', kind: 'idKeyObject' },
    },
    naturalKey: r => r.period,
  },
  {
    store: 'planSlots',
    refs: { planId: { store: 'monthlyCoursePlans', kind: 'id' } },
    naturalKey: r => `${r.planId}|${r.tier}|${r.weekIndex}|${r.weekday}`,
  },
  {
    store: 'planSlotItems',
    // A 個別項目 carries childId; a shared one has no such field, so its key stays what it always was.
    refs: { slotId: { store: 'planSlots', kind: 'id' }, childId: CHILD_REF },
    naturalKey: r => (r.childId === undefined ? `${r.slotId}|${r.activityName}` : `${r.slotId}|${r.activityName}|${r.childId}`),
  },
  {
    store: 'childItemOverrides',
    refs: {
      planId: { store: 'monthlyCoursePlans', kind: 'id' },
      childId: CHILD_REF,
      itemId: { store: 'planSlotItems', kind: 'id' },
    },
    naturalKey: r => `${r.planId}|${r.childId}|${r.itemId}`,
  },
];

export const PHOTO_STORE = 'highlightEntries';

const STORE_SPECS = new Map(SYNC_STORES.map(spec => [spec.store, spec]));

export function storeSpec(storeName) {
  const spec = STORE_SPECS.get(storeName);
  if (!spec) throw new Error(`Unknown sync store: ${storeName}`);
  return spec;
}

// Key-sorted stringify. Two devices must produce byte-identical JSON for identical data or every
// hash comparison reports a difference that isn't there — and IndexedDB makes no guarantee that
// property order survives a write/read round trip.
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).filter(key => value[key] !== undefined).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

// Every sync re-reads the whole local dataset (at least twice, plus a poll every 2 minutes), and
// SHA-256 was ~60% of that time — 10k records took ~0.8s here, several times that on an old iPad.
// A record that hasn't changed produces the same JSON, so its hash is reused instead of recomputed.
// Keyed by the JSON itself, so a changed record can never pick up a stale hash. Two generations,
// rotated per snapshot (startHashGeneration), keep memory at about two snapshots' worth instead of
// every version ever hashed.
let hashCache = new Map();
let previousHashCache = new Map();

export function startHashGeneration() {
  previousHashCache = hashCache;
  hashCache = new Map();
}

export async function hashPayload(payload) {
  const json = canonicalJson(payload);
  const cached = hashCache.get(json) ?? previousHashCache.get(json);
  if (cached) {
    hashCache.set(json, cached);
    return cached;
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  hashCache.set(json, hash);
  return hash;
}

export function serializeRecord(storeName, record, uidOf) {
  const { refs } = storeSpec(storeName);
  const payload = {};

  for (const [key, value] of Object.entries(record)) {
    if (key === 'id') continue;
    const ref = refs[key];
    if (!ref) {
      payload[key] = value;
      continue;
    }
    if (ref.kind === 'id') {
      payload[key] = uidOf(ref.store, value);
    } else if (ref.kind === 'idArray') {
      payload[key] = (value || []).map(id => uidOf(ref.store, id)).filter(uid => uid !== undefined);
    } else {
      payload[key] = Object.fromEntries(
        Object.entries(value || {})
          .map(([id, inner]) => [uidOf(ref.store, Number(id)), inner])
          .filter(([uid]) => uid !== undefined)
      );
    }
  }

  // Photo bytes travel as their own Drive files, so the record only carries descriptors. The
  // descriptor list doubles as the authoritative answer to "which photos should exist", which is
  // how photoSync tells a photo still being downloaded apart from one deleted elsewhere.
  if (storeName === PHOTO_STORE) {
    payload.photos = (record.photos || []).map(photo => ({
      photoUid: photo.photoUid,
      width: photo.width,
      height: photo.height,
      type: photo.type || (photo.blob && photo.blob.type) || 'image/jpeg',
    }));
  }

  return payload;
}

// Returns null when a single-value foreign key still points at a record this device hasn't got
// yet — the caller retries it on a later pass rather than writing a row with a dangling
// reference (the exact failure mode backup.js's dead-childId guards exist to clean up after).
export function deserializeRecord(storeName, payload, idOf, existingPhotos) {
  const { refs } = storeSpec(storeName);
  const record = {};

  for (const [key, value] of Object.entries(payload)) {
    const ref = refs[key];
    if (!ref) {
      record[key] = value;
      continue;
    }
    if (ref.kind === 'id') {
      const id = idOf(ref.store, value);
      if (id === undefined) return null;
      record[key] = id;
    } else if (ref.kind === 'idArray') {
      record[key] = (value || []).map(uid => idOf(ref.store, uid)).filter(id => id !== undefined);
    } else {
      record[key] = Object.fromEntries(
        Object.entries(value || {})
          .map(([uid, inner]) => [idOf(ref.store, uid), inner])
          .filter(([id]) => id !== undefined)
      );
    }
  }

  if (storeName === PHOTO_STORE) {
    const byUid = new Map((existingPhotos || []).map(photo => [photo.photoUid, photo]));
    record.photos = (payload.photos || []).map(descriptor => {
      const local = byUid.get(descriptor.photoUid);
      return { ...descriptor, blob: local && local.blob };
    });
  }

  return record;
}
