import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import {
  addParentReport, addCoursePlanEntry, addCourseOccurrence,
  listCoursePlanEntriesForReport, listCourseOccurrencesForEntry,
  addDevelopmentRecordEntry, listDevelopmentRecordEntriesForReport,
} from '../src/storage/parentReportDb.js';
import { findCopySources, planCoursePlanCopy, copyCoursePlan } from '../src/domain/copyCoursePlan.js';

describe('copyCoursePlan', () => {
  let target;
  let source;

  beforeEach(async () => {
    await clearAllData();
    const childA = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    const childB = await addChild({ name: '林小明', birthDate: '2024-07-01' });
    target = await addParentReport({ childId: childA.id, tier: 'Ⅴ', period: '115年06月' });
    source = await addParentReport({ childId: childB.id, tier: 'Ⅴ', period: '115年06月' });
  });

  describe('findCopySources', () => {
    it('lists other same-tier, same-period reports that have entries, with child name and count', async () => {
      await addCoursePlanEntry({ reportId: source.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
      await addCoursePlanEntry({ reportId: source.id, indicatorCode: 'Ⅴ-1-7', activityName: '堆積木' });
      await addCoursePlanEntry({ reportId: target.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });

      const sources = await findCopySources(target);

      expect(sources).toHaveLength(1);
      expect(sources[0]).toMatchObject({ childName: '林小明', entryCount: 2 });
      expect(sources[0].report.id).toBe(source.id);
    });

    it('skips other tiers, other periods, and empty reports', async () => {
      const childC = await addChild({ name: '王小華', birthDate: '2024-05-01' });
      const otherTier = await addParentReport({ childId: childC.id, tier: 'Ⅳ', period: '115年06月' });
      const otherPeriod = await addParentReport({ childId: childC.id, tier: 'Ⅴ', period: '115年07月' });
      await addCoursePlanEntry({ reportId: otherTier.id, indicatorCode: 'Ⅳ-1-1', activityName: 'x' });
      await addCoursePlanEntry({ reportId: otherPeriod.id, indicatorCode: 'Ⅴ-1-1', activityName: 'x' });
      // `source` stays empty.

      expect(await findCopySources(target)).toEqual([]);
    });
  });

  describe('copyCoursePlan', () => {
    it('copies entry fields, dates and notes; resets status/absent/courseChanged; leaves the source alone', async () => {
      const entry = await addCoursePlanEntry({ reportId: source.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫', indicatorText: '能拿筆塗鴉' });
      await addCourseOccurrence({ entryId: entry.id, date: '2026-06-03', status: 'developing', absent: true, courseChanged: false, note: '說明一' });
      await addCourseOccurrence({ entryId: entry.id, date: '2026-06-10', status: 'developing', absent: false, courseChanged: true, note: '說明二' });

      await copyCoursePlan({ targetReportId: target.id, sourceReportId: source.id });

      const [copied] = await listCoursePlanEntriesForReport(target.id);
      expect(copied).toMatchObject({ indicatorCode: 'Ⅴ-1-6', activityName: '畫畫', indicatorText: '能拿筆塗鴉' });
      expect(copied.uid).not.toBe(entry.uid);
      const occurrences = await listCourseOccurrencesForEntry(copied.id);
      expect(occurrences.map(o => [o.date, o.note, o.status, o.absent, o.courseChanged])).toEqual([
        ['2026-06-03', '說明一', 'developed', false, false],
        ['2026-06-10', '說明二', 'developed', false, false],
      ]);

      const sourceOccurrences = await listCourseOccurrencesForEntry(entry.id);
      expect(sourceOccurrences.map(o => o.status)).toEqual(['developing', 'developing']);
      expect(await listCoursePlanEntriesForReport(source.id)).toHaveLength(1);
    });

    it("replaces the target's existing entries and their occurrences", async () => {
      const old = await addCoursePlanEntry({ reportId: target.id, indicatorCode: 'Ⅴ-2-1', activityName: '舊活動' });
      await addCourseOccurrence({ entryId: old.id, date: '2026-06-01', status: 'developed', absent: false, note: '' });
      await addCoursePlanEntry({ reportId: source.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });

      await copyCoursePlan({ targetReportId: target.id, sourceReportId: source.id });

      const entries = await listCoursePlanEntriesForReport(target.id);
      expect(entries.map(e => e.activityName)).toEqual(['畫畫']);
      expect(await listCourseOccurrencesForEntry(old.id)).toEqual([]);
    });

    it('keeps source entry order', async () => {
      await addCoursePlanEntry({ reportId: source.id, indicatorCode: 'Ⅴ-1-7', activityName: '堆積木' });
      await addCoursePlanEntry({ reportId: source.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });

      await copyCoursePlan({ targetReportId: target.id, sourceReportId: source.id });

      expect((await listCoursePlanEntriesForReport(target.id)).map(e => e.activityName)).toEqual(['堆積木', '畫畫']);
    });

    it('re-links 適性發展紀錄表 ticks by indicator + activity, drops unmatched, dedupes, leaves empty ones alone', async () => {
      const keep = await addCoursePlanEntry({ reportId: target.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
      const keepTwin = await addCoursePlanEntry({ reportId: target.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
      const gone = await addCoursePlanEntry({ reportId: target.id, indicatorCode: 'Ⅴ-2-1', activityName: '舊活動' });
      const linked = await addDevelopmentRecordEntry({ reportId: target.id, domain: 1, courseEntryIds: [keep.id, keepTwin.id, gone.id], narrative: '甲' });
      const untouched = await addDevelopmentRecordEntry({ reportId: target.id, domain: 1, courseEntryIds: [], narrative: '乙' });
      await addCoursePlanEntry({ reportId: source.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });

      await copyCoursePlan({ targetReportId: target.id, sourceReportId: source.id });

      const [newEntry] = await listCoursePlanEntriesForReport(target.id);
      const records = await listDevelopmentRecordEntriesForReport(target.id);
      expect(records.find(r => r.id === linked.id)).toMatchObject({ courseEntryIds: [newEntry.id], narrative: '甲' });
      expect(records.find(r => r.id === untouched.id)).toMatchObject({ courseEntryIds: [], narrative: '乙' });
    });
  });

  describe('planCoursePlanCopy', () => {
    it('counts current rows, source rows, and records that would lose a tick — without writing', async () => {
      const keep = await addCoursePlanEntry({ reportId: target.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
      const gone = await addCoursePlanEntry({ reportId: target.id, indicatorCode: 'Ⅴ-2-1', activityName: '舊活動' });
      await addDevelopmentRecordEntry({ reportId: target.id, domain: 1, courseEntryIds: [keep.id], narrative: '全對得上' });
      await addDevelopmentRecordEntry({ reportId: target.id, domain: 2, courseEntryIds: [keep.id, gone.id], narrative: '有一個對不上' });
      await addCoursePlanEntry({ reportId: source.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
      await addCoursePlanEntry({ reportId: source.id, indicatorCode: 'Ⅴ-1-7', activityName: '堆積木' });
      await addCoursePlanEntry({ reportId: source.id, indicatorCode: 'Ⅴ-3-1', activityName: '唱歌' });

      const plan = await planCoursePlanCopy({ targetReportId: target.id, sourceReportId: source.id });

      expect(plan).toEqual({ currentCount: 2, sourceCount: 3, unlinkedRecordCount: 1 });
      expect(await listCoursePlanEntriesForReport(target.id)).toHaveLength(2);
    });
  });
});
