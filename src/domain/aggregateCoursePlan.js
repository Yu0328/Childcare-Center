import { getIndicator } from '../data/indicators.js';
import { addForm, addEntry } from '../storage/db.js';
import { getParentReport, listCoursePlanEntriesForReport, listCourseOccurrencesForEntry } from '../storage/parentReportDb.js';

// Merges the 課程計畫表 data of several same-tier 適性紀錄(家長版) into one brand-new 適性總表
// (AssessmentForm). Each ParentReport's CoursePlanEntry/CourseOccurrence pairs become
// ObservationEntry rows; 請假／未執行 occurrences are dropped (the teacher did not actually
// run the activity, so the total form has nothing to show for that date); an entry whose
// indicator code can't be resolved for the target tier is skipped and reported back in
// `failed` instead of aborting the whole merge.
export async function aggregateCoursePlanIntoForm({ childId, tier, reportIds }) {
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

  // "115年05月-115年08月" (min-max range), collapsing to a single period when there's only
  // one distinct source period. `reports` is already sorted by period above.
  const firstPeriod = reports[0]?.period ?? '';
  const lastPeriod = reports[reports.length - 1]?.period ?? '';
  const period = firstPeriod === lastPeriod ? firstPeriod : `${firstPeriod}-${lastPeriod}`;
  const form = await addForm({ childId, tier, period });
  for (const row of toWrite) {
    await addEntry({ formId: form.id, ...row });
  }

  return { form, failed };
}
