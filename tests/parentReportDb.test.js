import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { clearAllData, addChild } from '../src/storage/db.js';
import { addRecord, runRequest } from '../src/storage/dbCore.js';

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
  saveHighlightEdit,
  updateHighlightCaptionPart,
  removeHighlightPhoto,
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

  it('課程計畫項目跟每次出現的紀錄都依 createdAt 排序，不受本機 id 順序影響', async () => {
    const newerEntry = await addCoursePlanEntry({
      reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '後建立', createdAt: '2026-02-01T00:00:00.000Z',
    });
    const olderEntry = await addCoursePlanEntry({
      reportId: report.id, indicatorCode: 'Ⅴ-4-2', activityName: '先建立', createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect((await listCoursePlanEntriesForReport(report.id)).map(e => e.id)).toEqual([olderEntry.id, newerEntry.id]);

    const newerOccurrence = await addCourseOccurrence({
      entryId: olderEntry.id, date: '2026-06-11', status: 'developed', absent: false, note: '後建立',
      createdAt: '2026-02-01T00:00:00.000Z',
    });
    const olderOccurrence = await addCourseOccurrence({
      entryId: olderEntry.id, date: '2026-06-12', status: 'developed', absent: false, note: '先建立',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect((await listCourseOccurrencesForEntry(olderEntry.id)).map(o => o.id))
      .toEqual([olderOccurrence.id, newerOccurrence.id]);
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

  it('發展紀錄依 createdAt 排序，不受本機 id 順序影響', async () => {
    const newer = await addDevelopmentRecordEntry({
      reportId: report.id, domain: 1, courseEntryIds: [entry.id], narrative: '後建立',
      createdAt: '2026-02-01T00:00:00.000Z',
    });
    const older = await addDevelopmentRecordEntry({
      reportId: report.id, domain: 2, courseEntryIds: [entry.id], narrative: '先建立',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect((await listDevelopmentRecordEntriesForReport(report.id)).map(r => r.id)).toEqual([older.id, newer.id]);
  });

  it('adds, lists, updates and deletes a behavior observation', async () => {
    const observation = await addBehaviorObservation({ reportId: report.id, title: '我會好好說！', narrative: '本月觀察發現...' });
    expect(await listBehaviorObservationsForReport(report.id)).toEqual([observation]);

    const updated = await updateBehaviorObservation(observation.id, { title: '新標題' });
    expect(updated.title).toBe('新標題');

    await deleteBehaviorObservation(observation.id);
    expect(await listBehaviorObservationsForReport(report.id)).toEqual([]);
  });

  it('行為觀察依 createdAt 排序，不受本機 id 順序影響', async () => {
    const newer = await addBehaviorObservation({
      reportId: report.id, title: '後建立', narrative: 'x', createdAt: '2026-02-01T00:00:00.000Z',
    });
    const older = await addBehaviorObservation({
      reportId: report.id, title: '先建立', narrative: 'x', createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect((await listBehaviorObservationsForReport(report.id)).map(o => o.id)).toEqual([older.id, newer.id]);
  });

  it('adds, lists, updates and deletes a highlight entry', async () => {
    const photo = { blob: new Blob(['x'], { type: 'image/jpeg' }), width: 100, height: 80 };
    const highlight = await addHighlightEntry({ reportId: report.id, photos: [photo], caption: '我最喜歡騎車車了！' });
    // Stored as raw bytes, so the photo comes back carrying its `type` as well.
    expect(await listHighlightEntriesForReport(report.id)).toEqual([
      { ...highlight, photos: [{ ...photo, type: 'image/jpeg' }] },
    ]);

    const updated = await updateHighlightEntry(highlight.id, { caption: '新的說明' });
    expect(updated.caption).toBe('新的說明');

    await deleteHighlightEntry(highlight.id);
    expect(await listHighlightEntriesForReport(report.id)).toEqual([]);
  });

  it('依 createdAt 排序，不受本機 id 順序影響（模擬從雲端同步進來、id 順序被打亂的情況）', async () => {
    const photo = { blob: new Blob(['x'], { type: 'image/jpeg' }), width: 10, height: 10 };
    // id 順序刻意與 createdAt 順序相反：後建立的先寫進本機（例如同步下載順序不是創建順序）。
    const newer = await addHighlightEntry({
      reportId: report.id, photos: [photo], caption: '後建立', createdAt: '2026-02-01T00:00:00.000Z',
    });
    const older = await addHighlightEntry({
      reportId: report.id, photos: [photo], caption: '先建立', createdAt: '2026-01-01T00:00:00.000Z',
    });

    const entries = await listHighlightEntriesForReport(report.id);
    expect(entries.map(e => e.id)).toEqual([older.id, newer.id]);
  });

  it('沒有 createdAt 的舊資料（這次修正之前建立的）排在最前面，不會噴錯', async () => {
    const photo = { blob: new Blob(['x'], { type: 'image/jpeg' }), width: 10, height: 10 };
    const legacy = await addRecord('highlightEntries', { reportId: report.id, photos: [photo], caption: '舊資料', uid: 'legacy-uid' });
    const fresh = await addHighlightEntry({ reportId: report.id, photos: [photo], caption: '新資料' });

    const entries = await listHighlightEntriesForReport(report.id);
    expect(entries.map(e => e.id)).toEqual([legacy.id, fresh.id]);
  });

  it('drops a photo whose bytes are gone instead of throwing and losing the rest', async () => {
    // Raw add: what Safari leaves behind once it lost a photo — a descriptor with no bytes.
    await runRequest('highlightEntries', 'readwrite', store => store.add({
      reportId: report.id, caption: '兩張照片',
      photos: [{ bytes: new TextEncoder().encode('a').buffer, type: 'image/jpeg', width: 10, height: 10 }, { width: 20, height: 20 }],
    }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const [entry] = await listHighlightEntriesForReport(report.id);
    expect(entry.photos.map(p => p.width)).toEqual([10]);
    expect(entry.caption).toBe('兩張照片');

    vi.restoreAllMocks();
  });

  describe('分開描述', () => {
    const photo = name => ({ blob: new Blob([name], { type: 'image/jpeg' }), width: 10, height: 10, photoUid: name });
    const split = [{ size: 2, text: '前兩張' }, { size: 1, text: '第三張' }];
    const stored = id => runRequest('highlightEntries', 'readonly', store => store.get(id));

    it('只有分開描述時才存 captionGroups，一段描述的不會多一個欄位', async () => {
      const one = await addHighlightEntry({ reportId: report.id, photos: [photo('a')], caption: '一段' });
      const two = await addHighlightEntry({
        reportId: report.id, photos: [photo('a'), photo('b'), photo('c')], caption: '前兩張\n第三張', captionGroups: split,
      });
      expect('captionGroups' in (await stored(one.id))).toBe(false);
      expect((await stored(two.id)).captionGroups).toEqual(split);
    });

    it('編輯儲存：照片換成新順序，改回一段描述就拿掉 captionGroups', async () => {
      const entry = await addHighlightEntry({
        reportId: report.id, photos: [photo('a'), photo('b'), photo('c')], caption: '前兩張\n第三張', captionGroups: split,
      });
      await saveHighlightEdit(entry.id, { photoOrder: [2, 0, 1], fields: { caption: '合在一起' } });
      const saved = await stored(entry.id);
      expect(saved.photos.map(p => p.photoUid)).toEqual(['c', 'a', 'b']);
      expect(saved.caption).toBe('合在一起');
      expect('captionGroups' in saved).toBe(false);
    });

    it('編輯儲存：讀不出來、畫面上沒有的照片留在最後，不會被丟掉', async () => {
      const entry = await addHighlightEntry({ reportId: report.id, photos: [photo('a'), photo('b'), photo('c')], caption: 'x' });
      await saveHighlightEdit(entry.id, { photoOrder: [2, 0], fields: { caption: 'x' } });
      expect((await stored(entry.id)).photos.map(p => p.photoUid)).toEqual(['c', 'a', 'b']);
    });

    it('改其中一段描述時，合起來的 caption 也跟著更新', async () => {
      const entry = await addHighlightEntry({
        reportId: report.id, photos: [photo('a'), photo('b'), photo('c')], caption: '前兩張\n第三張', captionGroups: split,
      });
      await updateHighlightCaptionPart(entry.id, 1, '改過的第三張');
      const saved = await stored(entry.id);
      expect(saved.captionGroups).toEqual([{ size: 2, text: '前兩張' }, { size: 1, text: '改過的第三張' }]);
      expect(saved.caption).toBe('前兩張\n改過的第三張');
    });

    it('刪掉第三張照片：那一段的字併到前一段，只剩一段就變回一段描述', async () => {
      const entry = await addHighlightEntry({
        reportId: report.id, photos: [photo('a'), photo('b'), photo('c')], caption: '前兩張\n第三張', captionGroups: split,
      });
      await removeHighlightPhoto(entry.id, 2);
      const saved = await stored(entry.id);
      expect(saved.photos.map(p => p.photoUid)).toEqual(['a', 'b']);
      expect(saved.caption).toBe('前兩張\n第三張');
      expect('captionGroups' in saved).toBe(false);
    });

    it('刪掉前兩張其中一張：那一組少一張，分開描述還在', async () => {
      const entry = await addHighlightEntry({
        reportId: report.id, photos: [photo('a'), photo('b'), photo('c')], caption: '前兩張\n第三張', captionGroups: split,
      });
      await removeHighlightPhoto(entry.id, 0);
      expect((await stored(entry.id)).captionGroups).toEqual([{ size: 1, text: '前兩張' }, { size: 1, text: '第三張' }]);
    });
  });
});
