import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { parsePeriodFromTitleText, extractTitleText, parseChildNameCell, splitChildTables, parseExportedDayCellItems, parseLegacyDayCellItems, parseDayCellItems, buildSlotsAndOverrides, parseMonthlyPlanDocxImport } from '../src/import/monthlyPlanDocxImport.js';

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

  it('tolerates a title typo\'d without the trailing "畫" (real legacy file: 西瓜班-01月計畫.docx)', () => {
    expect(parsePeriodFromTitleText('...托嬰中心115年01月課程計')).toBe('115年01月');
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

  it('parses a legacy file\'s fullwidth tier letter (real legacy file: 西瓜班-02月計畫.docx uses "Ｃ")', () => {
    const cellXml = `<w:p><w:r><w:t>測試寶寶</w:t></w:r></w:p><w:p><w:r><w:t>1y6m/Ｃ</w:t></w:r></w:p>`;
    expect(parseChildNameCell(cellXml)).toEqual({ name: '測試寶寶', tier: 'Ⅳ' });
  });

  it('joins a legacy file\'s name split one-CJK-character-per-paragraph (real legacy file: 西瓜班-01月計畫.docx "鍾"/"晴"/"妍")', () => {
    const cellXml = `<w:p><w:r><w:t>鍾</w:t></w:r></w:p><w:p><w:r><w:t>晴</w:t></w:r></w:p><w:p><w:r><w:t>妍</w:t></w:r></w:p><w:p><w:r><w:t>1y</w:t></w:r></w:p><w:p><w:r><w:t>05m/C</w:t></w:r></w:p>`;
    expect(parseChildNameCell(cellXml)).toEqual({ name: '鍾晴妍', tier: 'Ⅳ' });
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

function legacyParagraph(text, { strike = false } = {}) {
  const rPr = strike ? '<w:rPr><w:strike/></w:rPr>' : '';
  return `<w:p><w:r>${rPr}<w:t>${text}</w:t></w:r></w:p>`;
}
function legacyParagraphWithColor(text) {
  return `<w:p><w:r><w:rPr><w:color w:val="FF0000"/></w:rPr><w:t>${text}</w:t></w:r></w:p>`;
}

describe('parseLegacyDayCellItems', () => {
  it('splits one paragraph containing a single 【name】code text item, code-first ordering', () => {
    const contentCellXml = legacyParagraph('Ⅲ-1-2內容文字【換一隻手】OK');
    const [item] = parseLegacyDayCellItems('<w:p></w:p>', contentCellXml);
    expect(item).toMatchObject({ indicatorCode: 'Ⅲ-1-2', activityName: '換一隻手', indicatorText: '內容文字' });
  });

  it('splits one paragraph containing a single 【name】code text item, name-first ordering', () => {
    const contentCellXml = legacyParagraph('【換一隻手】Ⅲ-1-2內容文字');
    const [item] = parseLegacyDayCellItems('<w:p></w:p>', contentCellXml);
    expect(item).toMatchObject({ indicatorCode: 'Ⅲ-1-2', activityName: '換一隻手' });
  });

  it('splits two indicator codes concatenated in one paragraph into two items', () => {
    const contentCellXml = legacyParagraph('Ⅲ-1-2【換一隻手】文字一Ⅲ-2-1【打招呼】文字二');
    const items = parseLegacyDayCellItems('<w:p></w:p>', contentCellXml);
    expect(items.map(i => i.indicatorCode)).toEqual(['Ⅲ-1-2', 'Ⅲ-2-1']);
  });

  it('treats a paragraph with no indicator code as a free activity', () => {
    const contentCellXml = legacyParagraph('大團體活動');
    expect(parseLegacyDayCellItems('<w:p></w:p>', contentCellXml)[0]).toMatchObject({ indicatorCode: null, activityName: '大團體活動' });
  });

  it('detects notAchieved from a red-colored paragraph', () => {
    const contentCellXml = legacyParagraphWithColor('Ⅲ-1-2【換一隻手】文字');
    expect(parseLegacyDayCellItems('<w:p></w:p>', contentCellXml)[0]).toMatchObject({ notAchieved: true });
  });

  it('detects replaced via strike + a following plain "請假" paragraph', () => {
    const contentCellXml = legacyParagraph('Ⅲ-1-2【換一隻手】文字', { strike: true }) + legacyParagraph('請假');
    const items = parseLegacyDayCellItems('<w:p></w:p>', contentCellXml);
    expect(items).toHaveLength(1); // the "請假" paragraph is consumed, not its own item
    expect(items[0]).toMatchObject({ replaced: true, replacementText: '請假' });
  });

  it('detects replaced via a "（請假）" marker on the date cell, applied to every item that day', () => {
    const dateCellXml = '<w:p><w:r><w:t>01/14（請假）</w:t></w:r></w:p>';
    const contentCellXml = legacyParagraph('Ⅲ-1-2【換一隻手】文字一') + legacyParagraph('大團體活動');
    const items = parseLegacyDayCellItems(dateCellXml, contentCellXml);
    expect(items.every(i => i.replaced && i.replacementText === '請假')).toBe(true);
  });

  it('returns an empty array for an empty cell', () => {
    expect(parseLegacyDayCellItems('<w:p></w:p>', '<w:p></w:p>')).toEqual([]);
  });
});

describe('parseDayCellItems', () => {
  it('uses the precise parser when the cell matches our own export format', () => {
    const contentCellXml = `<w:p>${plainRun('大團體活動')}</w:p>`;
    expect(parseDayCellItems('<w:p></w:p>', contentCellXml)).toEqual([
      { indicatorCode: null, activityName: '大團體活動', indicatorText: '', notAchieved: false, replaced: false, replacementText: '' },
    ]);
  });

  it('falls back to the legacy parser when the precise parser finds nothing', () => {
    const contentCellXml = legacyParagraph('Ⅲ-1-2【換一隻手】文字OK');
    const items = parseDayCellItems('<w:p></w:p>', contentCellXml);
    expect(items[0]).toMatchObject({ indicatorCode: 'Ⅲ-1-2', activityName: '換一隻手' });
  });

  it('returns an empty array for a genuinely empty cell (no fallback false-positive)', () => {
    expect(parseDayCellItems('<w:p></w:p>', '<w:p></w:p>')).toEqual([]);
  });

  it('does not merge a real precise-path code-only item into an unrelated following free-activity item', () => {
    // This app's own editor allows saving a code-only item (indicatorCode set,
    // activityName/indicatorText both empty), and the exporter round-trips it
    // as a single-line paragraph. The legacy-only merge heuristic must not
    // treat this as its "code / name / text as 3 paragraphs" pattern and eat
    // the unrelated item that happens to follow it.
    const contentCellXml = `<w:p>${plainRun('Ⅵ-1-1')}</w:p><w:p>${plainRun('自由活動時間')}</w:p>`;
    const items = parseDayCellItems('<w:p></w:p>', contentCellXml);
    expect(items).toEqual([
      { indicatorCode: 'Ⅵ-1-1', activityName: '', indicatorText: '', notAchieved: false, replaced: false, replacementText: '' },
      { indicatorCode: null, activityName: '自由活動時間', indicatorText: '', notAchieved: false, replaced: false, replacementText: '' },
    ]);
  });

  it('does not fall back to the legacy parser just because a real item\'s own text mentions another code', () => {
    // A legitimate own-export item's indicatorText can itself contain a
    // code-shaped substring (e.g. a note referencing another indicator).
    // That substring is already inside a correctly-recognized field and must
    // not be counted as a "missed" code that forces legacy re-parsing.
    const contentCellXml = `<w:p>${plainRun('Ⅴ-4-3')}${plainRun('【分類遊戲】')}${plainRun('可搭配Ⅲ-1-2一起練習')}</w:p>`;
    const items = parseDayCellItems('<w:p></w:p>', contentCellXml);
    expect(items).toEqual([
      { indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲', indicatorText: '可搭配Ⅲ-1-2一起練習', notAchieved: false, replaced: false, replacementText: '' },
    ]);
  });
});

describe('buildSlotsAndOverrides', () => {
  const item = (over = {}) => ({ indicatorCode: 'Ⅲ-1-2', activityName: '換一隻手', indicatorText: '文字', notAchieved: false, replaced: false, replacementText: '', ...over });

  it('uses the first same-tier child\'s cell as the canonical slot content', () => {
    const children = [
      { name: '甲', tier: 'Ⅲ', days: [{ weekIndex: 1, weekday: 1, items: [item()] }] },
      { name: '乙', tier: 'Ⅲ', days: [{ weekIndex: 1, weekday: 1, items: [item()] }] },
    ];
    const { slotsByTier } = buildSlotsAndOverrides(children);
    expect(slotsByTier.get('Ⅲ')).toEqual([
      { weekIndex: 1, weekday: 1, items: [{ indicatorCode: 'Ⅲ-1-2', activityName: '換一隻手', indicatorText: '文字' }] },
    ]);
  });

  it('records a per-child override by item index without touching canonical content', () => {
    const children = [
      { name: '甲', tier: 'Ⅲ', days: [{ weekIndex: 1, weekday: 1, items: [item()] }] },
      { name: '乙', tier: 'Ⅲ', days: [{ weekIndex: 1, weekday: 1, items: [item({ notAchieved: true })] }] },
    ];
    const { children: withOverrides } = buildSlotsAndOverrides(children);
    expect(withOverrides[0].overrides).toEqual([]);
    expect(withOverrides[1].overrides).toEqual([
      { weekIndex: 1, weekday: 1, itemIndex: 0, notAchieved: true, replaced: false, replacementText: '' },
    ]);
  });

  it('ignores a same-tier child\'s extra items beyond the canonical count, no warning/crash', () => {
    const children = [
      { name: '甲', tier: 'Ⅲ', days: [{ weekIndex: 1, weekday: 1, items: [item()] }] },
      { name: '乙', tier: 'Ⅲ', days: [{ weekIndex: 1, weekday: 1, items: [item(), item({ replaced: true })] }] },
    ];
    const { children: withOverrides } = buildSlotsAndOverrides(children);
    expect(withOverrides[1].overrides).toEqual([
      { weekIndex: 1, weekday: 1, itemIndex: 1, notAchieved: false, replaced: true, replacementText: '' },
    ]);
  });

  it('keeps different tiers independent', () => {
    const children = [
      { name: '甲', tier: 'Ⅲ', days: [{ weekIndex: 1, weekday: 1, items: [item()] }] },
      { name: '乙', tier: 'Ⅴ', days: [{ weekIndex: 1, weekday: 1, items: [item({ activityName: '不同內容' })] }] },
    ];
    const { slotsByTier } = buildSlotsAndOverrides(children);
    expect(slotsByTier.get('Ⅲ')[0].items[0].activityName).toBe('換一隻手');
    expect(slotsByTier.get('Ⅴ')[0].items[0].activityName).toBe('不同內容');
  });
});

describe('parseMonthlyPlanDocxImport', () => {
  it('assembles period, children, slotsByTier, and warns on missing/unrecognized data', async () => {
    const zip = new JSZip();
    zip.file(
      'word/header1.xml',
      `<?xml version="1.0"?><w:hdr ${NS}><w:p><w:r><w:t>115年06月課程計畫</w:t></w:r></w:p></w:hdr>`
    );
    const nameCellXml = '<w:p><w:r><w:t>趙萬竑</w:t></w:r></w:p><w:p><w:r><w:t>24M</w:t></w:r></w:p><w:p><w:r><w:t>D表</w:t></w:r></w:p>';
    const tableXml = buildTableXml({
      nameCellXml,
      weeksCount: 1,
      cellForDay: (weekday, weekIndex) =>
        weekday === 1 && weekIndex === 1 ? `<w:p>${plainRun('Ⅴ-4-3')}${plainRun('【分類遊戲】')}${plainRun('能依形狀或顏色分類')}</w:p>` : '<w:p></w:p>',
    });
    zip.file('word/document.xml', `<?xml version="1.0"?><w:document ${NS}><w:body>${tableXml}</w:body></w:document>`);

    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    const parsed = await parseMonthlyPlanDocxImport(buffer);

    expect(parsed.period).toBe('115年06月');
    expect(parsed.children).toHaveLength(1);
    expect(parsed.children[0]).toMatchObject({ name: '趙萬竑', tier: 'Ⅴ' });
    expect(parsed.slotsByTier['Ⅴ'][0]).toMatchObject({ weekIndex: 1, weekday: 1, items: [{ indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲' }] });
    expect(parsed.warnings).toEqual([]);
  });

  it('warns when the period cannot be found', async () => {
    const zip = new JSZip();
    const nameCellXml = '<w:p><w:r><w:t>某某某</w:t></w:r></w:p><w:p><w:r><w:t>D表</w:t></w:r></w:p>';
    zip.file('word/document.xml', `<?xml version="1.0"?><w:document ${NS}><w:body>${buildTableXml({ nameCellXml, weeksCount: 1 })}</w:body></w:document>`);

    const parsed = await parseMonthlyPlanDocxImport(await zip.generateAsync({ type: 'arraybuffer' }));
    expect(parsed.period).toBeNull();
    expect(parsed.warnings).toContain('無法從檔案中判斷課程計畫的年月，請手動選擇');
  });

  it('warns per child when name or tier cannot be determined', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', `<?xml version="1.0"?><w:document ${NS}><w:body>${buildTableXml({ nameCellXml: '', weeksCount: 1 })}</w:body></w:document>`);

    const parsed = await parseMonthlyPlanDocxImport(await zip.generateAsync({ type: 'arraybuffer' }));
    expect(parsed.warnings.some(w => w.includes('姓名'))).toBe(true);
    expect(parsed.warnings.some(w => w.includes('月齡階段'))).toBe(true);
  });

  it('warns when an item\'s indicator code cannot be resolved to a known indicator', async () => {
    const zip = new JSZip();
    const nameCellXml = '<w:p><w:r><w:t>某某某</w:t></w:r></w:p><w:p><w:r><w:t>D表</w:t></w:r></w:p>';
    const tableXml = buildTableXml({
      nameCellXml,
      weeksCount: 1,
      cellForDay: (weekday, weekIndex) =>
        weekday === 1 && weekIndex === 1 ? `<w:p>${plainRun('Ⅴ-9-9')}${plainRun('【未知】')}${plainRun('未知指標')}</w:p>` : '<w:p></w:p>',
    });
    zip.file('word/document.xml', `<?xml version="1.0"?><w:document ${NS}><w:body>${tableXml}</w:body></w:document>`);

    const parsed = await parseMonthlyPlanDocxImport(await zip.generateAsync({ type: 'arraybuffer' }));
    expect(parsed.warnings).toContain('部分指標代碼無法對應到系統內建的指標，這些項目匯入後可能無法正確顯示，建議確認後再匯入');
  });
});
