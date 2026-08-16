import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { parsePeriodFromTitleText, extractTitleText, parseChildNameCell, splitChildTables, parseExportedDayCellItems } from '../src/import/monthlyPlanDocxImport.js';

function zipWith({ headerXml, documentXml }) {
  const zip = new JSZip();
  if (headerXml) zip.file('word/header1.xml', headerXml);
  zip.file('word/document.xml', documentXml);
  return zip;
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

describe('parsePeriodFromTitleText', () => {
  it('extracts a clean "N年N月課程計畫" title', () => {
    expect(parsePeriodFromTitleText('115年06月課程計畫')).toBe('115年06月');
  });

  it('extracts the period even with noise digits directly before it (no separator)', () => {
    expect(parsePeriodFromTitleText('屏東縣...第1090012345號115年01月課程計畫')).toBe('115年01月');
  });

  it('pads a single-digit month to two digits', () => {
    expect(parsePeriodFromTitleText('115年6月課程計畫')).toBe('115年06月');
  });

  it('returns null when no period pattern is found', () => {
    expect(parsePeriodFromTitleText('沒有標題文字')).toBeNull();
  });
});

describe('extractTitleText', () => {
  it('prefers a header part containing the period pattern over the document body', async () => {
    const zip = zipWith({
      headerXml: `<?xml version="1.0"?><w:hdr ${NS}><w:p><w:r><w:t>115年06月課程計畫</w:t></w:r></w:p></w:hdr>`,
      documentXml: `<?xml version="1.0"?><w:document ${NS}><w:body><w:tbl></w:tbl></w:body></w:document>`,
    });
    const documentXml = await zip.file('word/document.xml').async('text');
    const text = await extractTitleText(zip, documentXml);
    expect(text).toContain('115年06月課程計畫');
  });

  it('falls back to body text before the first table when there is no header part', async () => {
    const zip = zipWith({
      documentXml: `<?xml version="1.0"?><w:document ${NS}><w:body><w:p><w:r><w:t>115年03月課程計畫</w:t></w:r></w:p><w:tbl></w:tbl></w:body></w:document>`,
    });
    const documentXml = await zip.file('word/document.xml').async('text');
    const text = await extractTitleText(zip, documentXml);
    expect(text).toContain('115年03月課程計畫');
  });
});

describe('parseChildNameCell', () => {
  it('parses this app\'s own export format: name / age / "X表" as three paragraphs', () => {
    const cellXml = `<w:p><w:r><w:t>趙萬竑</w:t></w:r></w:p><w:p><w:r><w:t>24M</w:t></w:r></w:p><w:p><w:r><w:t>D表</w:t></w:r></w:p>`;
    expect(parseChildNameCell(cellXml)).toEqual({ name: '趙萬竑', tier: 'Ⅴ' });
  });

  it('parses tier Ⅰ\'s own export, which has no letter (plain age-range label instead)', () => {
    const cellXml = `<w:p><w:r><w:t>陳小安</w:t></w:r></w:p><w:p><w:r><w:t>2M</w:t></w:r></w:p><w:p><w:r><w:t>0-3個月</w:t></w:r></w:p>`;
    expect(parseChildNameCell(cellXml)).toEqual({ name: '陳小安', tier: 'Ⅰ' });
  });

  it('parses a legacy file\'s "name / age＋slash＋trailing letter" layout, letter possibly in its own colored run', () => {
    const cellXml = `<w:p><w:r><w:t>測試寶寶</w:t></w:r></w:p><w:p><w:r><w:t>1y6m/</w:t></w:r><w:r><w:rPr><w:color w:val="FF0000"/></w:rPr><w:t>C</w:t></w:r></w:p>`;
    expect(parseChildNameCell(cellXml)).toEqual({ name: '測試寶寶', tier: 'Ⅳ' });
  });

  it('returns null tier when no recognizable tier marker is present', () => {
    expect(parseChildNameCell('<w:p><w:r><w:t>某某某</w:t></w:r></w:p>')).toEqual({ name: '某某某', tier: null });
  });

  it('returns a null name for a completely empty cell', () => {
    expect(parseChildNameCell('')).toEqual({ name: null, tier: null });
  });
});

function row(cells) {
  return `<w:tr>${cells.map(c => `<w:tc>${c}</w:tc>`).join('')}</w:tr>`;
}

// 2-week, 1-child table: header row + 5 weekday (date,content) row pairs + trailing note row.
function buildTableXml({ nameCellXml = '<w:p><w:r><w:t>小明</w:t></w:r></w:p>', weeksCount = 2, cellForDay } = {}) {
  const headerRow = row(['日期/姓名', ...Array.from({ length: weeksCount }, () => '第N週')]);
  const bodyRows = [];
  for (let weekday = 1; weekday <= 5; weekday += 1) {
    const dateCells = Array.from({ length: weeksCount }, (_, i) => `<w:p><w:r><w:t>0${weekday}/0${i + 1}</w:t></w:r></w:p>`);
    const contentCells = Array.from({ length: weeksCount }, (_, i) =>
      cellForDay ? cellForDay(weekday, i + 1) : `<w:p><w:r><w:t>content-w${i + 1}-d${weekday}</w:t></w:r></w:p>`
    );
    bodyRows.push(row([weekday === 1 ? nameCellXml : '', ...dateCells]));
    bodyRows.push(row(['', ...contentCells]));
  }
  const trailingRow = row(['節氣', ...Array.from({ length: weeksCount }, () => '')]);
  return `<w:tbl>${headerRow}${bodyRows.join('')}${trailingRow}</w:tbl>`;
}

describe('splitChildTables', () => {
  it('splits one <w:tbl> per child, each into positional day cells', () => {
    const documentXml = `<w:body>${buildTableXml()}</w:body>`;
    const tables = splitChildTables(documentXml);

    expect(tables).toHaveLength(1);
    expect(tables[0].nameCellXml).toContain('小明');
    expect(tables[0].days).toHaveLength(10); // 5 weekdays x 2 weeks
  });

  it('recovers weekIndex/weekday purely from column/row-pair position', () => {
    const documentXml = `<w:body>${buildTableXml({ weeksCount: 2 })}</w:body>`;
    const [{ days }] = splitChildTables(documentXml);

    const wed2 = days.find(d => d.weekIndex === 2 && d.weekday === 3);
    expect(wed2.contentCellXml).toContain('content-w2-d3');
  });

  it('handles two children (two <w:tbl> elements) independently', () => {
    const documentXml = `<w:body>${buildTableXml({ nameCellXml: '<w:p><w:r><w:t>甲</w:t></w:r></w:p>' })}${buildTableXml({ nameCellXml: '<w:p><w:r><w:t>乙</w:t></w:r></w:p>' })}</w:body>`;
    const tables = splitChildTables(documentXml);

    expect(tables).toHaveLength(2);
    expect(tables[0].nameCellXml).toContain('甲');
    expect(tables[1].nameCellXml).toContain('乙');
  });
});

function plainRun(text) {
  return `<w:r><w:t>${text}</w:t></w:r>`;
}
function styledRun(text, { color, strike } = {}) {
  const rPr = `<w:rPr>${color ? '<w:color w:val="FF0000"/>' : ''}${strike ? '<w:strike/>' : ''}</w:rPr>`;
  return `<w:r>${rPr}<w:t>${text}</w:t></w:r>`;
}

describe('parseExportedDayCellItems', () => {
  it('parses an indicator item as code/name/text with no override', () => {
    const cellXml = `<w:p>${plainRun('Ⅴ-4-3')}${plainRun('【分類遊戲】')}${plainRun('能依形狀或顏色分類')}</w:p>`;
    expect(parseExportedDayCellItems(cellXml)).toEqual([
      { indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲', indicatorText: '能依形狀或顏色分類', notAchieved: false, replaced: false, replacementText: '' },
    ]);
  });

  it('parses a free (no-indicator) single-line item', () => {
    const cellXml = `<w:p>${plainRun('大團體活動')}</w:p>`;
    expect(parseExportedDayCellItems(cellXml)).toEqual([
      { indicatorCode: null, activityName: '大團體活動', indicatorText: '', notAchieved: false, replaced: false, replacementText: '' },
    ]);
  });

  it('parses a tier-Ⅵ item with no activity name (code + text only, two lines)', () => {
    const cellXml = `<w:p>${plainRun('Ⅵ-1-1')}${plainRun('會手心朝下丟球或東西')}</w:p>`;
    const [item] = parseExportedDayCellItems(cellXml);
    expect(item).toMatchObject({ indicatorCode: 'Ⅵ-1-1', activityName: '', indicatorText: '會手心朝下丟球或東西' });
  });

  it('detects notAchieved from a colored run', () => {
    const cellXml = `<w:p>${styledRun('拼拼圖', { color: true })}</w:p>`;
    expect(parseExportedDayCellItems(cellXml)[0]).toMatchObject({ notAchieved: true, replaced: false });
  });

  it('detects replaced + replacementText from struck runs plus a trailing plain run', () => {
    const cellXml = `<w:p>${styledRun('拼拼圖', { strike: true })}${plainRun('請假')}</w:p>`;
    expect(parseExportedDayCellItems(cellXml)[0]).toMatchObject({ activityName: '拼拼圖', replaced: true, replacementText: '請假' });
  });

  it('handles replaced with no replacementText (no trailing run at all)', () => {
    const cellXml = `<w:p>${styledRun('拼拼圖', { strike: true })}</w:p>`;
    expect(parseExportedDayCellItems(cellXml)[0]).toMatchObject({ replaced: true, replacementText: '' });
  });

  it('preserves item order across multiple items in one cell', () => {
    const cellXml = `<w:p>${plainRun('a')}</w:p><w:p>${plainRun('b')}</w:p>`;
    expect(parseExportedDayCellItems(cellXml).map(i => i.activityName)).toEqual(['a', 'b']);
  });

  it('returns an empty array for an empty/placeholder cell', () => {
    expect(parseExportedDayCellItems('<w:p></w:p>')).toEqual([]);
  });
});
