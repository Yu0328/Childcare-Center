// tests/monthlyPlanDocxImport.acceptance.test.js
import { describe, it, expect } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
globalThis.Blob = NodeBlob;
import { generateMonthlyPlanDocxBlob } from '../src/export/monthlyPlanDocxExport.js';
import { parseMonthlyPlanDocxImport } from '../src/import/monthlyPlanDocxImport.js';

describe('parseMonthlyPlanDocxImport (round-trip against our own generateMonthlyPlanDocxBlob)', () => {
  it('recovers period, two same-tier children, canonical slot content, and per-child overrides', async () => {
    const plan = { id: 1, period: '115年06月', childIds: [10, 20], childTiers: { 10: 'Ⅴ', 20: 'Ⅴ' } };
    const children = [
      { id: 10, name: '趙萬竑', birthDate: '2024-07-01' },
      { id: 20, name: '張珏銨', birthDate: '2024-07-15' },
    ];
    const slots = [
      { id: 100, planId: 1, tier: 'Ⅴ', weekIndex: 1, weekday: 1 },
      { id: 101, planId: 1, tier: 'Ⅴ', weekIndex: 1, weekday: 2 },
    ];
    const itemsBySlotId = {
      100: [
        { id: 1000, slotId: 100, indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲', indicatorText: '能依形狀或顏色分類' },
        { id: 1001, slotId: 100, indicatorCode: null, activityName: '大團體活動', indicatorText: '' },
      ],
      101: [
        { id: 1010, slotId: 101, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫', indicatorText: '能穩定握筆塗鴉' },
      ],
    };
    const overrides = [
      { id: 1, planId: 1, childId: 10, itemId: 1000, notAchieved: true, replaced: false, replacementText: '' },
      { id: 2, planId: 1, childId: 20, itemId: 1001, notAchieved: false, replaced: true, replacementText: '請假' },
    ];

    const blob = await generateMonthlyPlanDocxBlob({ plan, children, slots, itemsBySlotId, overrides });
    // jsdom's FileReader (which JSZip.loadAsync uses internally for a Blob input) only recognizes
    // jsdom's own Blob type, not the Node Blob this file swaps in globally above — so read the
    // bytes out manually instead, matching the same workaround in monthlyPlanDocxExport.test.js.
    const parsed = await parseMonthlyPlanDocxImport(new Uint8Array(await blob.arrayBuffer()));

    expect(parsed.period).toBe('115年06月');
    expect(parsed.warnings).toEqual([]);
    expect(parsed.children.map(c => c.name).sort()).toEqual(['張珏銨', '趙萬竑'].sort());
    expect(parsed.children.every(c => c.tier === 'Ⅴ')).toBe(true);

    const slotAtWeekday1 = parsed.slotsByTier['Ⅴ'].find(s => s.weekIndex === 1 && s.weekday === 1);
    expect(slotAtWeekday1.items).toEqual([
      { indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲', indicatorText: '能依形狀或顏色分類' },
      { indicatorCode: null, activityName: '大團體活動', indicatorText: '' },
    ]);
    const slotAtWeekday2 = parsed.slotsByTier['Ⅴ'].find(s => s.weekIndex === 1 && s.weekday === 2);
    expect(slotAtWeekday2.items).toEqual([{ indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫', indicatorText: '能穩定握筆塗鴉' }]);

    const zhaoOverrides = parsed.children.find(c => c.name === '趙萬竑').overrides;
    expect(zhaoOverrides).toEqual([{ weekIndex: 1, weekday: 1, itemIndex: 0, notAchieved: true, replaced: false, replacementText: '' }]);

    const zhangOverrides = parsed.children.find(c => c.name === '張珏銨').overrides;
    expect(zhangOverrides).toEqual([{ weekIndex: 1, weekday: 1, itemIndex: 1, notAchieved: false, replaced: true, replacementText: '請假' }]);
  });

  it('round-trips a free activity item and a tier-Ⅵ item with no activity name', async () => {
    const plan = { id: 1, period: '115年06月', childIds: [10], childTiers: { 10: 'Ⅵ' } };
    const children = [{ id: 10, name: '測試寶寶', birthDate: '2023-01-01' }];
    const slots = [{ id: 100, planId: 1, tier: 'Ⅵ', weekIndex: 1, weekday: 1 }];
    const itemsBySlotId = { 100: [{ id: 1000, slotId: 100, indicatorCode: 'Ⅵ-1-1', activityName: '', indicatorText: '會手心朝下丟球或東西' }] };

    const blob = await generateMonthlyPlanDocxBlob({ plan, children, slots, itemsBySlotId, overrides: [] });
    const parsed = await parseMonthlyPlanDocxImport(new Uint8Array(await blob.arrayBuffer()));

    expect(parsed.warnings).toEqual([]);
    expect(parsed.slotsByTier['Ⅵ'][0].items).toEqual([{ indicatorCode: 'Ⅵ-1-1', activityName: '', indicatorText: '會手心朝下丟球或東西' }]);
  });
});
