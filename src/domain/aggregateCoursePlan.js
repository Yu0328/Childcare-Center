import { getIndicator } from '../data/indicators.js';
import { addForm, addEntry, getForm, updateForm, listEntriesForForm, listFormsForChild } from '../storage/db.js';
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
// at all is skipped and reported back in `failed` instead of aborting the whole merge. An entry
// whose indicator belongs to a *different* tier than the target (the child recorded it before
// developing into this tier's indicators) is filed into a form for its own tier instead — reusing
// that child's existing form for that tier if there is one — so it isn't lost; formEditorView's
// 備註 section picks these up automatically when exporting a later tier's form. When merging into
// an existing form, a row that exactly duplicates one already there (same indicatorCode+date+
// status+note) is skipped and counted in `skippedDuplicates` instead of being written twice — the
// same dedup applies to rerouted rows against their own target tier's form.
export async function aggregateCoursePlanIntoForm({ childId, tier, reportIds, targetFormId = null }) {
  const reports = [];
  for (const reportId of reportIds) {
    const report = await getParentReport(reportId);
    if (report) reports.push(report);
  }
  reports.sort((a, b) => a.period.localeCompare(b.period));

  const toWrite = [];
  const rerouted = []; // { tier, indicatorCode, date, status, note } — a different tier's indicator
  const failed = [];

  for (const report of reports) {
    const entries = await listCoursePlanEntriesForReport(report.id);
    for (const entry of entries) {
      const indicator = getIndicator(entry.indicatorCode);
      if (!indicator) {
        failed.push({
          reportPeriod: report.period,
          indicatorCode: entry.indicatorCode,
          activityName: entry.activityName,
          reason: '找不到對應指標',
        });
        continue;
      }

      const occurrences = (await listCourseOccurrencesForEntry(entry.id)).sort((a, b) => a.date.localeCompare(b.date));
      const target = indicator.tier === tier ? toWrite : rerouted;
      for (const occurrence of occurrences) {
        if (occurrence.absent) continue;
        target.push({
          tier: indicator.tier,
          indicatorCode: entry.indicatorCode,
          date: occurrence.date,
          status: occurrence.status,
          note: occurrence.note,
        });
      }
    }
  }

  let form;
  let skippedDuplicates = 0;
  const period = combinedPeriodRange(reports.map(r => r.period));

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

    const mergedPeriod = combinedPeriodRange([...periodRangeParts(form.period), ...reports.map(r => r.period)]);
    form = await updateForm(targetFormId, { period: mergedPeriod });

    for (const row of rowsToWrite) {
      await addEntry({ formId: form.id, indicatorCode: row.indicatorCode, date: row.date, status: row.status, note: row.note });
    }
  } else {
    form = await addForm({ childId, tier, period });
    for (const row of toWrite) {
      await addEntry({ formId: form.id, indicatorCode: row.indicatorCode, date: row.date, status: row.status, note: row.note });
    }
  }

  let reroutedCount = 0;
  const reroutedByTier = new Map();
  for (const row of rerouted) {
    if (!reroutedByTier.has(row.tier)) reroutedByTier.set(row.tier, []);
    reroutedByTier.get(row.tier).push(row);
  }

  const childForms = rerouted.length > 0 ? await listFormsForChild(childId) : [];
  for (const [rowTier, rows] of reroutedByTier) {
    let rerouteForm = childForms.find(f => f.tier === rowTier);
    if (!rerouteForm) {
      rerouteForm = await addForm({ childId, tier: rowTier, period });
      childForms.push(rerouteForm);
    }

    const existingEntries = await listEntriesForForm(rerouteForm.id);
    const seen = new Set(existingEntries.map(entrySignature));

    for (const row of rows) {
      const entryRow = { indicatorCode: row.indicatorCode, date: row.date, status: row.status, note: row.note };
      const signature = entrySignature(entryRow);
      if (seen.has(signature)) {
        skippedDuplicates += 1;
        continue;
      }
      seen.add(signature);
      await addEntry({ formId: rerouteForm.id, ...entryRow });
      reroutedCount += 1;
    }
  }

  return { form, failed, skippedDuplicates, reroutedCount };
}
