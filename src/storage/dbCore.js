export const DB_NAME = 'c-form-db';
export const DB_VERSION = 4;

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('children')) {
        db.createObjectStore('children', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('forms')) {
        const forms = db.createObjectStore('forms', { keyPath: 'id', autoIncrement: true });
        forms.createIndex('by_childId', 'childId');
      }
      if (!db.objectStoreNames.contains('entries')) {
        const entries = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
        entries.createIndex('by_formId', 'formId');
      }
      if (!db.objectStoreNames.contains('parentReports')) {
        const parentReports = db.createObjectStore('parentReports', { keyPath: 'id', autoIncrement: true });
        parentReports.createIndex('by_childId', 'childId');
      }
      if (!db.objectStoreNames.contains('coursePlanEntries')) {
        const coursePlanEntries = db.createObjectStore('coursePlanEntries', { keyPath: 'id', autoIncrement: true });
        coursePlanEntries.createIndex('by_reportId', 'reportId');
      }
      if (!db.objectStoreNames.contains('courseOccurrences')) {
        const courseOccurrences = db.createObjectStore('courseOccurrences', { keyPath: 'id', autoIncrement: true });
        courseOccurrences.createIndex('by_entryId', 'entryId');
      }
      if (!db.objectStoreNames.contains('developmentRecordEntries')) {
        const developmentRecordEntries = db.createObjectStore('developmentRecordEntries', { keyPath: 'id', autoIncrement: true });
        developmentRecordEntries.createIndex('by_reportId', 'reportId');
      }
      if (!db.objectStoreNames.contains('behaviorObservations')) {
        const behaviorObservations = db.createObjectStore('behaviorObservations', { keyPath: 'id', autoIncrement: true });
        behaviorObservations.createIndex('by_reportId', 'reportId');
      }
      if (!db.objectStoreNames.contains('highlightEntries')) {
        const highlightEntries = db.createObjectStore('highlightEntries', { keyPath: 'id', autoIncrement: true });
        highlightEntries.createIndex('by_reportId', 'reportId');
      }
      if (!db.objectStoreNames.contains('monthlyCoursePlans')) {
        db.createObjectStore('monthlyCoursePlans', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('planSlots')) {
        const planSlots = db.createObjectStore('planSlots', { keyPath: 'id', autoIncrement: true });
        planSlots.createIndex('by_planId', 'planId');
      }
      if (!db.objectStoreNames.contains('planSlotItems')) {
        const planSlotItems = db.createObjectStore('planSlotItems', { keyPath: 'id', autoIncrement: true });
        planSlotItems.createIndex('by_slotId', 'slotId');
      }
      if (!db.objectStoreNames.contains('childItemOverrides')) {
        const childItemOverrides = db.createObjectStore('childItemOverrides', { keyPath: 'id', autoIncrement: true });
        childItemOverrides.createIndex('by_planId', 'planId');
      }
      // Sync bookkeeping. Created unconditionally so both build targets share one schema
      // version — otherwise a browser that opens the offline build after the hosted one would
      // trigger its own version bump.
      if (!db.objectStoreNames.contains('tombstones')) {
        db.createObjectStore('tombstones', { keyPath: 'uid' });
      }
      if (!db.objectStoreNames.contains('syncState')) {
        db.createObjectStore('syncState', { keyPath: 'uid' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function runRequest(storeName, mode, fn) {
  return openDatabase().then(
    db =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = fn(store);
        let result;
        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

// crypto.randomUUID only landed in Safari 15.4 and this project's esbuild target is safari15,
// so fall back to getRandomValues rather than crashing the whole app on an older iPad.
export function newUid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

// Every syncable record carries a `uid` (stable across devices — IndexedDB's autoIncrement `id`
// is not: the same logical child is id 3 on one phone and id 7 on another) and an `updatedAt`.
// Stamping both here, at the one place every write already passes through, is what keeps the
// sync layer out of the UI's save paths entirely.
//
// The write listener is how the sync engine learns "something changed, schedule an upload". The
// offline build never registers one, so this costs it nothing.
let writeListener = null;

export function setWriteListener(fn) {
  writeListener = fn;
}

function notifyWrite() {
  if (writeListener) writeListener();
}

export async function addRecord(storeName, record) {
  // uid/updatedAt are honored when supplied so restoring a backup keeps a record's sync
  // identity instead of looking like a brand-new record to every other device.
  const stamped = {
    ...record,
    uid: record.uid || newUid(),
    updatedAt: record.updatedAt || new Date().toISOString(),
  };
  const id = await runRequest(storeName, 'readwrite', store => store.add(stamped));
  notifyWrite();
  return { ...stamped, id };
}

export async function putRecord(storeName, record) {
  // Unlike addRecord, updatedAt is always overwritten: callers pass a spread of the existing
  // record, which would otherwise carry the old timestamp straight back in.
  const stamped = { ...record, uid: record.uid || newUid(), updatedAt: new Date().toISOString() };
  await runRequest(storeName, 'readwrite', store => store.put(stamped));
  notifyWrite();
  return stamped;
}

// Leaves a tombstone so a delete made here propagates to the cloud (and from there to the other
// devices) instead of the record simply reappearing on the next download — "刪了又跑出來" is
// exactly the confusion the sync design set out to avoid. Tombstones expire after 30 days (see
// syncStateDb.purgeExpiredTombstones); the deleted data itself stays recoverable for that long
// from Google Drive's own trash.
export async function deleteRecord(storeName, id) {
  const existing = await runRequest(storeName, 'readonly', store => store.get(id));
  await runRequest(storeName, 'readwrite', store => store.delete(id));
  if (existing && existing.uid) {
    await runRequest('tombstones', 'readwrite', store =>
      store.put({ uid: existing.uid, store: storeName, deletedAt: new Date().toISOString() })
    );
  }
  notifyWrite();
}
