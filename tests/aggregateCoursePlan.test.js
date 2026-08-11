import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllData, addChild, listEntriesForForm, addForm, addEntry } from '../src/storage/db.js';
import { addParentReport, addCoursePlanEntry, addCourseOccurrence } from '../src/storage/parentReportDb.js';
import { aggregateCoursePlanIntoForm } from '../src/domain/aggregateCoursePlan.js';

describe('aggregateCoursePlanIntoForm', () => {
  let child;

  beforeEach(async () => {
    await clearAllData();
    child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
  });

  it('merges course-plan occurrences from multiple same-tier reports into one new form', async () => {
    const reportJan = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    const reportFeb = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年02月' });

    const entryJan = await addCoursePlanEntry({ reportId: reportJan.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    await addCourseOccurrence({ entryId: entryJan.id, date: '2026-01-10', status: 'developed', absent: false, note: '一月的紀錄' });

    const entryFeb = await addCoursePlanEntry({ reportId: reportFeb.id, indicatorCode: 'Ⅴ-1-7', activityName: '堆積木' });
    await addCourseOccurrence({ entryId: entryFeb.id, date: '2026-02-14', status: 'developing', absent: false, note: '二月的紀錄' });

    const { form, failed, skippedDuplicates } = await aggregateCoursePlanIntoForm({
      childId: child.id,
      tier: 'Ⅴ',
      reportIds: [reportJan.id, reportFeb.id],
    });

    expect(form.childId).toBe(child.id);
    expect(form.tier).toBe('Ⅴ');
    expect(failed).toEqual([]);
    expect(skippedDuplicates).toBe(0);

    const entries = await listEntriesForForm(form.id);
    expect(entries).toHaveLength(2);
    expect(entries.find(e => e.indicatorCode === 'Ⅴ-1-6')).toMatchObject({ date: '2026-01-10', status: 'developed', note: '一月的紀錄' });
    expect(entries.find(e => e.indicatorCode === 'Ⅴ-1-7')).toMatchObject({ date: '2026-02-14', status: 'developing', note: '二月的紀錄' });
  });

  it('names the new form period from the sorted, joined source report periods', async () => {
    const reportFeb = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年02月' });
    const reportJan = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });

    const { form } = await aggregateCoursePlanIntoForm({
      childId: child.id,
      tier: 'Ⅴ',
      reportIds: [reportFeb.id, reportJan.id],
    });

    expect(form.period).toBe('115年01月-115年02月');
  });

  it('collapses the period to a single value (no range dash) when only one source report is selected', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年03月' });

    const { form } = await aggregateCoursePlanIntoForm({ childId: child.id, tier: 'Ⅴ', reportIds: [report.id] });

    expect(form.period).toBe('115年03月');
  });

  it('excludes occurrences marked absent (請假／未執行)', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-01-10', status: 'developed', absent: true, note: '請假' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-01-17', status: 'developed', absent: false, note: '正常上課' });

    const { form } = await aggregateCoursePlanIntoForm({ childId: child.id, tier: 'Ⅴ', reportIds: [report.id] });

    const entries = await listEntriesForForm(form.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].note).toBe('正常上課');
  });

  it('lists entries whose indicator code cannot be resolved as failed, without blocking the rest', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    const badEntry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-9-9', activityName: '不存在的指標' });
    await addCourseOccurrence({ entryId: badEntry.id, date: '2026-01-10', status: 'developed', absent: false, note: 'x' });
    const goodEntry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    await addCourseOccurrence({ entryId: goodEntry.id, date: '2026-01-11', status: 'developed', absent: false, note: 'y' });

    const { form, failed } = await aggregateCoursePlanIntoForm({ childId: child.id, tier: 'Ⅴ', reportIds: [report.id] });

    expect(failed).toEqual([
      { reportPeriod: '115年01月', indicatorCode: 'Ⅴ-9-9', activityName: '不存在的指標', reason: '找不到對應指標' },
    ]);
    const entries = await listEntriesForForm(form.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].indicatorCode).toBe('Ⅴ-1-6');
  });

  it('sorts merged occurrences by date within an indicator, regardless of entry order', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-01-20', status: 'developed', absent: false, note: '後來的紀錄' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-01-05', status: 'developing', absent: false, note: '較早的紀錄' });

    const { form } = await aggregateCoursePlanIntoForm({ childId: child.id, tier: 'Ⅴ', reportIds: [report.id] });

    const entries = await listEntriesForForm(form.id);
    expect(entries.map(e => e.date)).toEqual(['2026-01-05', '2026-01-20']);
  });

  it('lists entries whose indicator belongs to a different tier as failed', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    // Ⅳ-1-1 is a real indicator, but for the Ⅳ tier, not Ⅴ.
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅳ-1-1', activityName: '走路練習' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-01-10', status: 'developed', absent: false, note: 'x' });

    const { form, failed } = await aggregateCoursePlanIntoForm({ childId: child.id, tier: 'Ⅴ', reportIds: [report.id] });

    expect(failed).toEqual([
      { reportPeriod: '115年01月', indicatorCode: 'Ⅳ-1-1', activityName: '走路練習', reason: '指標不屬於此階段' },
    ]);
    expect(await listEntriesForForm(form.id)).toEqual([]);
  });

  describe('merging into an existing target form', () => {
    it('writes into the existing form instead of creating a new one when targetFormId is given', async () => {
      const existingForm = await addForm({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
      const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年02月' });
      const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
      await addCourseOccurrence({ entryId: entry.id, date: '2026-02-10', status: 'developed', absent: false, note: '二月的紀錄' });

      const { form, skippedDuplicates } = await aggregateCoursePlanIntoForm({
        childId: child.id, tier: 'Ⅴ', reportIds: [report.id], targetFormId: existingForm.id,
      });

      expect(form.id).toBe(existingForm.id);
      expect(skippedDuplicates).toBe(0);

      const entries = await listEntriesForForm(existingForm.id);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ indicatorCode: 'Ⅴ-1-6', date: '2026-02-10', status: 'developed', note: '二月的紀錄' });
    });

    it('skips rows that exactly match an entry already in the target form, and counts them', async () => {
      const existingForm = await addForm({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
      await addEntry({ formId: existingForm.id, indicatorCode: 'Ⅴ-1-6', date: '2026-01-10', status: 'developed', note: '一月的紀錄' });

      const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
      const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
      await addCourseOccurrence({ entryId: entry.id, date: '2026-01-10', status: 'developed', absent: false, note: '一月的紀錄' });

      const { skippedDuplicates } = await aggregateCoursePlanIntoForm({
        childId: child.id, tier: 'Ⅴ', reportIds: [report.id], targetFormId: existingForm.id,
      });

      expect(skippedDuplicates).toBe(1);
      const entries = await listEntriesForForm(existingForm.id);
      expect(entries).toHaveLength(1);
    });

    it('skips duplicates within the same batch (two selected reports producing an identical row)', async () => {
      const existingForm = await addForm({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });

      const reportA = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
      const entryA = await addCoursePlanEntry({ reportId: reportA.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
      await addCourseOccurrence({ entryId: entryA.id, date: '2026-01-10', status: 'developed', absent: false, note: '重複' });

      const reportB = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
      const entryB = await addCoursePlanEntry({ reportId: reportB.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
      await addCourseOccurrence({ entryId: entryB.id, date: '2026-01-10', status: 'developed', absent: false, note: '重複' });

      const { skippedDuplicates } = await aggregateCoursePlanIntoForm({
        childId: child.id, tier: 'Ⅴ', reportIds: [reportA.id, reportB.id], targetFormId: existingForm.id,
      });

      expect(skippedDuplicates).toBe(1);
      const entries = await listEntriesForForm(existingForm.id);
      expect(entries).toHaveLength(1);
    });

    it('widens the period range: existing single period + a new report period', async () => {
      const existingForm = await addForm({ childId: child.id, tier: 'Ⅴ', period: '115年05月' });
      const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年07月' });

      const { form } = await aggregateCoursePlanIntoForm({
        childId: child.id, tier: 'Ⅴ', reportIds: [report.id], targetFormId: existingForm.id,
      });

      expect(form.period).toBe('115年05月-115年07月');
    });

    it('widens the period range: existing range + a new report period', async () => {
      const existingForm = await addForm({ childId: child.id, tier: 'Ⅴ', period: '115年05月-115年06月' });
      const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年07月' });

      const { form } = await aggregateCoursePlanIntoForm({
        childId: child.id, tier: 'Ⅴ', reportIds: [report.id], targetFormId: existingForm.id,
      });

      expect(form.period).toBe('115年05月-115年07月');
    });
  });
});
