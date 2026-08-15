import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllData, addChild, listEntriesForForm, addForm, addEntry } from '../src/storage/db.js';
import { addParentReport, addCoursePlanEntry, addCourseOccurrence } from '../src/storage/parentReportDb.js';
import { aggregateCoursePlanIntoForm, planCoursePlanAggregation, applyCoursePlanAggregation } from '../src/domain/aggregateCoursePlan.js';

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

    const { form, skippedDuplicates } = await aggregateCoursePlanIntoForm({
      childId: child.id,
      tier: 'Ⅴ',
      reportIds: [reportJan.id, reportFeb.id],
    });

    expect(form.childId).toBe(child.id);
    expect(form.tier).toBe('Ⅴ');
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

  it('writes an entry whose indicator code cannot be resolved at all onto the target form as-is, without blocking the rest', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    const badEntry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-9-9', activityName: '不存在的指標' });
    await addCourseOccurrence({ entryId: badEntry.id, date: '2026-01-10', status: 'developed', absent: false, note: 'x' });
    const goodEntry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    await addCourseOccurrence({ entryId: goodEntry.id, date: '2026-01-11', status: 'developed', absent: false, note: 'y' });

    const { form } = await aggregateCoursePlanIntoForm({ childId: child.id, tier: 'Ⅴ', reportIds: [report.id] });

    const entries = await listEntriesForForm(form.id);
    expect(entries).toHaveLength(2);
    expect(entries.find(e => e.indicatorCode === 'Ⅴ-1-6')).toBeDefined();
    // Not discarded — written as-is even though it doesn't resolve to any of this tier's own
    // indicators, so formEditorView's 備註 section picks it up when this form is exported.
    expect(entries.find(e => e.indicatorCode === 'Ⅴ-9-9')).toMatchObject({ date: '2026-01-10', status: 'developed', note: 'x' });
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

  it('files an entry whose indicator belongs to a different tier into a form for its own tier, not the target form', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    // Ⅳ-1-1 is a real indicator, but for the Ⅳ tier, not Ⅴ.
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅳ-1-1', activityName: '走路練習' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-01-10', status: 'developed', absent: false, note: 'x' });

    const { form, reroutedCount } = await aggregateCoursePlanIntoForm({ childId: child.id, tier: 'Ⅴ', reportIds: [report.id] });

    expect(reroutedCount).toBe(1);
    expect(await listEntriesForForm(form.id)).toEqual([]);

    const forms = await import('../src/storage/db.js').then(m => m.listFormsForChild(child.id));
    const ivForm = forms.find(f => f.tier === 'Ⅳ');
    expect(ivForm).toBeDefined();
    expect(ivForm.period).toBe('115年01月');
    const ivEntries = await listEntriesForForm(ivForm.id);
    expect(ivEntries).toMatchObject([{ indicatorCode: 'Ⅳ-1-1', date: '2026-01-10', status: 'developed', note: 'x' }]);
  });

  it('reroutes (rather than failing) an entry whose code is stored with a Latin tier prefix from an older import', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    // A legacy import stored this with an ASCII "IV" prefix instead of the Unicode Ⅳ.
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'IV-1-1', activityName: '走路練習' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-01-10', status: 'developed', absent: false, note: 'x' });

    const { reroutedCount } = await aggregateCoursePlanIntoForm({ childId: child.id, tier: 'Ⅴ', reportIds: [report.id] });

    expect(reroutedCount).toBe(1);

    const forms = await import('../src/storage/db.js').then(m => m.listFormsForChild(child.id));
    const ivForm = forms.find(f => f.tier === 'Ⅳ');
    expect(ivForm).toBeDefined();
    // Written in its canonical (Unicode) form, not the legacy "IV-1-1" it was read as.
    expect(await listEntriesForForm(ivForm.id)).toMatchObject([{ indicatorCode: 'Ⅳ-1-1' }]);
  });

  it('reuses an existing form for the rerouted tier instead of creating a second one', async () => {
    const existingIvForm = await addForm({ childId: child.id, tier: 'Ⅳ', period: '114年10月' });
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅳ-1-1', activityName: '走路練習' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-01-10', status: 'developed', absent: false, note: 'x' });

    await aggregateCoursePlanIntoForm({ childId: child.id, tier: 'Ⅴ', reportIds: [report.id] });

    const forms = await import('../src/storage/db.js').then(m => m.listFormsForChild(child.id));
    expect(forms.filter(f => f.tier === 'Ⅳ')).toHaveLength(1);
    const ivEntries = await listEntriesForForm(existingIvForm.id);
    expect(ivEntries).toHaveLength(1);
  });

  it('skips a rerouted row that exactly duplicates an entry already in that tier\'s form, and counts it', async () => {
    const existingIvForm = await addForm({ childId: child.id, tier: 'Ⅳ', period: '114年10月' });
    await addEntry({ formId: existingIvForm.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-10', status: 'developed', note: 'x' });

    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅳ-1-1', activityName: '走路練習' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-01-10', status: 'developed', absent: false, note: 'x' });

    const { skippedDuplicates, reroutedCount } = await aggregateCoursePlanIntoForm({ childId: child.id, tier: 'Ⅴ', reportIds: [report.id] });

    expect(skippedDuplicates).toBe(1);
    expect(reroutedCount).toBe(0);
    expect(await listEntriesForForm(existingIvForm.id)).toHaveLength(1);
  });

  describe('planCoursePlanAggregation (preview, no writes)', () => {
    it('lists an unresolved-code entry in `unresolved` for preview, and writes nothing until applied', async () => {
      const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
      const badEntry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-9-9', activityName: '我大大了' });
      await addCourseOccurrence({ entryId: badEntry.id, date: '2026-01-10', status: 'developed', absent: false, note: '無法對應到系統指標的紀錄' });

      const plan = await planCoursePlanAggregation({ childId: child.id, tier: 'Ⅴ', reportIds: [report.id] });

      expect(plan.unresolved).toMatchObject([
        { indicatorCode: 'Ⅴ-9-9', date: '2026-01-10', status: 'developed', note: '無法對應到系統指標的紀錄', activityName: '我大大了' },
      ]);
      // Nothing written yet — no form exists for this child at all.
      const forms = await import('../src/storage/db.js').then(m => m.listFormsForChild(child.id));
      expect(forms).toEqual([]);
    });

    it('does not list a resolvable (same-tier) entry in `unresolved`', async () => {
      const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
      const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
      await addCourseOccurrence({ entryId: entry.id, date: '2026-01-10', status: 'developed', absent: false, note: 'x' });

      const plan = await planCoursePlanAggregation({ childId: child.id, tier: 'Ⅴ', reportIds: [report.id] });

      expect(plan.unresolved).toEqual([]);
    });

    it('applying a previously computed plan produces the exact same result as aggregateCoursePlanIntoForm', async () => {
      const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
      const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
      await addCourseOccurrence({ entryId: entry.id, date: '2026-01-10', status: 'developed', absent: false, note: 'x' });

      const plan = await planCoursePlanAggregation({ childId: child.id, tier: 'Ⅴ', reportIds: [report.id] });
      const { form, skippedDuplicates, reroutedCount } = await applyCoursePlanAggregation(plan);

      expect(form.tier).toBe('Ⅴ');
      expect(skippedDuplicates).toBe(0);
      expect(reroutedCount).toBe(0);
      expect(await listEntriesForForm(form.id)).toMatchObject([{ indicatorCode: 'Ⅴ-1-6', date: '2026-01-10' }]);
    });
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
