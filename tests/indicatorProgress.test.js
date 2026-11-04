import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllData, addChild, addForm, addEntry } from '../src/storage/db.js';
import { addParentReport, addCoursePlanEntry, addCourseOccurrence } from '../src/storage/parentReportDb.js';
import { progressFromStatuses, loadIndicatorProgress } from '../src/domain/indicatorProgress.js';

describe('progressFromStatuses', () => {
  it('any ○ wins, then △, else none; 請假／更換課程 count as nothing', () => {
    expect(progressFromStatuses(['developing', 'developed'])).toBe('achieved');
    expect(progressFromStatuses(['developing', 'absent'])).toBe('developing');
    expect(progressFromStatuses(['absent', 'courseChanged'])).toBe('none');
    expect(progressFromStatuses([])).toBe('none');
  });
});

describe('loadIndicatorProgress', () => {
  beforeEach(clearAllData);

  it('merges every 總表 and 適性紀錄 of each child, skipping 請假／更換課程 occurrences', async () => {
    const a = await addChild({ name: 'A', birthDate: '2024-01-01' });
    const b = await addChild({ name: 'B', birthDate: '2024-01-01' });

    const form = await addForm({ childId: a.id, tier: 'Ⅴ', period: '115年01月' });
    await addEntry({ formId: form.id, indicatorCode: 'Ⅴ-1-1', date: '2026-01-05', status: 'developing', note: '' });
    await addEntry({ formId: form.id, indicatorCode: 'Ⅴ-1-2', date: '2026-01-05', status: 'absent', note: '' });

    const report = await addParentReport({ childId: a.id, tier: 'Ⅴ', period: '115年02月' });
    const e1 = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-1', activityName: 'x' });
    await addCourseOccurrence({ entryId: e1.id, date: '2026-02-05', status: 'developed', absent: false });
    const e2 = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-3', activityName: 'y' });
    await addCourseOccurrence({ entryId: e2.id, date: '2026-02-05', status: 'developed', absent: true });
    await addCourseOccurrence({ entryId: e2.id, date: '2026-02-06', status: 'developed', absent: false, courseChanged: true });
    const e3 = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-4', activityName: 'z' });
    await addCourseOccurrence({ entryId: e3.id, date: '2026-02-05', status: 'developing', absent: false });

    const progress = await loadIndicatorProgress([a.id, b.id]);
    expect(Object.fromEntries(progress.get(a.id))).toEqual({ 'Ⅴ-1-1': 'achieved', 'Ⅴ-1-4': 'developing' });
    expect(progress.get(b.id).size).toBe(0);
  });
});
