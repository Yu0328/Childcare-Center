import { describe, it, expect } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
globalThis.Blob = NodeBlob;
import { buildDayCellRuns, generateMonthlyPlanDocxBlob } from '../src/export/monthlyPlanDocxExport.js';

describe('buildDayCellRuns', () => {
  it('formats an indicator item as 代碼【活動名稱】指標內容, with no override flags by default', () => {
    const items = [{ id: 1, indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲', indicatorText: '能依形狀或顏色分類' }];
    const runs = buildDayCellRuns(items, new Map());
    expect(runs).toEqual([
      { text: 'Ⅴ-4-3【分類遊戲】能依形狀或顏色分類', notAchieved: false, replaced: false, replacementText: '' },
    ]);
  });

  it('formats a free (no-indicator) item as just its activity name', () => {
    const items = [{ id: 1, indicatorCode: null, activityName: '大團體活動', indicatorText: '' }];
    const runs = buildDayCellRuns(items, new Map());
    expect(runs[0].text).toBe('大團體活動');
  });

  it('carries notAchieved/replaced/replacementText through from a matching override', () => {
    const items = [{ id: 7, indicatorCode: null, activityName: '拼拼圖', indicatorText: '' }];
    const overrideByItemId = new Map([[7, { notAchieved: true, replaced: true, replacementText: '請假' }]]);
    const runs = buildDayCellRuns(items, overrideByItemId);
    expect(runs[0]).toMatchObject({ notAchieved: true, replaced: true, replacementText: '請假' });
  });

  it('preserves item order and handles multiple items in one cell', () => {
    const items = [
      { id: 1, indicatorCode: null, activityName: 'a', indicatorText: '' },
      { id: 2, indicatorCode: null, activityName: 'b', indicatorText: '' },
    ];
    const runs = buildDayCellRuns(items, new Map());
    expect(runs.map(r => r.text)).toEqual(['a', 'b']);
  });
});

describe('generateMonthlyPlanDocxBlob', () => {
  it('generates a non-empty docx Blob for a plan with one child and no items', async () => {
    const plan = { id: 1, period: '115年06月', childIds: [10], childTiers: { 10: 'Ⅴ' } };
    const children = [{ id: 10, name: '趙萬竑', birthDate: '2024-07-01' }];

    const blob = await generateMonthlyPlanDocxBlob({ plan, children, slots: [], itemsBySlotId: {}, overrides: [] });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });
});
