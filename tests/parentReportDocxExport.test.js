import { describe, it, expect } from 'vitest';
import { Document, Packer } from 'docx';
import JSZip from 'jszip';
import {
  buildCoursePlanRowGroups, buildCoursePlanTable,
  groupEntriesByDomainInFirstAppearanceOrder, buildDevelopmentRecordTable,
  buildHighlightsTable, generateParentReportDocxBlob,
} from '../src/export/parentReportDocxExport.js';

async function tableToXml(table) {
  const doc = new Document({ sections: [{ children: [table] }] });
  const blob = await Packer.toBlob(doc);
  const zip = await JSZip.loadAsync(blob);
  return zip.file('word/document.xml').async('text');
}

const entries = [
  { id: 1, reportId: 1, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' },
  { id: 2, reportId: 1, indicatorCode: 'Ⅴ-4-6', activityName: '我愛塗鴉' }, // same domain (認知探索/身體動作 differ — see below), different indicator
  { id: 3, reportId: 1, indicatorCode: 'Ⅴ-2-2', activityName: '香蕉鬆餅' },
];

describe('buildCoursePlanRowGroups', () => {
  it('flags the first entry of each domain, grouping by the indicator code prefix domain digit', () => {
    // Ⅴ-1-6 -> domain 1 (身體動作), Ⅴ-4-6 -> domain 4 (認知探索), Ⅴ-2-2 -> domain 2 (社會情緒):
    // three different domains, so every entry starts a new domain group.
    const groups = buildCoursePlanRowGroups(entries, {});
    expect(groups.map(g => g.isFirstEntryOfDomain)).toEqual([true, true, true]);
  });

  it('does not flag a second entry in the same domain as starting a new group', () => {
    const sameDomainEntries = [
      { id: 1, reportId: 1, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' },
      { id: 2, reportId: 1, indicatorCode: 'Ⅴ-1-4', activityName: '踢球球' },
    ];
    const groups = buildCoursePlanRowGroups(sameDomainEntries, {});
    expect(groups.map(g => g.isFirstEntryOfDomain)).toEqual([true, false]);
  });

  // Fix 3: entries may arrive in IndexedDB insertion order, touching domains in any interleaved
  // order (e.g. domain 2, then domain 1 twice). The exported table's vertical-merge grouping
  // assumes same-domain entries are already contiguous, so this must sort by domain first, then
  // by indicator number within the domain, before grouping.
  it('sorts entries by domain then indicator number, regardless of input order', () => {
    const interleavedEntries = [
      { id: 1, reportId: 1, indicatorCode: 'Ⅴ-2-3', activityName: '香蕉鬆餅' }, // domain 2
      { id: 2, reportId: 1, indicatorCode: 'Ⅴ-1-4', activityName: '踢球球' }, // domain 1, index 4
      { id: 3, reportId: 1, indicatorCode: 'Ⅴ-1-1', activityName: '爬樓梯' }, // domain 1, index 1
    ];
    const groups = buildCoursePlanRowGroups(interleavedEntries, {});
    expect(groups.map(g => g.entry.indicatorCode)).toEqual(['Ⅴ-1-1', 'Ⅴ-1-4', 'Ⅴ-2-3']);
    expect(groups.map(g => g.isFirstEntryOfDomain)).toEqual([true, false, true]);
  });

  it('does not mutate the input entries array when sorting', () => {
    const interleavedEntries = [
      { id: 1, reportId: 1, indicatorCode: 'Ⅴ-2-3', activityName: '香蕉鬆餅' },
      { id: 2, reportId: 1, indicatorCode: 'Ⅴ-1-1', activityName: '爬樓梯' },
    ];
    const originalOrder = interleavedEntries.map(e => e.id);
    buildCoursePlanRowGroups(interleavedEntries, {});
    expect(interleavedEntries.map(e => e.id)).toEqual(originalOrder);
  });

  it('emits one blank row for an entry with no occurrences', () => {
    const groups = buildCoursePlanRowGroups([entries[0]], {});
    expect(groups[0].rows).toEqual([{ date: '', status: null, absent: false, note: '' }]);
  });

  it('emits one row per occurrence, preserving insertion order', () => {
    const occurrencesByEntryId = {
      1: [
        { date: '2026-06-11', status: 'developed', absent: false, note: '小安能拿著海綿印章畫畫' },
        { date: '2026-06-18', status: 'developing', absent: false, note: '練習中' },
      ],
    };
    const groups = buildCoursePlanRowGroups([entries[0]], occurrencesByEntryId);
    expect(groups[0].rows).toEqual([
      { date: '2026-06-11', status: 'developed', absent: false, note: '小安能拿著海綿印章畫畫' },
      { date: '2026-06-18', status: 'developing', absent: false, note: '練習中' },
    ]);
  });
});

describe('buildCoursePlanTable', () => {
  const entries = [
    { id: 1, reportId: 1, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫', indicatorText: '能穩定握筆塗鴉' },
  ];

  it('renders the indicator code, activity name, and the entry\'s own teacher-entered indicator text', async () => {
    const xml = await tableToXml(buildCoursePlanTable(entries, {}));
    expect(xml).toContain('Ⅴ-1-6');
    expect(xml).toContain('我愛畫畫');
    expect(xml).toContain('能穩定握筆塗鴉'); // the entry's own indicatorText, not the system's official description
  });

  it('does not fall back to the system\'s official indicator description when indicatorText is empty', async () => {
    const entriesWithoutIndicatorText = [
      { id: 1, reportId: 1, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫', indicatorText: '' },
    ];
    const xml = await tableToXml(buildCoursePlanTable(entriesWithoutIndicatorText, {}));
    expect(xml).toContain('我愛畫畫');
    expect(xml).not.toContain('能拿筆塗鴉'); // Ⅴ-1-6's official description from indicators.js must NOT appear
  });

  it('renders a blank second line when indicatorText is omitted entirely', async () => {
    const entriesWithoutIndicatorText = [
      { id: 1, reportId: 1, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' },
    ];
    const xml = await tableToXml(buildCoursePlanTable(entriesWithoutIndicatorText, {}));
    expect(xml).toContain('我愛畫畫');
    expect(xml).not.toContain('能拿筆塗鴉');
  });

  it('writes an achieved occurrence as MM/DD○, a developing one as MM/DD△', async () => {
    const occurrencesByEntryId = {
      1: [
        { date: '2026-06-11', status: 'developed', absent: false, note: 'a' },
        { date: '2026-06-18', status: 'developing', absent: false, note: 'b' },
      ],
    };
    const xml = await tableToXml(buildCoursePlanTable(entries, occurrencesByEntryId));
    expect(xml).toContain('06/11○');
    expect(xml).toContain('06/18△');
  });

  it('marks an absent occurrence with strikethrough and no ○/△ symbol', async () => {
    const occurrencesByEntryId = {
      1: [{ date: '2026-06-10', status: 'developed', absent: true, note: '請假' }],
    };
    const xml = await tableToXml(buildCoursePlanTable(entries, occurrencesByEntryId));
    expect(xml).toContain('06/10');
    expect(xml).not.toContain('06/10○');
    expect(xml).not.toContain('06/10△');
    expect(xml).toMatch(/<w:strike\s*\/>[\s\S]{0,400}06\/10/);
    expect(xml).toMatch(/<w:strike\s*\/>[\s\S]{0,400}請假/);
  });

  it('shades the domain cell with that domain\'s fill color', async () => {
    const xml = await tableToXml(buildCoursePlanTable(entries, {}));
    expect(xml).toContain('w:fill="FBE4D5"'); // Ⅴ-1-6 -> domain 1 身體動作
  });

  // Every one of the five columns is centered in the real sample's OOXML (<w:jc w:val="center"/>
  // on every body-cell paragraph), including 活動名稱/能力指標 and 說明 — not just the short ones.
  it('centers every column, including the 活動名稱 and 說明 prose columns', async () => {
    const occurrencesByEntryId = { 1: [{ date: '2026-06-11', status: 'developed', absent: false, note: '說明文字' }] };
    const xml = await tableToXml(buildCoursePlanTable(entries, occurrencesByEntryId));
    for (const text of ['我愛畫畫', '能穩定握筆塗鴉', '說明文字']) {
      const index = xml.indexOf(text);
      expect(index).toBeGreaterThan(-1);
      expect(xml.slice(Math.max(0, index - 400), index)).toContain('<w:jc w:val="center"/>');
    }
  });

  it('merges the 發展領域 cell across every entry of the same domain', async () => {
    const sameDomainEntries = [
      { id: 1, reportId: 1, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' },
      { id: 2, reportId: 1, indicatorCode: 'Ⅴ-1-4', activityName: '踢球球' },
    ];
    const xml = await tableToXml(buildCoursePlanTable(sameDomainEntries, {}));
    expect(xml).toContain('w:val="restart"');
    expect((xml.match(/<w:vMerge/g) || []).length).toBeGreaterThan(0);
  });

  // Fix 1: the real sample's header row has no gray shading and no bold label text — only the
  // header/nav-style tables elsewhere in the doc (e.g. 點滴分享's F7CAAC bars) use shading/bold.
  it('does not shade or bold the header row', async () => {
    const xml = await tableToXml(buildCoursePlanTable(entries, {}));
    const headerEnd = xml.indexOf('</w:tr>');
    const headerXml = xml.slice(0, headerEnd);
    expect(headerXml).not.toContain('w:fill="D9D9D9"');
    expect(headerXml).not.toContain('<w:b/>');
  });

  // Fix 2: in the real sample, domain shading fills the entire row (all 5 columns), not just the
  // 發展領域 column.
  it('shades all five columns of a body row with the domain fill color, not just 發展領域', async () => {
    const occurrencesByEntryId = { 1: [{ date: '2026-06-11', status: 'developed', absent: false, note: 'n' }] };
    const xml = await tableToXml(buildCoursePlanTable(entries, occurrencesByEntryId));
    const rows = xml.split('<w:tr>').filter(r => r.includes('</w:tr>'));
    const bodyRowXml = rows.find(r => r.includes('Ⅴ-1-6'));
    const fillCount = (bodyRowXml.match(/w:fill="FBE4D5"/g) || []).length;
    expect(fillCount).toBe(5);
  });
});

describe('groupEntriesByDomainInFirstAppearanceOrder', () => {
  it('groups entries by domain, in the order each domain first appears', () => {
    const entries = [
      { id: 1, domain: 2 }, { id: 2, domain: 1 }, { id: 3, domain: 2 }, { id: 4, domain: 1 },
    ];
    const groups = groupEntriesByDomainInFirstAppearanceOrder(entries);
    expect(groups.map(g => g.domain)).toEqual([2, 1]);
    expect(groups[0].entries.map(e => e.id)).toEqual([1, 3]);
    expect(groups[1].entries.map(e => e.id)).toEqual([2, 4]);
  });

  it('omits domains with no entries entirely (no empty group)', () => {
    const groups = groupEntriesByDomainInFirstAppearanceOrder([{ id: 1, domain: 3 }]);
    expect(groups).toEqual([{ domain: 3, entries: [{ id: 1, domain: 3 }] }]);
  });
});

describe('buildDevelopmentRecordTable', () => {
  const coursePlanEntries = [
    { id: 1, reportId: 1, indicatorCode: 'Ⅴ-1-4', activityName: '踢球球' },
  ];

  it('renders a shaded domain header, the referenced indicator+description list, and the narrative', async () => {
    const developmentRecordEntries = [
      { id: 1, reportId: 1, domain: 1, courseEntryIds: [1], narrative: '小安能輕輕地踢球' },
    ];
    const xml = await tableToXml(buildDevelopmentRecordTable(developmentRecordEntries, [], coursePlanEntries));

    expect(xml).toContain('身體動作');
    // The 適性發展紀錄表 bars are a single uniform fill in the real samples, NOT the per-domain
    // palette used by 課程計畫表's 發展領域 column (verified against the reference sample's OOXML).
    expect(xml).toContain('w:fill="F7CAAC"');
    expect(xml).not.toContain('w:fill="FBE4D5"');
    expect(xml).toContain('Ⅴ-1-4');
    expect(xml).toContain('能踢球'); // Ⅴ-1-4's official description
    expect(xml).toContain('小安能輕輕地踢球');
  });

  // Bug: DevelopmentRecordEntry.courseEntryIds may legitimately be empty (the UI does not require
  // checking any 課程計畫表 box before submitting a narrative paragraph — teachers may write general
  // observations not tied to a logged activity). The domain bar's label must come from the entry's
  // own `domain` field directly, not from an indirect lookup through a (possibly nonexistent)
  // referenced course entry, or the bar renders with no text at all.
  it('renders the domain bar label from the entry\'s own domain field, even with an empty courseEntryIds', async () => {
    const developmentRecordEntries = [
      { id: 1, reportId: 1, domain: 1, courseEntryIds: [], narrative: '小安喜歡在戶外跑跳' },
    ];
    const xml = await tableToXml(buildDevelopmentRecordTable(developmentRecordEntries, [], coursePlanEntries));

    expect(xml).toContain('身體動作'); // domain 1's name
    expect(xml).toContain('小安喜歡在戶外跑跳');
  });

  it('appends behavior observations as their own header ("行為觀察－{title}") + narrative block', async () => {
    const behaviorObservations = [{ id: 1, reportId: 1, title: '我會好好說！', narrative: '本月觀察發現...' }];
    const xml = await tableToXml(buildDevelopmentRecordTable([], behaviorObservations, coursePlanEntries));

    expect(xml).toContain('行為觀察－我會好好說！');
    expect(xml).toContain('本月觀察發現');
  });

  it('shades the 行為觀察 bar with the same section-header fill as the domain bars', async () => {
    const behaviorObservations = [{ id: 1, reportId: 1, title: '我會好好說！', narrative: 'n' }];
    const xml = await tableToXml(buildDevelopmentRecordTable([], behaviorObservations, coursePlanEntries));
    expect(xml).toContain('w:fill="F7CAAC"');
    expect(xml).not.toContain('w:fill="D9D9D9"');
  });
});

// Splits a table's XML into its individual <w:tr> rows so a test can inspect one row (e.g. the
// photo row) in isolation, without earlier/later rows' cells polluting cell/drawing counts.
function tableRows(xml) {
  return xml.match(/<w:tr>[\s\S]*?<\/w:tr>/g) || [];
}

describe('buildHighlightsTable', () => {
  it('renders 1 to 3 photos per entry side by side, plus a caption row', async () => {
    const entries = [
      { id: 1, reportId: 1, photos: [{ blob: new Blob(['a']), width: 100, height: 80 }], caption: '我最喜歡騎車車了！' },
    ];
    const table = await buildHighlightsTable(entries);
    const xml = await tableToXml(table);
    expect(xml).toContain('我最喜歡騎車車了！');
    expect(xml).toContain('<w:drawing>');
  });

  // Fix M: a photo row used to always render 3 table cells regardless of how many photos the
  // entry actually had, leaving conspicuous empty placeholder cells for 1- or 2-photo entries.
  // The table's shared grid has 6 columns (not 3) precisely so a 2-photo row can split into two
  // EXACT halves (3 grid columns each) with no leftover-width reconciliation gap - see the
  // HIGHLIGHT_GRID_COLUMN_COUNT comment in parentReportDocxExport.js for why 3 columns didn't work.
  it('renders exactly ONE photo cell, spanning the full 6-column grid, for a 1-photo entry', async () => {
    const entries = [{ id: 1, reportId: 1, photos: [{ blob: new Blob(['a']), width: 100, height: 80 }], caption: 'x' }];
    const xml = await tableToXml(await buildHighlightsTable(entries));
    const photoRow = tableRows(xml)[1]; // rows[0] is the 點滴分享 header bar
    expect((photoRow.match(/<w:drawing>/g) || []).length).toBe(1);
    expect((photoRow.match(/<w:tc>/g) || []).length).toBe(1);
    expect(photoRow).toContain('<w:gridSpan w:val="6"/>');
  });

  it('renders exactly TWO photo cells (no empty third placeholder) for a 2-photo entry, split into exact halves', async () => {
    const entries = [{
      id: 1,
      reportId: 1,
      photos: [
        { blob: new Blob(['a']), width: 100, height: 80 },
        { blob: new Blob(['b']), width: 100, height: 80 },
      ],
      caption: 'x',
    }];
    const xml = await tableToXml(await buildHighlightsTable(entries));
    const photoRow = tableRows(xml)[1];
    expect((photoRow.match(/<w:drawing>/g) || []).length).toBe(2);
    expect((photoRow.match(/<w:tc>/g) || []).length).toBe(2);
    // The two cells' gridSpans must add up to the table's declared 6-column grid, and (unlike an
    // odd-sized grid) split into an EXACT half each: 3 + 3.
    const spans = [...photoRow.matchAll(/<w:gridSpan w:val="(\d+)"\/>/g)].map(m => Number(m[1]));
    expect(spans).toEqual([3, 3]);
  });

  it('still renders exactly THREE photo cells for a 3-photo entry, unchanged from before', async () => {
    const entries = [{
      id: 1,
      reportId: 1,
      photos: [
        { blob: new Blob(['a']), width: 100, height: 80 },
        { blob: new Blob(['b']), width: 100, height: 80 },
        { blob: new Blob(['c']), width: 100, height: 80 },
      ],
      caption: 'x',
    }];
    const xml = await tableToXml(await buildHighlightsTable(entries));
    const photoRow = tableRows(xml)[1];
    expect((photoRow.match(/<w:drawing>/g) || []).length).toBe(3);
    expect((photoRow.match(/<w:tc>/g) || []).length).toBe(3);
  });

  // Pre-existing edge case (legacy/imported data can have an entry with 0 photos even though the
  // UI itself requires at least one) - must keep degrading to 3 empty placeholder cells rather
  // than dividing COURSE_PLAN_TABLE_WIDTH_DXA by zero.
  it('still renders 3 empty placeholder cells for a 0-photo entry, without dividing by zero', async () => {
    const entries = [{ id: 1, reportId: 1, photos: [], caption: 'x' }];
    const xml = await tableToXml(await buildHighlightsTable(entries));
    const photoRow = tableRows(xml)[1];
    expect((photoRow.match(/<w:drawing>/g) || []).length).toBe(0);
    expect((photoRow.match(/<w:tc>/g) || []).length).toBe(3);
    expect(xml).not.toMatch(/Infinity|NaN/);
  });

  it('shades the section header with the 點滴分享 fill color', async () => {
    const table = await buildHighlightsTable([]);
    const xml = await tableToXml(table);
    expect(xml).toContain('點滴分享');
    expect(xml).toContain('w:fill="F7CAAC"');
  });

  // Spec: "依上述四區塊＋家長回饋／簽名欄（簽名欄留空白…供列印後手寫）產生 .docx".
  it('closes the table with a 家長回饋 bar and a blank handwriting area ending in 家長簽名：', async () => {
    const xml = await tableToXml(await buildHighlightsTable([]));
    expect(xml).toContain('家長回饋');
    expect(xml).toContain('家長簽名：');
    expect(xml.indexOf('家長回饋')).toBeGreaterThan(xml.indexOf('點滴分享'));
    expect(xml.indexOf('家長簽名：')).toBeGreaterThan(xml.indexOf('家長回饋'));
  });

  it('falls back to a square aspect ratio when a photo has no known width (e.g. legacy-imported)', async () => {
    const entries = [{ id: 1, reportId: 1, photos: [{ blob: new Blob(['a']), width: 0, height: 0 }], caption: 'x' }];
    const table = await buildHighlightsTable(entries);
    const xml = await tableToXml(table);
    expect(xml).toContain('<w:drawing>'); // did not throw / divide by zero
  });
});
