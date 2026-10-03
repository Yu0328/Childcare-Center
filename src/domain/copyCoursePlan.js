import { listChildren } from '../storage/db.js';
import {
  listParentReportsForChild, listCoursePlanEntriesForReport, addCoursePlanEntry, deleteCoursePlanEntry,
  listCourseOccurrencesForEntry, addCourseOccurrence,
  listDevelopmentRecordEntriesForReport, updateDevelopmentRecordEntry,
} from '../storage/parentReportDb.js';

// Same indicator + activity = "the same row" when moving 適性發展紀錄表 ticks onto the copied rows.
// JSON.stringify keeps the two fields apart whatever their text (as aggregateCoursePlan.js does).
function rowKey(entry) {
  return JSON.stringify([entry.indicatorCode, entry.activityName]);
}

// Each record's courseEntryIds moved from the target's current rows onto whatever `newIdByKey` maps
// the same key to; ids with no match are dropped. `lostSome` = at least one tick won't survive.
function relink(records, oldEntries, newIdByKey) {
  const keyByOldId = new Map(oldEntries.map(entry => [entry.id, rowKey(entry)]));
  return records.map(record => {
    const mapped = (record.courseEntryIds || []).map(id => newIdByKey.get(keyByOldId.get(id)));
    return {
      record,
      ids: [...new Set(mapped.filter(id => id !== undefined))],
      lostSome: mapped.some(id => id === undefined),
    };
  });
}

// Other children's 適性紀錄 for the same tier and month that have a course plan to copy.
export async function findCopySources(report) {
  const sources = [];
  for (const child of await listChildren()) {
    for (const other of await listParentReportsForChild(child.id)) {
      if (other.id === report.id || other.tier !== report.tier || other.period !== report.period) continue;
      const entryCount = (await listCoursePlanEntriesForReport(other.id)).length;
      if (entryCount > 0) sources.push({ report: other, childName: child.name, entryCount });
    }
  }
  return sources;
}

// Read-only: the numbers the confirm dialog shows before anything is replaced.
export async function planCoursePlanCopy({ targetReportId, sourceReportId }) {
  const targetEntries = await listCoursePlanEntriesForReport(targetReportId);
  const sourceEntries = await listCoursePlanEntriesForReport(sourceReportId);
  const records = await listDevelopmentRecordEntriesForReport(targetReportId);
  const sourceKeys = new Map(sourceEntries.map(entry => [rowKey(entry), true]));
  return {
    currentCount: targetEntries.length,
    sourceCount: sourceEntries.length,
    unlinkedRecordCount: relink(records, targetEntries, sourceKeys).filter(r => r.lostSome).length,
  };
}

// Replaces the target report's course plan with a copy of the source's. Copies first and deletes
// last, so an interruption leaves duplicate rows to tidy up rather than lost ones.
export async function copyCoursePlan({ targetReportId, sourceReportId }) {
  const oldEntries = await listCoursePlanEntriesForReport(targetReportId);
  const sourceEntries = await listCoursePlanEntriesForReport(sourceReportId);

  const newIdByKey = new Map();
  for (const source of sourceEntries) {
    const entry = await addCoursePlanEntry({
      reportId: targetReportId,
      indicatorCode: source.indicatorCode,
      activityName: source.activityName,
      indicatorText: source.indicatorText,
    });
    if (!newIdByKey.has(rowKey(entry))) newIdByKey.set(rowKey(entry), entry.id);
    for (const occurrence of await listCourseOccurrencesForEntry(source.id)) {
      // ○／請假／更換課程 describe the source child, not this one — reset to the add form's defaults.
      await addCourseOccurrence({
        entryId: entry.id, date: occurrence.date, note: occurrence.note,
        status: 'developed', absent: false, courseChanged: false,
      });
    }
  }

  const records = await listDevelopmentRecordEntriesForReport(targetReportId);
  for (const { record, ids } of relink(records, oldEntries, newIdByKey)) {
    if ((record.courseEntryIds || []).length > 0) await updateDevelopmentRecordEntry(record.id, { courseEntryIds: ids });
  }

  for (const entry of oldEntries) await deleteCoursePlanEntry(entry.id);
}
