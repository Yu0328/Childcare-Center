import { getIndicator, normalizeIndicatorCode } from '../data/indicators.js';
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

// Deduplicates `rows` against a form's existing entries (or none, for a not-yet-created form),
// returning only the rows that would actually get written plus how many were skipped as exact
// duplicates. Read-only — makes no changes, so it's safe to call during preview.
async function dedupeAgainstForm(existingForm, rows) {
  const existingEntries = existingForm ? await listEntriesForForm(existingForm.id) : [];
  const seen = new Set(existingEntries.map(entrySignature));
  const rowsToWrite = [];
  let skippedDuplicates = 0;
  for (const row of rows) {
    const signature = entrySignature(row);
    if (seen.has(signature)) {
      skippedDuplicates += 1;
      continue;
    }
    seen.add(signature);
    rowsToWrite.push(row);
  }
  return { rowsToWrite, skippedDuplicates };
}

// Computes everything a 彙整 (aggregate) run *would* do, without writing anything — so the UI can
// show the user a preview (in particular, any entry whose indicator code couldn't be resolved at
// all, like "我大大了", which lands in 備註 rather than the main table) before they confirm it.
// Each ParentReport's CoursePlanEntry/CourseOccurrence pairs become planned ObservationEntry rows.
// 請假／未執行 and 更換課程 occurrences are NOT dropped: they carry over with status 'absent' or
// 'courseChanged' respectively, instead of the occurrence's own developed/developing status. An
// entry whose indicator belongs to a *different* tier
// than the target is planned to be filed into a form for its own tier instead — reusing that
// child's existing form for that tier if there is one. An entry whose indicator code can't be
// resolved at all (still possible even after normalizeIndicatorCode) is planned onto the *target*
// form as-is — it won't match any of the target tier's own indicators, so generateDocxBlob's export
// picks it up as a 備註 row there, same as formEditorView's on-screen 備註 section.
export async function planCoursePlanAggregation({ childId, tier, reportIds, targetFormId = null }) {
  const reports = [];
  for (const reportId of reportIds) {
    const report = await getParentReport(reportId);
    if (report) reports.push(report);
  }
  reports.sort((a, b) => a.period.localeCompare(b.period));

  const toWrite = [];
  const rerouted = []; // { tier, indicatorCode, date, status, note, activityName } — a different tier's indicator

  for (const report of reports) {
    const entries = await listCoursePlanEntriesForReport(report.id);
    for (const entry of entries) {
      // Normalized once here so a code stored with a Latin (ASCII) tier prefix from an older
      // import — see normalizeIndicatorCode — gets written onward in its canonical form, not just
      // resolved for this lookup: formEditorView's entriesByIndicatorCode does a plain object-key
      // match against indicator.code, which wouldn't find an entry still stored under "IV-1-1".
      const indicatorCode = normalizeIndicatorCode(entry.indicatorCode);
      const indicator = getIndicator(indicatorCode);
      // No indicator to resolve a tier from at all — goes straight to the target form; it will
      // land in 備註 there since its code matches none of that tier's own indicators.
      const target = !indicator || indicator.tier === tier ? toWrite : rerouted;

      const occurrences = (await listCourseOccurrencesForEntry(entry.id)).sort((a, b) => a.date.localeCompare(b.date));
      for (const occurrence of occurrences) {
        // 請假／未執行 and 更換課程 occurrences are NOT dropped: they carry into the total form as
        // an entry with status 'absent' or 'courseChanged' respectively (in that priority order —
        // an occurrence should never have both flags set, but absent wins if it somehow does),
        // instead of the occurrence's own developed/developing status.
        const status = occurrence.absent ? 'absent' : occurrence.courseChanged ? 'courseChanged' : occurrence.status;
        target.push({
          tier: indicator?.tier,
          indicatorCode,
          date: occurrence.date,
          status,
          note: occurrence.note,
          // Only needed as an export/preview-time fallback for a code that never resolves to an
          // indicator at all — a resolvable one (same-tier or rerouted) always has its official
          // description looked up fresh instead, so this would just go unused.
          activityName: indicator ? undefined : entry.activityName,
        });
      }
    }
  }

  const period = combinedPeriodRange(reports.map(r => r.period));
  const existingTargetForm = targetFormId ? await getForm(targetFormId) : null;
  const targetPeriod = existingTargetForm
    ? combinedPeriodRange([...periodRangeParts(existingTargetForm.period), ...reports.map(r => r.period)])
    : period;
  const { rowsToWrite: targetRowsToWrite, skippedDuplicates: targetSkipped } = await dedupeAgainstForm(
    existingTargetForm,
    toWrite
  );

  const reroutedByTier = new Map();
  for (const row of rerouted) {
    if (!reroutedByTier.has(row.tier)) reroutedByTier.set(row.tier, []);
    reroutedByTier.get(row.tier).push(row);
  }

  const childForms = rerouted.length > 0 ? await listFormsForChild(childId) : [];
  const reroutes = [];
  for (const [rowTier, rows] of reroutedByTier) {
    const existingForm = childForms.find(f => f.tier === rowTier) ?? null;
    const { rowsToWrite, skippedDuplicates } = await dedupeAgainstForm(existingForm, rows);
    reroutes.push({ tier: rowTier, existingForm, period, rowsToWrite, skippedDuplicates });
  }

  const unresolved = targetRowsToWrite.filter(row => row.activityName !== undefined);
  const totalSkippedDuplicates = targetSkipped + reroutes.reduce((sum, r) => sum + r.skippedDuplicates, 0);
  const totalReroutedCount = reroutes.reduce((sum, r) => sum + r.rowsToWrite.length, 0);

  return {
    childId,
    tier,
    period: targetPeriod,
    existingTargetForm,
    targetRowsToWrite,
    reroutes,
    unresolved,
    totalSkippedDuplicates,
    totalReroutedCount,
  };
}

// Writes a previously computed plan (see planCoursePlanAggregation) — the only function in this
// module that actually touches storage.
export async function applyCoursePlanAggregation(plan) {
  let form;
  if (plan.existingTargetForm) {
    form = await updateForm(plan.existingTargetForm.id, { period: plan.period });
  } else {
    form = await addForm({ childId: plan.childId, tier: plan.tier, period: plan.period });
  }
  for (const row of plan.targetRowsToWrite) {
    await addEntry({ formId: form.id, indicatorCode: row.indicatorCode, date: row.date, status: row.status, note: row.note, activityName: row.activityName });
  }

  let reroutedCount = 0;
  for (const reroute of plan.reroutes) {
    const rerouteForm = reroute.existingForm ?? (await addForm({ childId: plan.childId, tier: reroute.tier, period: reroute.period }));
    for (const row of reroute.rowsToWrite) {
      await addEntry({ formId: rerouteForm.id, indicatorCode: row.indicatorCode, date: row.date, status: row.status, note: row.note, activityName: row.activityName });
      reroutedCount += 1;
    }
  }

  return { form, skippedDuplicates: plan.totalSkippedDuplicates, reroutedCount };
}

// Convenience wrapper for callers (and existing tests) that don't need the separate preview step —
// plans, then immediately applies.
export async function aggregateCoursePlanIntoForm(params) {
  const plan = await planCoursePlanAggregation(params);
  return applyCoursePlanAggregation(plan);
}
