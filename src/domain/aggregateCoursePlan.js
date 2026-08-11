import { getIndicator } from '../data/indicators.js';
import { addForm, addEntry, getForm, updateForm, listEntriesForForm } from '../storage/db.js';
import { getParentReport, listCoursePlanEntriesForReport, listCourseOccurrencesForEntry } from '../storage/parentReportDb.js';

// "115年05月-115年08月" (min-max range) from a flat list of period strings, collapsing to a
// single value when there's only one distinct period.
function combinedPeriodRange(periods) {
  if (periods.length === 0) return '';
  const sorted = [...periods].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return first === last ? first : `${first}-${last}`;
}

// An existing AssessmentForm's own period may already be a range ("115年05月-115年08月") from a
// prior merge — split it back into its parts so a further merge can fold them into the new range.
function periodRangeParts(period) {
  return period.includes('-') ? period.split('-') : [period];
}

// A composite key identifying "the same observation" for duplicate-skipping when merging into an
// existing form. JSON.stringify of an array safely separates fields regardless of their content
// (no manual delimiter that a note's text could collide with).
function entrySignature({ indicatorCode, date, status, note }) {
  return JSON.stringify([indicatorCode, date, status, note]);
}

// Merges the 課程計畫表 data of several same-tier 適性紀錄(家長版) into one 適性總表
// (AssessmentForm) — either a brand-new one, or an existing one when `targetFormId` is given.
// Each ParentReport's CoursePlanEntry/CourseOccurrence pairs become ObservationEntry rows;
// 請假／未執行 occurrences are dropped (the teacher did not actually run the activity, so the
// total form has nothing to show for that date); an entry whose indicator code can't be resolved
// for the target tier is skipped and reported back in `failed` instead of aborting the whole
// merge. When merging into an existing form, a row that exactly duplicates one already in that
// form (same indicatorCode+date+status+note) is skipped and counted in `skippedDuplicates`
// instead of being written twice.
export async function aggregateCoursePlanIntoForm({ childId, tier, reportIds, targetFormId = null }) {
  const reports = [];
  for (const reportId of reportIds) {
    const report = await getParentReport(reportId);
    if (report) reports.push(report);
  }
  reports.sort((a, b) => a.period.localeCompare(b.period));

  const toWrite = [];
  const failed = [];

  for (const report of reports) {
    const entries = await listCoursePlanEntriesForReport(report.id);
    for (const entry of entries) {
      const indicator = getIndicator(entry.indicatorCode);
      if (!indicator || indicator.tier !== tier) {
        failed.push({
          reportPeriod: report.period,
          indicatorCode: entry.indicatorCode,
          activityName: entry.activityName,
          reason: indicator ? '指標不屬於此階段' : '找不到對應指標',
        });
        continue;
      }

      const occurrences = (await listCourseOccurrencesForEntry(entry.id)).sort((a, b) => a.date.localeCompare(b.date));
      for (const occurrence of occurrences) {
        if (occurrence.absent) continue;
        toWrite.push({ indicatorCode: entry.indicatorCode, date: occurrence.date, status: occurrence.status, note: occurrence.note });
      }
    }
  }

  let form;
  let skippedDuplicates = 0;

  if (targetFormId) {
    form = await getForm(targetFormId);
    const existingEntries = await listEntriesForForm(targetFormId);
    const seen = new Set(existingEntries.map(entrySignature));

    const rowsToWrite = [];
    for (const row of toWrite) {
      const signature = entrySignature(row);
      if (seen.has(signature)) {
        skippedDuplicates += 1;
        continue;
      }
      seen.add(signature);
      rowsToWrite.push(row);
    }

    const period = combinedPeriodRange([...periodRangeParts(form.period), ...reports.map(r => r.period)]);
    form = await updateForm(targetFormId, { period });

    for (const row of rowsToWrite) {
      await addEntry({ formId: form.id, ...row });
    }
  } else {
    const period = combinedPeriodRange(reports.map(r => r.period));
    form = await addForm({ childId, tier, period });
    for (const row of toWrite) {
      await addEntry({ formId: form.id, ...row });
    }
  }

  return { form, failed, skippedDuplicates };
}
