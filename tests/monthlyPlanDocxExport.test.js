import { describe, it, expect } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
globalThis.Blob = NodeBlob;
import JSZip from 'jszip';
import { buildDayCellRuns, generateMonthlyPlanDocxBlob } from '../src/export/monthlyPlanDocxExport.js';
import { buildMonthlyCalendar } from '../src/domain/monthlyCalendar.js';

describe('buildDayCellRuns', () => {
  it('formats an indicator item as three lines: 指標代號／活動名稱／活動內容, with no override flags by default', () => {
    const items = [{ id: 1, indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲', indicatorText: '能依形狀或顏色分類' }];
    const runs = buildDayCellRuns(items, new Map());
    expect(runs).toEqual([
      { lines: ['Ⅴ-4-3', '分類遊戲', '能依形狀或顏色分類'], notAchieved: false, replaced: false, replacementText: '' },
    ]);
  });

  it('formats an indicator item with no activity name (25個月以上 tier) as just 指標代號／活動內容, no blank middle line', () => {
    const items = [{ id: 1, indicatorCode: 'Ⅵ-1-1', activityName: '', indicatorText: '會手心朝下丟球或東西' }];
    const runs = buildDayCellRuns(items, new Map());
    expect(runs[0].lines).toEqual(['Ⅵ-1-1', '會手心朝下丟球或東西']);
  });

  it('formats a free (no-indicator) item as a single line: just its activity name', () => {
    const items = [{ id: 1, indicatorCode: null, activityName: '大團體活動', indicatorText: '' }];
    const runs = buildDayCellRuns(items, new Map());
    expect(runs[0].lines).toEqual(['大團體活動']);
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
    expect(runs.map(r => r.lines)).toEqual([['a'], ['b']]);
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

  // Regression test: COLUMN_WIDTHS/TABLE_WIDTH_DXA used to be hard-coded for exactly 5 weeks (6
  // columns total), but buildMonthlyCalendar legitimately returns 4 weeks for some months (e.g.
  // February in most years) — a 4-week month used to produce a <w:tblGrid> with 6 columns but
  // rows with only 5 cells, a malformed table in Word.
  it('produces a table whose <w:tblGrid> column count matches every row\'s cell count for a 4-week month', async () => {
    // Gregorian 2026-02 (ROC 115年02月) resolves to 4 weeks via buildMonthlyCalendar, confirmed
    // directly here rather than assumed, so this test fails loudly if the calendar logic changes.
    expect(buildMonthlyCalendar(2026, 2)).toHaveLength(4);

    const plan = { id: 1, period: '115年02月', childIds: [10], childTiers: { 10: 'Ⅴ' } };
    const children = [{ id: 10, name: '趙萬竑', birthDate: '2024-07-01' }];

    const blob = await generateMonthlyPlanDocxBlob({ plan, children, slots: [], itemsBySlotId: {}, overrides: [] });
    // jsdom's FileReader (which JSZip.loadAsync uses internally for a Blob input) only recognizes
    // jsdom's own Blob type, not the Node Blob this file swaps in globally above — so read the
    // bytes out manually instead. Even that ArrayBuffer fails JSZip's `instanceof ArrayBuffer`
    // check (it's a cross-realm object under vitest's jsdom pool), so wrap it in a Uint8Array
    // constructed in this realm, which JSZip does accept directly.
    const zip = await JSZip.loadAsync(new Uint8Array(await blob.arrayBuffer()));
    const documentXml = await zip.file('word/document.xml').async('text');

    const tableXml = documentXml.slice(documentXml.indexOf('<w:tbl>'), documentXml.indexOf('</w:tbl>') + '</w:tbl>'.length);
    const gridColCount = (tableXml.match(/<w:gridCol\b/g) || []).length;
    expect(gridColCount).toBe(5); // date/name + 4 weeks, not the 5-week default of 6

    const rows = tableXml.split('<w:tr>').slice(1).map(rowXml => rowXml.split('</w:tr>')[0]);
    expect(rows.length).toBeGreaterThan(0);
    for (const rowXml of rows) {
      const cellCount = (rowXml.match(/<w:tc>/g) || []).length;
      expect(cellCount).toBe(gridColCount);
    }
  });
});
