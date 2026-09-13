import { runRequest, addRecord, putRecord, deleteRecord } from './dbCore.js';

export async function addParentReport({ childId, tier, period, isNew = false, uid, updatedAt }) {
  const createdAt = new Date().toISOString();
  return addRecord('parentReports', { childId, tier, period, createdAt, isNew, uid, updatedAt });
}

export async function listParentReportsForChild(childId) {
  return runRequest('parentReports', 'readonly', store => store.index('by_childId').getAll(childId));
}

export async function getParentReport(id) {
  return runRequest('parentReports', 'readonly', store => store.get(id));
}

export async function updateParentReport(id, changes) {
  const existing = await runRequest('parentReports', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`ParentReport ${id} not found`);
  return putRecord('parentReports', { ...existing, ...changes, id });
}

// Cascades: deleting a report also deletes every CoursePlanEntry (+ its CourseOccurrences),
// DevelopmentRecordEntry, BehaviorObservationEntry, and HighlightEntry (+ photo Blobs) under it.
export async function deleteParentReport(id) {
  const coursePlanEntries = await listCoursePlanEntriesForReport(id);
  for (const entry of coursePlanEntries) {
    await deleteCoursePlanEntry(entry.id);
  }
  const developmentRecordEntries = await listDevelopmentRecordEntriesForReport(id);
  for (const record of developmentRecordEntries) {
    await deleteDevelopmentRecordEntry(record.id);
  }
  const behaviorObservations = await listBehaviorObservationsForReport(id);
  for (const observation of behaviorObservations) {
    await deleteBehaviorObservation(observation.id);
  }
  const highlightEntries = await listHighlightEntriesForReport(id);
  for (const highlight of highlightEntries) {
    await deleteHighlightEntry(highlight.id);
  }
  await deleteRecord('parentReports', id);
}

export async function addCoursePlanEntry({
  reportId, indicatorCode, activityName, indicatorText = '', uid, updatedAt, createdAt,
}) {
  return addRecord('coursePlanEntries', {
    reportId, indicatorCode, activityName, indicatorText, uid, updatedAt,
    createdAt: createdAt || new Date().toISOString(),
  });
}

export async function listCoursePlanEntriesForReport(reportId) {
  const entries = await runRequest('coursePlanEntries', 'readonly', store => store.index('by_reportId').getAll(reportId));
  return entries.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

export async function updateCoursePlanEntry(id, changes) {
  const existing = await runRequest('coursePlanEntries', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`CoursePlanEntry ${id} not found`);
  return putRecord('coursePlanEntries', { ...existing, ...changes, id });
}

// Cascades: deleting an entry also deletes every CourseOccurrence under it.
export async function deleteCoursePlanEntry(id) {
  const occurrences = await listCourseOccurrencesForEntry(id);
  for (const occurrence of occurrences) {
    await deleteCourseOccurrence(occurrence.id);
  }
  await deleteRecord('coursePlanEntries', id);
}

export async function addCourseOccurrence({
  entryId, date, status, absent, courseChanged = false, note, uid, updatedAt, createdAt,
}) {
  return addRecord('courseOccurrences', {
    entryId, date, status, absent, courseChanged, note, uid, updatedAt,
    createdAt: createdAt || new Date().toISOString(),
  });
}

export async function listCourseOccurrencesForEntry(entryId) {
  const occurrences = await runRequest('courseOccurrences', 'readonly', store => store.index('by_entryId').getAll(entryId));
  return occurrences.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

export async function updateCourseOccurrence(id, changes) {
  const existing = await runRequest('courseOccurrences', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`CourseOccurrence ${id} not found`);
  return putRecord('courseOccurrences', { ...existing, ...changes, id });
}

export async function deleteCourseOccurrence(id) {
  await deleteRecord('courseOccurrences', id);
}

export async function addDevelopmentRecordEntry({
  reportId, domain, courseEntryIds, narrative, uid, updatedAt, createdAt,
}) {
  return addRecord('developmentRecordEntries', {
    reportId, domain, courseEntryIds, narrative, uid, updatedAt,
    createdAt: createdAt || new Date().toISOString(),
  });
}

export async function listDevelopmentRecordEntriesForReport(reportId) {
  const entries =
    await runRequest('developmentRecordEntries', 'readonly', store => store.index('by_reportId').getAll(reportId));
  return entries.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

export async function updateDevelopmentRecordEntry(id, changes) {
  const existing = await runRequest('developmentRecordEntries', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`DevelopmentRecordEntry ${id} not found`);
  return putRecord('developmentRecordEntries', { ...existing, ...changes, id });
}

export async function deleteDevelopmentRecordEntry(id) {
  await deleteRecord('developmentRecordEntries', id);
}

export async function addBehaviorObservation({ reportId, title, narrative, uid, updatedAt, createdAt }) {
  return addRecord('behaviorObservations', {
    reportId, title, narrative, uid, updatedAt, createdAt: createdAt || new Date().toISOString(),
  });
}

export async function listBehaviorObservationsForReport(reportId) {
  const observations =
    await runRequest('behaviorObservations', 'readonly', store => store.index('by_reportId').getAll(reportId));
  return observations.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

export async function updateBehaviorObservation(id, changes) {
  const existing = await runRequest('behaviorObservations', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`BehaviorObservation ${id} not found`);
  return putRecord('behaviorObservations', { ...existing, ...changes, id });
}

export async function deleteBehaviorObservation(id) {
  await deleteRecord('behaviorObservations', id);
}

export async function addHighlightEntry({ reportId, photos, caption, uid, updatedAt, createdAt }) {
  // A dedicated, never-touched-again field: updatedAt moves every time the caption is edited, so
  // it can't double as "which one was added first" — but sync order isn't the point here either.
  // The point is that this value travels with the record to every device via the normal sync
  // payload, so every device sorts by the same number and lands on the same order.
  return addRecord('highlightEntries', {
    reportId, photos, caption, uid, updatedAt, createdAt: createdAt || new Date().toISOString(),
  });
}

// Safari has a known bug where a Blob just read out of IndexedDB can throw "NotFoundError: The
// object can not be found here" if it's actually read (e.g. .arrayBuffer()) later on, especially
// once other async work has happened in between (backup export's many sequential DB reads before
// reaching a photo blob is a textbook trigger). Rebuilding each blob immediately here, right after
// the IndexedDB read, captures its bytes at the freshest possible moment — before that staleness
// window opens — for every consumer (thumbnails, docx export, backup export) at once.
//
// A photo that still fails even at this earliest possible read is dropped (not re-thrown): at
// that point its underlying data is presumed genuinely unreadable at the storage layer, not a
// timing issue any retry or earlier read could have avoided — and letting one bad photo block a
// whole child's backup export (or that report's rendering) is worse than losing just that photo.
export async function listHighlightEntriesForReport(reportId) {
  let entries;
  try {
    entries = await runRequest('highlightEntries', 'readonly', store => store.index('by_reportId').getAll(reportId));
  } catch (err) {
    throw new Error(`IndexedDB 查詢失敗：${err?.message || err}`, { cause: err });
  }
  // By creation order, not local id: id is a per-device autoIncrement counter, so an entry synced
  // in from another device can land at a different id than it had there, silently reordering the
  // list. createdAt travels with the record through sync, so every device sorts by the same value.
  // An entry from before this field existed has none — sorts first (oldest), stable among ties.
  entries = entries.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  return Promise.all(
    entries.map(async entry => ({
      ...entry,
      photos: (
        await Promise.all(
          entry.photos.map(async (photo, index) => {
            try {
              return { ...photo, blob: new Blob([await photo.blob.arrayBuffer()], { type: photo.blob.type }) };
            } catch (err) {
              console.warn(`點滴分享 #${entry.id} 第 ${index + 1} 張照片讀取失敗，已略過：`, err);
              return null;
            }
          })
        )
      ).filter(Boolean),
    }))
  );
}

export async function updateHighlightEntry(id, changes) {
  const existing = await runRequest('highlightEntries', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`HighlightEntry ${id} not found`);
  return putRecord('highlightEntries', { ...existing, ...changes, id });
}

export async function deleteHighlightEntry(id) {
  await deleteRecord('highlightEntries', id);
}
