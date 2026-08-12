export const DB_NAME = 'c-form-db';
export const DB_VERSION = 3;

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
