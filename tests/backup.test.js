import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import * as parentReportDb from '../src/storage/parentReportDb.js';
import { addChild, addForm, addEntry, listChildren, listFormsForChild, listEntriesForForm, clearAllData } from '../src/storage/db.js';
import { exportBackup, importBackup, importHugeBackupFile } from '../src/storage/backup.js';

// jsdom's Blob polyfill isn't recognized by Node's native structuredClone (used internally by
// fake-indexeddb to clone stored values), so a Blob round-tripped through IndexedDB in this
// (jsdom) test environment comes back as a plain object with its data lost. Swap in the native
// Blob for this file only — other test files that rely on jsdom's Blob (e.g. via FileReader in
// docx export/import) run in their own isolated environment and are unaffected. See
// tests/parentReportDb.test.js, which established this same pattern.
globalThis.Blob = NodeBlob;
import {
  addParentReport, addCoursePlanEntry, addCourseOccurrence,
  addDevelopmentRecordEntry, addBehaviorObservation, addHighlightEntry,
  listParentReportsForChild, listCoursePlanEntriesForReport, listCourseOccurrencesForEntry,
  listDevelopmentRecordEntriesForReport, listBehaviorObservationsForReport, listHighlightEntriesForReport,
} from '../src/storage/parentReportDb.js';
import {
  addMonthlyCoursePlan, listMonthlyCoursePlans, getOrCreatePlanSlot, listPlanSlotsForPlan,
  addPlanSlotItem, listPlanSlotItems, setChildItemOverride, listChildItemOverridesForPlan,
} from '../src/storage/monthlyPlanDb.js';

describe('backup export/import', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('exports all data as JSON parts that concatenate into a valid document', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });
    await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '可以來回穩定行走' });

    const parts = await exportBackup();
    const data = JSON.parse(parts.join(''));

    expect(data.version).toBe(3);
    expect(data.children).toHaveLength(1);
    expect(data.forms).toHaveLength(1);
    expect(data.entries).toHaveLength(1);
  });

  it('reports progress once per child, ending at done === total', async () => {
    await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    await addChild({ name: '林小美', birthDate: '2024-12-01' });
    const onProgress = vi.fn();

    await exportBackup(onProgress);

    expect(onProgress).toHaveBeenCalledWith(0, 2);
    expect(onProgress).toHaveBeenCalledWith(1, 2);
    expect(onProgress).toHaveBeenCalledWith(2, 2);
  });

  it('round-trips through export and import, preserving relationships', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });
    await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '可以來回穩定行走' });

    const parts = await exportBackup();
    await clearAllData();
    await importBackup(parts.join(''));

    const children = await listChildren();
    expect(children).toHaveLength(1);
    expect(children[0].name).toBe('陳小安');

    const forms = await listFormsForChild(children[0].id);
    expect(forms).toHaveLength(1);
    expect(forms[0].tier).toBe('Ⅳ');

    const entries = await listEntriesForForm(forms[0].id);
    expect(entries).toHaveLength(1);
    expect(entries[0].note).toBe('可以來回穩定行走');
  });

  it('rejects an unsupported backup version', async () => {
    await expect(importBackup(JSON.stringify({ version: 4, children: [], forms: [], entries: [] })))
      .rejects.toThrow('Unsupported backup version: 4');
  });

  it('round-trips a parent report with course plan entries, occurrences, and a photo through export/import', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫', indicatorText: '能穩定握筆塗鴉' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-06-11', status: 'developed', absent: false, note: '小安能拿著海綿印章畫畫' });
    await addDevelopmentRecordEntry({ reportId: report.id, domain: 1, courseEntryIds: [entry.id], narrative: '小安能輕鬆畫畫' });
    await addBehaviorObservation({ reportId: report.id, title: '我會好好說！', narrative: 'x' });
    const photoBytes = new Uint8Array([1, 2, 3, 4]);
    await addHighlightEntry({
      reportId: report.id,
      photos: [{ blob: new Blob([photoBytes], { type: 'image/jpeg' }), width: 100, height: 80 }],
      caption: '我最喜歡騎車車了！',
    });

    const parts = await exportBackup();
    await clearAllData();
    await importBackup(parts.join(''));

    const [restoredChild] = await listChildren();
    const [restoredReport] = await listParentReportsForChild(restoredChild.id);
    expect(restoredReport.tier).toBe('Ⅴ');

    const [restoredEntry] = await listCoursePlanEntriesForReport(restoredReport.id);
    expect(restoredEntry.activityName).toBe('我愛畫畫');
    expect(restoredEntry.indicatorText).toBe('能穩定握筆塗鴉');

    const [restoredOccurrence] = await listCourseOccurrencesForEntry(restoredEntry.id);
    expect(restoredOccurrence.note).toBe('小安能拿著海綿印章畫畫');

    const [restoredRecord] = await listDevelopmentRecordEntriesForReport(restoredReport.id);
    expect(restoredRecord.courseEntryIds).toEqual([restoredEntry.id]); // remapped id, not the original

    const [restoredObservation] = await listBehaviorObservationsForReport(restoredReport.id);
    expect(restoredObservation.title).toBe('我會好好說！');

    const [restoredHighlight] = await listHighlightEntriesForReport(restoredReport.id);
    expect(restoredHighlight.caption).toBe('我最喜歡騎車車了！');
    const restoredBytes = new Uint8Array(await restoredHighlight.photos[0].blob.arrayBuffer());
    expect([...restoredBytes]).toEqual([1, 2, 3, 4]);
    expect(restoredHighlight.photos[0].width).toBe(100);
  });

  it('keeps each highlight entry as its own export part, so no single JSON.stringify call ever spans the whole photo payload', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
    await addHighlightEntry({ reportId: report.id, photos: [{ blob: new Blob(['a']), width: 1, height: 1 }], caption: '第一張' });
    await addHighlightEntry({ reportId: report.id, photos: [{ blob: new Blob(['b']), width: 1, height: 1 }], caption: '第二張' });

    const parts = await exportBackup();
    // One shell part (children/forms/... up through the highlightEntries key), one part per
    // highlight entry, one comma between them, one closing part — never one part holding both
    // entries' base64 data concatenated together.
    expect(parts.filter(p => p.includes('第一張') || p.includes('第二張'))).toHaveLength(2);

    await clearAllData();
    await importBackup(parts.join(''));
    const [restoredReport] = await listParentReportsForChild((await listChildren())[0].id);
    const restoredHighlights = await listHighlightEntriesForReport(restoredReport.id);
    expect(restoredHighlights.map(h => h.caption).sort()).toEqual(['第一張', '第二張']);
  });

  it('imports a large backup by streaming it, without ever reading the whole file as one string', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
    // Captions deliberately contain JSON-special characters ({, }, [, ], ", \) to prove the
    // streaming scanner is string/escape-aware, not a naive bracket counter.
    await addHighlightEntry({
      reportId: report.id,
      photos: [{ blob: new Blob(['a']), width: 1, height: 1 }],
      caption: '第一張：{哈囉} [測試] "引號" 反斜線\\結束',
    });
    await addHighlightEntry({
      reportId: report.id,
      photos: [
        { blob: new Blob(['b']), width: 1, height: 1 },
        { blob: new Blob(['c']), width: 2, height: 2 },
      ],
      caption: '第二張，多張照片',
    });
    await addHighlightEntry({ reportId: report.id, photos: [], caption: '第三張，沒有照片' });

    const parts = await exportBackup();
    // A real Blob (not jsdom's, which lacks .stream()) — same interface importHugeBackupFile
    // needs from a real File dropped into the file input.
    const file = new Blob(parts, { type: 'application/json' });

    await clearAllData();
    await importHugeBackupFile(file);

    const [restoredReport] = await listParentReportsForChild((await listChildren())[0].id);
    const restoredHighlights = await listHighlightEntriesForReport(restoredReport.id);
    expect(restoredHighlights.map(h => h.caption).sort()).toEqual(
      ['第一張：{哈囉} [測試] "引號" 反斜線\\結束', '第三張，沒有照片', '第二張，多張照片'].sort()
    );
    const multiPhotoEntry = restoredHighlights.find(h => h.caption === '第二張，多張照片');
    expect(multiPhotoEntry.photos).toHaveLength(2);
    const restoredBytes = new Uint8Array(await multiPhotoEntry.photos[0].blob.arrayBuffer());
    expect([...restoredBytes]).toEqual([...new TextEncoder().encode('b')]);
  });

  it('throws a clear error streaming a backup with no highlightEntries block instead of hanging or silently dropping data', async () => {
    const v1Json = JSON.stringify({ version: 1, children: [], forms: [], entries: [] });
    const file = new Blob([v1Json], { type: 'application/json' });

    await expect(importHugeBackupFile(file)).rejects.toThrow('找不到 highlightEntries 區塊');
  });

  it('still imports a version-1 backup file (no parent-report data) without error, mapping its achieved flag to a status', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });
    await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: 'x' });

    // Simulate a real old backup file: hand-build the exact v1 JSON shape, which only ever had
    // `achieved`, never `status` — this is what a real user's pre-existing backup file looks like.
    const v1Json = JSON.stringify({
      version: 1,
      children: [{ id: child.id, name: child.name, birthDate: child.birthDate }],
      forms: [{ id: form.id, childId: child.id, tier: form.tier, period: form.period, createdAt: form.createdAt }],
      entries: [{ id: 1, formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', achieved: true, note: 'x' }],
    });

    await clearAllData();
    await importBackup(v1Json); // must not throw

    const [restoredChild] = await listChildren();
    expect(restoredChild.name).toBe('陳小安');

    const forms = await listFormsForChild(restoredChild.id);
    const entries = await listEntriesForForm(forms[0].id);
    expect(entries[0].status).toBe('developed');
  });

  it('round-trips a monthly course plan, including slot items and per-child overrides', async () => {
    const child = await addChild({ name: '趙萬竑', birthDate: '2024-07-01' });
    const plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [child.id], childTiers: { [child.id]: 'Ⅴ' } });
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const item = await addPlanSlotItem({ slotId: slot.id, indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲', indicatorText: '能依形狀或顏色分類' });
    await setChildItemOverride({ planId: plan.id, childId: child.id, itemId: item.id, notAchieved: true, replaced: false });

    const parts = await exportBackup();
    await clearAllData();
    await importBackup(parts.join(''));

    const [restoredChild] = await listChildren();
    const [restoredPlan] = await listMonthlyCoursePlans();
    expect(restoredPlan.period).toBe('115年06月');
    expect(restoredPlan.childIds).toEqual([restoredChild.id]);
    expect(restoredPlan.childTiers[restoredChild.id]).toBe('Ⅴ');

    const restoredSlots = await listPlanSlotsForPlan(restoredPlan.id);
    expect(restoredSlots).toHaveLength(1);
    const restoredItems = await listPlanSlotItems(restoredSlots[0].id);
    expect(restoredItems).toHaveLength(1);
    expect(restoredItems[0]).toMatchObject({ indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲' });

    const restoredOverrides = await listChildItemOverridesForPlan(restoredPlan.id);
    expect(restoredOverrides).toHaveLength(1);
    expect(restoredOverrides[0]).toMatchObject({ childId: restoredChild.id, itemId: restoredItems[0].id, notAchieved: true });
  });

  it('drops a monthly-plan childId that has no matching child in the backup, instead of restoring a null/undefined reference', async () => {
    const child = await addChild({ name: '趙萬竑', birthDate: '2024-07-01' });
    await addMonthlyCoursePlan({ period: '115年06月', childIds: [child.id], childTiers: { [child.id]: 'Ⅴ' } });

    const parts = await exportBackup();
    const data = JSON.parse(parts.join(''));
    // Simulate a stale backup where a plan still references a child no longer present in
    // `children` — e.g. one written before deleteChild cascaded to monthly plans (see db.js),
    // or hand-edited/corrupted. The import must not carry that dead reference forward as
    // null/undefined (which would crash the editor view's per-child IndexedDB lookups on open).
    const ghostChildId = 999999;
    data.monthlyCoursePlans[0].childIds.push(ghostChildId);
    data.monthlyCoursePlans[0].childTiers[ghostChildId] = 'Ⅴ';

    await clearAllData();
    await importBackup(JSON.stringify(data));

    const [restoredPlan] = await listMonthlyCoursePlans();
    expect(restoredPlan.childIds).not.toContain(null);
    expect(restoredPlan.childIds).not.toContain(undefined);
    expect(restoredPlan.childIds).toHaveLength(1);
    expect(Object.keys(restoredPlan.childTiers)).not.toContain('undefined');
    expect(Object.values(restoredPlan.childTiers)).not.toContain(undefined);
  });

  it('names which child and section failed when a read throws mid-export, instead of a bare generic error', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
    await addHighlightEntry({ reportId: report.id, photos: [{ blob: new Blob(['a']), width: 10, height: 10 }], caption: 'x' });

    vi.spyOn(parentReportDb, 'listHighlightEntriesForReport').mockRejectedValueOnce(new Error('The object can not be found here.'));

    await expect(exportBackup()).rejects.toThrow('讀取「陳小安」115年06月適性紀錄的點滴分享：The object can not be found here.');

    vi.restoreAllMocks();
  });
});
