import { describe, it, expect, beforeEach } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { addChild, addForm, addEntry, listChildren, listFormsForChild, listEntriesForForm, clearAllData } from '../src/storage/db.js';
import { exportBackup, importBackup } from '../src/storage/backup.js';

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

  it('exports all data as a JSON string', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });
    await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '可以來回穩定行走' });

    const json = await exportBackup();
    const data = JSON.parse(json);

    expect(data.version).toBe(3);
    expect(data.children).toHaveLength(1);
    expect(data.forms).toHaveLength(1);
    expect(data.entries).toHaveLength(1);
  });

  it('round-trips through export and import, preserving relationships', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });
    await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '可以來回穩定行走' });

    const json = await exportBackup();
    await clearAllData();
    await importBackup(json);

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

    const json = await exportBackup();
    await clearAllData();
    await importBackup(json);

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

    const json = await exportBackup();
    await clearAllData();
    await importBackup(json);

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
});
