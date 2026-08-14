import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { getIndicatorsForTier } from '../src/data/indicators.js';
import { generateDocxBlob } from '../src/export/docxExport.js';

const child = { name: '陳小安', birthDate: '2024-11-01' };
const form = { tier: 'Ⅳ', period: '115年01月' };

const entries = [
  { indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '可以來回穩定行走' },
  { indicatorCode: 'Ⅳ-1-1', date: '2026-02-26', status: 'developing', note: '可穩定行走至戶外遊戲場' },
  { indicatorCode: 'Ⅳ-1-2', date: '2026-01-07', status: 'developed', note: '穩定蹲下拿起地上的書本' },
  { indicatorCode: 'Ⅳ-1-2', date: '2026-02-26', status: 'developed', note: '可穩定蹲下拿起地上的小石頭' },
];

async function exportParts({ previousTierEntries } = {}) {
  const indicators = getIndicatorsForTier('Ⅳ');
  const blob = await generateDocxBlob({ child, form, indicators, entries, previousTierEntries });
  const zip = await JSZip.loadAsync(blob);

  const documentXml = await zip.file('word/document.xml').async('text');
  const headerFiles = zip.file(/word\/header\d*\.xml/);
  const headerXml = headerFiles.length > 0 ? await headerFiles[0].async('text') : '';

  return { indicators, documentXml, headerXml, zip };
}

// Parses the table into [{ merges: ['restart'|'continue'|null, ...], texts: [...] }] per row, so the
// vertical-merge scopes can be asserted structurally rather than through a magic occurrence count.
function parseTableRows(documentXml) {
  const table = documentXml.slice(documentXml.indexOf('<w:tbl>'), documentXml.lastIndexOf('</w:tbl>'));

  return table
    .split('<w:tr>')
    .slice(1)
    .map(rowXml => {
      const cells = rowXml.split('<w:tc>').slice(1);
      return {
        merges: cells.map(cell => {
          const match = /<w:vMerge(?: w:val="(\w+)")?\/>/.exec(cell);
          return match ? match[1] || 'continue' : null;
        }),
        texts: cells.map(cell =>
          (cell.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(t => t.replace(/<[^>]*>/g, '')).join('|')
        ),
      };
    });
}

describe('docx export acceptance (matches 陳小安C表-2.docx sample data)', () => {
  it('includes every recorded indicator, date, and note from the sample', async () => {
    const { indicators, documentXml } = await exportParts();

    expect(documentXml).toContain('Ⅳ-1-1');
    expect(documentXml).toContain('能獨立穩定行走');
    expect(documentXml).toContain('可以來回穩定行走');
    expect(documentXml).toContain('可穩定行走至戶外遊戲場');
    expect(documentXml).toContain('Ⅳ-1-2');
    expect(documentXml).toContain('穩定蹲下拿起地上的書本');

    // Every Ⅳ-tier indicator must appear at least once, even ones with no entries in this test.
    for (const indicator of indicators) {
      expect(documentXml).toContain(indicator.code);
    }
  });

  it('writes dates as MM/DD with the ○/△ status marker, not ISO dates', async () => {
    const { documentXml } = await exportParts();

    expect(documentXml).toContain('01/07○');
    expect(documentXml).toContain('02/26△');
    expect(documentXml).not.toContain('2026-01-07');
    expect(documentXml).not.toContain('2026-02-26');
  });

  it('uses 標楷體 for document text', async () => {
    const { documentXml, headerXml } = await exportParts();

    expect(documentXml).toContain('標楷體');
    expect(headerXml).toContain('標楷體');
  });

  it('renders the institution/child block in a real Word page header', async () => {
    const { headerXml, documentXml } = await exportParts();

    expect(headerXml).toContain('屏東縣內埔鄉社區公共托育家園嬰幼兒適性發展總表13-18個月');
    expect(headerXml).toContain('幼兒姓名：陳小安');
    // ROC-era birth date, not the stored ISO string.
    expect(headerXml).toContain('113/11/01');
    expect(headerXml).toContain('115年01月');
    // The block lives in the page header part, not in the document body.
    expect(documentXml).not.toContain('幼兒姓名');
  });

  it('computes 實際月齡 from the end of a merged form\'s "115年05月-115年08月" range, not a duplicated tier label', async () => {
    const rangeForm = { tier: 'Ⅳ', period: '115年05月-115年08月' };
    const blob = await generateDocxBlob({ child, form: rangeForm, indicators: getIndicatorsForTier('Ⅳ'), entries: [] });
    const zip = await JSZip.loadAsync(blob);
    const headerFiles = zip.file(/word\/header\d*\.xml/);
    const headerXml = await headerFiles[0].async('text');

    // 2024-11-01 (birth) to 115年08月 (2026-08-01, the range's end) is 21 months.
    expect(headerXml).toContain('實際月齡：21個月');
    expect(headerXml).not.toContain('個月個月');
    expect(headerXml).toContain('實施時間：115年05月-115年08月');
  });

  it('shrinks the 幼兒姓名/出生日期/實際月齡/實施時間 line to 11pt so a long 實施時間 range stays on one line', async () => {
    const { headerXml } = await exportParts();

    const nameIndex = headerXml.indexOf('幼兒姓名');
    const paragraph = headerXml.slice(headerXml.lastIndexOf('<w:p>', nameIndex), headerXml.indexOf('</w:p>', nameIndex));
    expect(paragraph).toContain('<w:sz w:val="22"/>');
  });

  it('builds a 7-column grid (6 data + 備註) with a two-row merged header', async () => {
    const { documentXml } = await exportParts();

    expect(documentXml).toContain(
      '<w:tblGrid><w:gridCol w:w="565"/><w:gridCol w:w="1557"/><w:gridCol w:w="992"/>' +
        '<w:gridCol w:w="1984"/><w:gridCol w:w="1560"/><w:gridCol w:w="1643"/><w:gridCol w:w="800"/></w:tblGrid>'
    );

    // Header row 1 spans 指標項次/發展活動 and 實施記錄 over two grid columns each.
    expect(documentXml).toContain('<w:gridSpan w:val="2"/>');
    expect(documentXml).toContain('指標項次/發展活動');
    expect(documentXml).toContain('實施記錄');
    expect(documentXml).toContain('備註');
    // Header row 2.
    expect(documentXml).toContain('適性發展指標活動');
    expect(documentXml).toContain('課程實施日期【已發展○】');
    expect(documentXml).toContain('課程實施記錄');
  });

  it('marks the header column with both status glyphs, matching the two possible row markers', async () => {
    const { documentXml } = await exportParts();

    expect(documentXml).toContain('課程實施日期【已發展○】');
    expect(documentXml).toContain('【發展中△】');
  });

  it('vertically merges 指標項次/發展活動 across the rows of one indicator only', async () => {
    const { documentXml } = await exportParts();

    expect(documentXml).toContain('<w:vMerge w:val="restart"/>');
    expect(documentXml).toContain('<w:vMerge w:val="continue"/>');

    // Skip the two header rows.
    const bodyRows = parseTableRows(documentXml).slice(2);

    // Ⅳ-1-1 has two entries: the first row restarts the code/description merge, the second continues it.
    expect(bodyRows[0].texts[2]).toBe('Ⅳ-1-1');
    expect(bodyRows[0].merges[2]).toBe('restart');
    expect(bodyRows[0].merges[3]).toBe('restart');
    expect(bodyRows[1].merges[2]).toBe('continue');
    expect(bodyRows[1].merges[3]).toBe('continue');

    // The next indicator restarts the code/description merge again.
    expect(bodyRows[2].texts[2]).toBe('Ⅳ-1-2');
    expect(bodyRows[2].merges[2]).toBe('restart');
    expect(bodyRows[2].merges[3]).toBe('restart');

    // The 實施記錄 columns are never merged.
    for (const row of bodyRows) {
      expect(row.merges[4]).toBeNull();
      expect(row.merges[5]).toBeNull();
    }
  });

  it('merges 發展領域/領域範疇 across every row of a domain, spanning multiple indicators', async () => {
    const { documentXml } = await exportParts();

    const bodyRows = parseTableRows(documentXml).slice(2);

    // Only the first row of each domain restarts the 發展領域/領域範疇 merge.
    const domainRestartRows = bodyRows.filter(row => row.merges[0] === 'restart');
    expect(domainRestartRows.map(row => row.texts[0])).toEqual([
      '1身體動作',
      '2社會情緒',
      '3語言溝通',
      '4認知探索',
      '5生活自理',
    ]);

    // Every other row continues it — including rows that start a brand new indicator.
    for (const row of bodyRows) {
      expect(row.merges[1]).toBe(row.merges[0]);
      if (row.merges[0] !== 'restart') {
        expect(row.merges[0]).toBe('continue');
        expect(row.merges[1]).toBe('continue');
      }
    }

    // The regression this guards: Ⅳ-1-2 opens a new indicator inside 身體動作, so its code column
    // restarts while the domain columns must keep merging up into Ⅳ-1-1.
    const indicatorStart = bodyRows.find(row => row.texts[2] === 'Ⅳ-1-2');
    expect(indicatorStart.merges[2]).toBe('restart');
    expect(indicatorStart.merges[0]).toBe('continue');
    expect(indicatorStart.merges[1]).toBe('continue');

    // A domain's merge therefore covers more rows than any single indicator has.
    const firstDomainRows = bodyRows.slice(0, bodyRows.findIndex(row => row.texts[0] === '2社會情緒'));
    const codesInFirstDomain = new Set(firstDomainRows.map(row => row.texts[2]).filter(Boolean));
    expect(codesInFirstDomain.size).toBeGreaterThan(1);
  });

  it('sets the A4 page size and the original form’s narrow margins', async () => {
    const { documentXml } = await exportParts();

    expect(documentXml).toContain('<w:pgSz w:w="11906" w:h="16838"');
    expect(documentXml).toContain(
      '<w:pgMar w:top="851" w:right="851" w:bottom="851" w:left="1134" w:header="851" w:footer="992"'
    );
  });

  it('renders the header title at 17pt with the decorative icon embedded beside it', async () => {
    const { headerXml, zip } = await exportParts();

    // 34 half-points = 17pt, as in the original header2.xml.
    expect(headerXml).toContain('<w:sz w:val="34"/>');

    // The icon is a real embedded drawing, not a placeholder.
    expect(headerXml).toContain('<w:drawing>');
    expect(headerXml).toContain('<wp:extent cx="439420" cy="448310"/>');

    const media = zip.file(/^word\/media\/.+\.png$/);
    expect(media.length).toBe(1);

    const headerRels = zip.file(/^word\/_rels\/header\d*\.xml\.rels$/);
    expect(headerRels.length).toBe(1);
    const relsXml = await headerRels[0].async('text');
    expect(relsXml).toContain(media[0].name.replace('word/', ''));
  });

  it('prints the signature lines after the table', async () => {
    const { documentXml } = await exportParts();

    const tail = documentXml.slice(documentXml.lastIndexOf('</w:tbl>'));
    // Five U+3000 ideographic spaces separate the two fields, exactly as in the original.
    expect(tail).toContain('托育人員：　　　　　主管簽名：');
    expect(tail).toContain('家長簽名：');
  });

  it('splits 領域範疇 into one paragraph per 、-separated part', async () => {
    const { documentXml } = await exportParts();

    expect(documentXml).toContain('粗動作');
    expect(documentXml).toContain('精細動作');
    // The two parts must not be rendered as a single run containing the separator.
    expect(documentXml).not.toContain('粗動作、精細動作');
  });

  it('prefixes 發展領域 with the numeric domain id', async () => {
    const { documentXml } = await exportParts();

    expect(documentXml).toContain('1身體動作');
  });

  describe('備註 column', () => {
    it('always exists as its own (7th) column, blank for the form\'s own rows', async () => {
      const { documentXml } = await exportParts();

      const bodyRows = parseTableRows(documentXml).slice(2);
      expect(bodyRows.length).toBeGreaterThan(0);
      for (const row of bodyRows) {
        expect(row.texts[6]).toBe('');
      }
    });

    it('appends a row per previous-tier developing entry after the form\'s own rows, with its note in the 備註 column (not 課程實施記錄)', async () => {
      const previousTierEntries = [
        { indicatorCode: 'Ⅲ-1-1', date: '2025-12-01', status: 'developing', note: '仍在練習扶物站立' },
      ];
      const { documentXml } = await exportParts({ previousTierEntries });

      expect(documentXml).toContain('Ⅲ-1-1');
      expect(documentXml).toContain('12/01△');

      const bodyRows = parseTableRows(documentXml).slice(2);
      const remarkRow = bodyRows.find(row => row.texts[2] === 'Ⅲ-1-1');
      expect(remarkRow).toBeDefined();
      expect(remarkRow.texts[6]).toBe('仍在練習扶物站立');
      expect(remarkRow.texts[5]).toBe(''); // not also duplicated into 課程實施記錄

      const remarkRowIndex = bodyRows.indexOf(remarkRow);
      // It comes after every one of the form's own (Ⅳ-tier) rows.
      const ownRowIndexes = bodyRows.map((row, i) => (row.texts[2]?.startsWith('Ⅳ') ? i : -1)).filter(i => i >= 0);
      expect(remarkRowIndex).toBeGreaterThan(Math.max(...ownRowIndexes));
    });
  });
});
