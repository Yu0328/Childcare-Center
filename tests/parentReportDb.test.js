import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { clearAllData, addChild } from '../src/storage/db.js';

// jsdom's Blob polyfill isn't recognized by Node's native structuredClone (used internally by
// fake-indexeddb to clone stored values), so a Blob round-tripped through IndexedDB in this
// (jsdom) test environment comes back as a plain object with its data lost. Swap in the native
// Blob for this file only — other test files that rely on jsdom's Blob (e.g. via FileReader in
// docx export/import) run in their own isolated environment and are unaffected.
globalThis.Blob = NodeBlob;
import {
  addParentReport,
  listParentReportsForChild,
  getParentReport,
  deleteParentReport,
  addCoursePlanEntry,
  listCoursePlanEntriesForReport,
  updateCoursePlanEntry,
  deleteCoursePlanEntry,
  addCourseOccurrence,
  listCourseOccurrencesForEntry,
  updateCourseOccurrence,
  deleteCourseOccurrence,
  addDevelopmentRecordEntry,
  listDevelopmentRecordEntriesForReport,
  updateDevelopmentRecordEntry,
  deleteDevelopmentRecordEntry,
  addBehaviorObservation,
  listBehaviorObservationsForReport,
  updateBehaviorObservation,
  deleteBehaviorObservation,
  addHighlightEntry,
  listHighlightEntriesForReport,
  updateHighlightEntry,
  deleteHighlightEntry,
} from '../src/storage/parentReportDb.js';

describe('parentReportDb: ParentReport', () => {
  let child;

  beforeEach(async () => {
    await clearAllData();
    child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
  });

  it('adds a parent report for a child and lists it back', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });

    expect(report.id).toBeTypeOf('number');
    expect(report.createdAt).toBeTypeOf('string');
    expect(await listParentReportsForChild(child.id)).toEqual([report]);
  });

  it('allows multiple reports for the same child and tier (different periods)', async () => {
    await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年05月' });
    await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });

    const reports = await listParentReportsForChild(child.id);
    expect(reports).toHaveLength(2);
    expect(reports.map(r => r.period).sort()).toEqual(['115年05月', '115年06月']);
  });

  it('gets a parent report by id', async () => {
    const created = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
    expect(await getParentReport(created.id)).toEqual(created);
  });

  it('deletes a parent report', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
    await deleteParentReport(report.id);
    expect(await getParentReport(report.id)).toBeUndefined();
    expect(await listParentReportsForChild(child.id)).toEqual([]);
  });

  it('deleting a parent report cascades to its course plan entries and occurrences', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-06-11', status: 'developed', absent: false, note: 'x' });

    await deleteParentReport(report.id);

    expect(await listCoursePlanEntriesForReport(report.id)).toEqual([]);
    expect(await listCourseOccurrencesForEntry(entry.id)).toEqual([]);
  });

  it('deleting a parent report cascades to development records, behavior observations, and highlights', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });
    const record = await addDevelopmentRecordEntry({ reportId: report.id, domain: 1, courseEntryIds: [entry.id], narrative: 'x' });
    const observation = await addBehaviorObservation({ reportId: report.id, title: 'x', narrative: 'y' });
    const highlight = await addHighlightEntry({
      reportId: report.id, photos: [{ blob: new Blob(['x']), width: 1, height: 1 }], caption: 'x',
    });

    await deleteParentReport(report.id);

    expect(await listDevelopmentRecordEntriesForReport(report.id)).toEqual([]);
    expect(await listBehaviorObservationsForReport(report.id)).toEqual([]);
    expect(await listHighlightEntriesForReport(report.id)).toEqual([]);
  });
});

describe('parentReportDb: CoursePlanEntry and CourseOccurrence', () => {
  let child, report;

  beforeEach(async () => {
    await clearAllData();
    child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
  });

  it('adds a course plan entry and lists it back', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫', indicatorText: '能拿筆塗鴉' });

    expect(entry.id).toBeTypeOf('number');
    expect(entry.indicatorText).toBe('能拿筆塗鴉');
    expect(await listCoursePlanEntriesForReport(report.id)).toEqual([entry]);
  });

  it('defaults indicatorText to an empty string when not provided', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });
    expect(entry.indicatorText).toBe('');
  });

  it('updates a course plan entry activity name and indicator text', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫', indicatorText: '能拿筆塗鴉' });
    const updated = await updateCoursePlanEntry(entry.id, { activityName: '塗鴉高手', indicatorText: '能穩定握筆塗鴉' });
    expect(updated.activityName).toBe('塗鴉高手');
    expect(updated.indicatorText).toBe('能穩定握筆塗鴉');
    expect(updated.indicatorCode).toBe('Ⅴ-1-6');
  });

  it('adds, updates and lists course occurrences for an entry', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });

    const occurrence = await addCourseOccurrence({
      entryId: entry.id, date: '2026-06-11', status: 'developed', absent: false, note: '小安能拿著海綿印章在水畫布上畫畫',
    });
    expect(occurrence.id).toBeTypeOf('number');
    expect(await listCourseOccurrencesForEntry(entry.id)).toEqual([occurrence]);

    const updated = await updateCourseOccurrence(occurrence.id, { status: 'developing' });
    expect(updated.status).toBe('developing');
    expect(updated.date).toBe('2026-06-11');
  });

  it('deletes a course occurrence', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });
    const occurrence = await addCourseOccurrence({ entryId: entry.id, date: '2026-06-11', status: 'developed', absent: false, note: 'x' });

    await deleteCourseOccurrence(occurrence.id);

    expect(await listCourseOccurrencesForEntry(entry.id)).toEqual([]);
  });

  it('deleting a course plan entry cascades to its occurrences', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });
    const otherEntry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-4-2', activityName: '照顧小娃娃' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-06-11', status: 'developed', absent: false, note: 'x' });
    const otherOccurrence = await addCourseOccurrence({ entryId: otherEntry.id, date: '2026-06-24', status: 'developed', absent: false, note: '不受影響' });

    await deleteCoursePlanEntry(entry.id);

    expect(await listCoursePlanEntriesForReport(report.id)).toEqual([otherEntry]);
    expect(await listCourseOccurrencesForEntry(entry.id)).toEqual([]);
    expect(await listCourseOccurrencesForEntry(otherEntry.id)).toEqual([otherOccurrence]);
  });
});

describe('parentReportDb: DevelopmentRecordEntry, BehaviorObservationEntry, HighlightEntry', () => {
  let child, report, entry;

  beforeEach(async () => {
    await clearAllData();
    child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
    entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });
  });

  it('adds, lists, and updates a development record entry', async () => {
    const record = await addDevelopmentRecordEntry({
      reportId: report.id, domain: 1, courseEntryIds: [entry.id], narrative: '小安在畫布上盡情塗鴉',
    });
    expect(await listDevelopmentRecordEntriesForReport(report.id)).toEqual([record]);

    const updated = await updateDevelopmentRecordEntry(record.id, { narrative: '修改後的敘述' });
    expect(updated.narrative).toBe('修改後的敘述');
  });

  it('deletes a development record entry', async () => {
    const record = await addDevelopmentRecordEntry({ reportId: report.id, domain: 1, courseEntryIds: [entry.id], narrative: 'x' });
    await deleteDevelopmentRecordEntry(record.id);
    expect(await listDevelopmentRecordEntriesForReport(report.id)).toEqual([]);
  });

  it('adds, lists, updates and deletes a behavior observation', async () => {
    const observation = await addBehaviorObservation({ reportId: report.id, title: '我會好好說！', narrative: '本月觀察發現...' });
    expect(await listBehaviorObservationsForReport(report.id)).toEqual([observation]);

    const updated = await updateBehaviorObservation(observation.id, { title: '新標題' });
    expect(updated.title).toBe('新標題');

    await deleteBehaviorObservation(observation.id);
    expect(await listBehaviorObservationsForReport(report.id)).toEqual([]);
  });

  it('adds, lists, updates and deletes a highlight entry', async () => {
    const photo = { blob: new Blob(['x'], { type: 'image/jpeg' }), width: 100, height: 80 };
    const highlight = await addHighlightEntry({ reportId: report.id, photos: [photo], caption: '我最喜歡騎車車了！' });
    expect(await listHighlightEntriesForReport(report.id)).toEqual([highlight]);

    const updated = await updateHighlightEntry(highlight.id, { caption: '新的說明' });
    expect(updated.caption).toBe('新的說明');

    await deleteHighlightEntry(highlight.id);
    expect(await listHighlightEntriesForReport(report.id)).toEqual([]);
  });

  it('drops a photo whose blob fails to read instead of throwing and losing the rest', async () => {
    const goodPhoto = { blob: new Blob(['a'], { type: 'image/jpeg' }), width: 10, height: 10 };
    const badPhoto = { blob: new Blob(['b'], { type: 'image/jpeg' }), width: 20, height: 20 };
    await addHighlightEntry({ reportId: report.id, photos: [goodPhoto, badPhoto], caption: '兩張照片' });

    const originalArrayBuffer = Blob.prototype.arrayBuffer;
    let callCount = 0;
    vi.spyOn(Blob.prototype, 'arrayBuffer').mockImplementation(function () {
      callCount += 1;
      if (callCount === 2) return Promise.reject(new Error('The object can not be found here.'));
      return originalArrayBuffer.call(this);
    });

    const [entry] = await listHighlightEntriesForReport(report.id);
    expect(entry.photos).toHaveLength(1);
    expect(entry.caption).toBe('兩張照片');

    vi.restoreAllMocks();
  });
});
