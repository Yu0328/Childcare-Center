// Per child, how far each indicator has got across ALL their records (every 總表 and every
// 適性紀錄's 課程計畫表, any month or tier) — shown in 月計畫's 指標 picker so teachers can see
// what to plan next. 請假／更換課程 aren't observations, so they count as nothing.
import { listFormsForChild, listEntriesForForm } from '../storage/db.js';
import {
  listParentReportsForChild,
  listCoursePlanEntriesForReport,
  listCourseOccurrencesForEntry,
} from '../storage/parentReportDb.js';

export function progressFromStatuses(statuses) {
  if (statuses.includes('developed')) return 'achieved';
  if (statuses.includes('developing')) return 'developing';
  return 'none';
}

async function statusesByCode(childId) {
  const byCode = new Map();
  const push = (code, status) => {
    if (!code) return;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(status);
  };
  for (const form of await listFormsForChild(childId)) {
    for (const entry of await listEntriesForForm(form.id)) push(entry.indicatorCode, entry.status);
  }
  for (const report of await listParentReportsForChild(childId)) {
    for (const entry of await listCoursePlanEntriesForReport(report.id)) {
      for (const occ of await listCourseOccurrencesForEntry(entry.id)) {
        if (!occ.absent && !occ.courseChanged) push(entry.indicatorCode, occ.status);
      }
    }
  }
  return byCode;
}

// Map<childId, Map<code, 'achieved' | 'developing'>> — an indicator missing from a child's map is 'none'.
export async function loadIndicatorProgress(childIds) {
  const result = new Map();
  for (const childId of childIds) {
    const progress = new Map();
    for (const [code, statuses] of await statusesByCode(childId)) {
      const state = progressFromStatuses(statuses);
      if (state !== 'none') progress.set(code, state);
    }
    result.set(childId, progress);
  }
  return result;
}
