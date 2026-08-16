import { runRequest } from './dbCore.js';

export async function addParentReport({ childId, tier, period }) {
  const createdAt = new Date().toISOString();
  const id = await runRequest('parentReports', 'readwrite', store => store.add({ childId, tier, period, createdAt }));
  return { id, childId, tier, period, createdAt };
}

export async function listParentReportsForChild(childId) {
  return runRequest('parentReports', 'readonly', store => store.index('by_childId').getAll(childId));
}

export async function getParentReport(id) {
  return runRequest('parentReports', 'readonly', store => store.get(id));
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
  await runRequest('parentReports', 'readwrite', store => store.delete(id));
}

export async function addCoursePlanEntry({ reportId, indicatorCode, activityName, indicatorText = '' }) {
  const id = await runRequest('coursePlanEntries', 'readwrite', store => store.add({ reportId, indicatorCode, activityName, indicatorText }));
  return { id, reportId, indicatorCode, activityName, indicatorText };
}

export async function listCoursePlanEntriesForReport(reportId) {
  return runRequest('coursePlanEntries', 'readonly', store => store.index('by_reportId').getAll(reportId));
}

export async function updateCoursePlanEntry(id, changes) {
  const existing = await runRequest('coursePlanEntries', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`CoursePlanEntry ${id} not found`);
  const updated = { ...existing, ...changes, id };
  await runRequest('coursePlanEntries', 'readwrite', store => store.put(updated));
  return updated;
}

// Cascades: deleting an entry also deletes every CourseOccurrence under it.
export async function deleteCoursePlanEntry(id) {
  const occurrences = await listCourseOccurrencesForEntry(id);
  for (const occurrence of occurrences) {
    await deleteCourseOccurrence(occurrence.id);
  }
  await runRequest('coursePlanEntries', 'readwrite', store => store.delete(id));
}

export async function addCourseOccurrence({ entryId, date, status, absent, courseChanged = false, note }) {
  const id = await runRequest('courseOccurrences', 'readwrite', store =>
    store.add({ entryId, date, status, absent, courseChanged, note })
  );
  return { id, entryId, date, status, absent, courseChanged, note };
}

export async function listCourseOccurrencesForEntry(entryId) {
  return runRequest('courseOccurrences', 'readonly', store => store.index('by_entryId').getAll(entryId));
}

export async function updateCourseOccurrence(id, changes) {
  const existing = await runRequest('courseOccurrences', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`CourseOccurrence ${id} not found`);
  const updated = { ...existing, ...changes, id };
  await runRequest('courseOccurrences', 'readwrite', store => store.put(updated));
  return updated;
}

export async function deleteCourseOccurrence(id) {
  await runRequest('courseOccurrences', 'readwrite', store => store.delete(id));
}

export async function addDevelopmentRecordEntry({ reportId, domain, courseEntryIds, narrative }) {
  const id = await runRequest('developmentRecordEntries', 'readwrite', store =>
    store.add({ reportId, domain, courseEntryIds, narrative })
  );
  return { id, reportId, domain, courseEntryIds, narrative };
}

export async function listDevelopmentRecordEntriesForReport(reportId) {
  return runRequest('developmentRecordEntries', 'readonly', store => store.index('by_reportId').getAll(reportId));
}

export async function updateDevelopmentRecordEntry(id, changes) {
  const existing = await runRequest('developmentRecordEntries', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`DevelopmentRecordEntry ${id} not found`);
  const updated = { ...existing, ...changes, id };
  await runRequest('developmentRecordEntries', 'readwrite', store => store.put(updated));
  return updated;
}

export async function deleteDevelopmentRecordEntry(id) {
  await runRequest('developmentRecordEntries', 'readwrite', store => store.delete(id));
}

export async function addBehaviorObservation({ reportId, title, narrative }) {
  const id = await runRequest('behaviorObservations', 'readwrite', store => store.add({ reportId, title, narrative }));
  return { id, reportId, title, narrative };
}

export async function listBehaviorObservationsForReport(reportId) {
  return runRequest('behaviorObservations', 'readonly', store => store.index('by_reportId').getAll(reportId));
}

export async function updateBehaviorObservation(id, changes) {
  const existing = await runRequest('behaviorObservations', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`BehaviorObservation ${id} not found`);
  const updated = { ...existing, ...changes, id };
  await runRequest('behaviorObservations', 'readwrite', store => store.put(updated));
  return updated;
}

export async function deleteBehaviorObservation(id) {
  await runRequest('behaviorObservations', 'readwrite', store => store.delete(id));
}

export async function addHighlightEntry({ reportId, photos, caption }) {
  const id = await runRequest('highlightEntries', 'readwrite', store => store.add({ reportId, photos, caption }));
  return { id, reportId, photos, caption };
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
  const updated = { ...existing, ...changes, id };
  await runRequest('highlightEntries', 'readwrite', store => store.put(updated));
  return updated;
}

export async function deleteHighlightEntry(id) {
  await runRequest('highlightEntries', 'readwrite', store => store.delete(id));
}
