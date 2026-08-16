import { describe, it, expect } from 'vitest';
import {
  parseCoursePlanTable,
  parseHeaderInfo,
  parseRecordBlocks,
  extractHighlightPhotoGroups,
  parseParentReportDocxImport,
} from '../src/import/parentReportDocxImport.js';

const FIXTURE_XML = `
<w:tbl>
<w:tr><w:tc><w:p><w:r><w:t>發展領域</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>指標</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>活動名稱/能力指標</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>課程實施日期</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>說明</w:t></w:r></w:p></w:tc></w:tr>
<w:tr>
  <w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>身體動作</w:t></w:r></w:p></w:tc>
  <w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>Ⅴ-1-6</w:t></w:r></w:p></w:tc>
  <w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>【我愛畫畫】</w:t></w:r></w:p><w:p><w:r><w:t>能拿筆塗鴉</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>06/11○</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>小安能拿著海綿印章畫畫</w:t></w:r></w:p></w:tc>
</w:tr>
<w:tr>
  <w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc>
  <w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc>
  <w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc>
  <w:tc><w:p><w:r><w:rPr><w:strike/></w:rPr><w:t>06/10</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:rPr><w:strike/></w:rPr><w:t>請假</w:t></w:r></w:p></w:tc>
</w:tr>
</w:tbl>
`;

describe('parseCoursePlanTable', () => {
  it('parses the entry (indicator code + activity name + indicator text from the second paragraph)', () => {
    const { entries } = parseCoursePlanTable(FIXTURE_XML);
    expect(entries).toEqual([{ indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫', indicatorText: '能拿筆塗鴉' }]);
  });

  // Bug: a real legacy file's author sometimes typed the tier prefix using the ordinary ASCII
  // Latin letter "V" (U+0056) instead of the Unicode Roman numeral "Ⅴ" (U+2164) that
  // src/data/indicators.js's reference codes use. getIndicator() does an exact string match, so an
  // un-normalized Latin-prefixed code silently fails to resolve to any indicator/domain downstream
  // (export grouping, UI display, etc.) even though the code text itself displays fine. The fix
  // normalizes the tier prefix to the canonical Unicode Roman numeral at parse time.
  it('normalizes a Latin-letter tier prefix ("V-2-1") to the Unicode Roman numeral ("Ⅴ-2-1")', () => {
    const xml = FIXTURE_XML.replace('Ⅴ-1-6', 'V-2-1');
    const { entries } = parseCoursePlanTable(xml);
    expect(entries[0].indicatorCode).toBe('Ⅴ-2-1');
  });

  it('leaves an already-canonical Unicode tier prefix ("Ⅴ-1-4") unchanged (idempotent)', () => {
    const xml = FIXTURE_XML.replace('Ⅴ-1-6', 'Ⅴ-1-4');
    const { entries } = parseCoursePlanTable(xml);
    expect(entries[0].indicatorCode).toBe('Ⅴ-1-4');
  });

  it('normalizes a multi-letter Latin tier prefix ("IV-1-1") to its Unicode Roman numeral ("Ⅳ-1-1"), matching the longest prefix first', () => {
    const xml = FIXTURE_XML.replace('Ⅴ-1-6', 'IV-1-1');
    const { entries } = parseCoursePlanTable(xml);
    expect(entries[0].indicatorCode).toBe('Ⅳ-1-1');
  });

  it('parses an achieved occurrence with the date and note', () => {
    const { occurrencesByEntryIndex } = parseCoursePlanTable(FIXTURE_XML);
    expect(occurrencesByEntryIndex[0][0]).toEqual({
      date: '06-11', status: 'developed', absent: false, note: '小安能拿著海綿印章畫畫',
    });
  });

  it('parses a struck-through row as absent, with no status glyph required', () => {
    const { occurrencesByEntryIndex } = parseCoursePlanTable(FIXTURE_XML);
    expect(occurrencesByEntryIndex[0][1]).toEqual({ date: '06-10', status: null, absent: true, note: '請假' });
  });
});

describe('parseHeaderInfo', () => {
  it('extracts name, ROC birth date converted to ISO, and record period', () => {
    const headerText = '屏東縣內埔鄉育英公設民營托嬰中心每月課程計畫表(19~24 個月) 幼兒姓名：陳小安 出生年月日：113.06.20 實際月齡：22 個月 紀錄時間：115 年 06 月';
    expect(parseHeaderInfo(headerText)).toEqual({ name: '陳小安', birthDate: '2024-06-20', period: '115年06月' });
  });

  // A real sample (06陳禹彤-115年4月適性紀錄-家長 115.5.15.docx) uses the 適性總表 template's own
  // labels ("出生日期"/"實施時間") instead of this template's usual ones, with everything else the
  // same shape — verified this silently dropped both the birth date and record period before.
  it('also accepts the 適性總表 template\'s alternate labels ("出生日期"/"實施時間")', () => {
    const headerText = '屏東縣內埔鄉育英公設民營托嬰中心每月課程實施計畫表(19-24 個月) 幼兒姓名：陳禹彤 出生日期：113/09/16 實際月齡： 19個月 實施時間：115 年 4 月';
    expect(parseHeaderInfo(headerText)).toEqual({ name: '陳禹彤', birthDate: '2024-09-16', period: '115年04月' });
  });
});

describe('parseRecordBlocks', () => {
  const SECOND_TABLE_XML = `
    <w:tbl>
    <w:tr><w:tc><w:tcPr><w:gridSpan w:val="6"/></w:tcPr><w:p><w:r><w:t>身體動作</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:tcPr><w:gridSpan w:val="6"/></w:tcPr><w:p><w:r><w:t>V-1-6 能拿筆塗鴉</w:t></w:r></w:p><w:p><w:r><w:t>小安能輕鬆畫畫</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:tcPr><w:gridSpan w:val="6"/></w:tcPr><w:p><w:r><w:t>行為觀察－我會好好說！</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:tcPr><w:gridSpan w:val="6"/></w:tcPr><w:p><w:r><w:t>本月觀察發現...</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
  `;

  it('pairs each shaded header row with its following content row, in order', () => {
    const blocks = parseRecordBlocks(SECOND_TABLE_XML);
    expect(blocks).toEqual([
      { label: '身體動作', rawText: 'V-1-6 能拿筆塗鴉\n小安能輕鬆畫畫' },
      { label: '行為觀察－我會好好說！', rawText: '本月觀察發現...' },
    ]);
  });
});

describe('extractHighlightPhotoGroups', () => {
  const HIGHLIGHTS_XML = `
    <w:tbl>
    <w:tr><w:tc><w:tcPr><w:gridSpan w:val="3"/></w:tcPr><w:p><w:r><w:t>點滴分享</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr>
      <w:tc><w:p><w:r><w:drawing/></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:drawing/></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:drawing/></w:r></w:p></w:tc>
    </w:tr>
    <w:tr><w:tc><w:tcPr><w:gridSpan w:val="3"/></w:tcPr><w:p><w:r><w:t>我最喜歡騎車車了！</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr>
      <w:tc><w:p><w:r><w:drawing/></w:r></w:p></w:tc>
      <w:tc><w:p></w:p></w:tc>
      <w:tc><w:p></w:p></w:tc>
    </w:tr>
    <w:tr><w:tc><w:tcPr><w:gridSpan w:val="3"/></w:tcPr><w:p><w:r><w:t>一張就好</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
  `;

  it('counts drawings per photo row and pairs each group with its following caption', () => {
    const groups = extractHighlightPhotoGroups(HIGHLIGHTS_XML);
    expect(groups).toEqual([
      { photoCount: 3, caption: '我最喜歡騎車車了！' },
      { photoCount: 1, caption: '一張就好' },
    ]);
  });
});

describe('parseParentReportDocxImport', () => {
  it('returns warnings when header info cannot be found, without throwing', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('word/document.xml', '<w:document><w:body></w:body></w:document>');
    const blob = await zip.generateAsync({ type: 'blob' });

    const result = await parseParentReportDocxImport(blob);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.coursePlanEntries).toEqual([]);
  });

  // A real legacy sample file (verified once during Task 21, not committed to this repo) turned
  // out to separate "行為觀察" from its title with an ordinary ASCII hyphen (U+002D), not the
  // fullwidth "－" (U+FF0D) this project's own docx export always writes. classifyRecordBlocks
  // must accept either separator so legacy files import correctly, not just files this app wrote.
  const COURSE_PLAN_TABLE_XML = `
    <w:tbl>
    <w:tr><w:tc><w:p><w:r><w:t>發展領域</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>指標</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>活動名稱/能力指標</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>課程實施日期</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>說明</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
  `;

  async function importWithSecondTable(secondTableXml) {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const documentXml = `<w:document><w:body>${COURSE_PLAN_TABLE_XML}${secondTableXml}</w:body></w:document>`;
    zip.file('word/document.xml', documentXml);
    const blob = await zip.generateAsync({ type: 'blob' });
    return parseParentReportDocxImport(blob);
  }

  it('classifies a 行為觀察 block separated by an ASCII hyphen (legacy file format) as a behavior observation', async () => {
    const secondTableXml = `
      <w:tbl>
      <w:tr><w:tc><w:tcPr><w:gridSpan w:val="6"/></w:tcPr><w:p><w:r><w:t>行為觀察-我會好好說！</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:tcPr><w:gridSpan w:val="6"/></w:tcPr><w:p><w:r><w:t>本月觀察發現...</w:t></w:r></w:p></w:tc></w:tr>
      </w:tbl>
    `;
    const result = await importWithSecondTable(secondTableXml);
    expect(result.behaviorObservations).toEqual([{ title: '我會好好說！', narrative: '本月觀察發現...' }]);
    expect(result.warnings).not.toContain(expect.stringContaining('無法辨識的段落標題'));
  });

  it('still classifies a 行為觀察 block separated by the fullwidth "－" (this project\'s own export format) as a behavior observation', async () => {
    const secondTableXml = `
      <w:tbl>
      <w:tr><w:tc><w:tcPr><w:gridSpan w:val="6"/></w:tcPr><w:p><w:r><w:t>行為觀察－我會好好說！</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:tcPr><w:gridSpan w:val="6"/></w:tcPr><w:p><w:r><w:t>本月觀察發現...</w:t></w:r></w:p></w:tc></w:tr>
      </w:tbl>
    `;
    const result = await importWithSecondTable(secondTableXml);
    expect(result.behaviorObservations).toEqual([{ title: '我會好好說！', narrative: '本月觀察發現...' }]);
  });

  // Regression (real sample: 張珏銨-115年04月適性紀錄(家長版).docx): a real 課程計畫表 can be split
  // across TWO physical <w:tbl> elements (each repeating the header row), e.g. from a page break.
  // Treating only the first as the course-plan table used to silently drop every entry in the
  // second one, AND misclassify it as the 適性發展紀錄表 table instead — producing a garbled
  // "無法辨識的段落標題" warning built from squished course-plan row text, and losing the real
  // 適性發展紀錄表 content entirely.
  it('merges a 課程計畫表 split across two <w:tbl> elements, and still finds the real record table after it', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const secondCoursePlanTableXml = `
      <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>發展領域</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>指標</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>活動名稱/能力指標</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>課程實施日期</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>說明</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>語言溝通</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Ⅴ-3-4</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>【故事魔毯】</w:t></w:r></w:p><w:p><w:r><w:t>能自己閱讀圖畫書</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>04/09○</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>會主動拿繪本閱讀</w:t></w:r></w:p></w:tc>
      </w:tr>
      </w:tbl>
    `;
    const recordTableXml = `
      <w:tbl>
      <w:tr><w:tc><w:tcPr><w:gridSpan w:val="6"/></w:tcPr><w:p><w:r><w:t>語言溝通</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:tcPr><w:gridSpan w:val="6"/></w:tcPr><w:p><w:r><w:t>本月觀察發現...</w:t></w:r></w:p></w:tc></w:tr>
      </w:tbl>
    `;
    const documentXml = `<w:document><w:body>${COURSE_PLAN_TABLE_XML.replace(
      '</w:tr>',
      `</w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>身體動作</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Ⅴ-1-6</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>【我愛畫畫】</w:t></w:r></w:p><w:p><w:r><w:t>能拿筆塗鴉</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>04/08○</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>能拿起畫筆沾取顏料</w:t></w:r></w:p></w:tc>
      </w:tr>`
    )}${secondCoursePlanTableXml}${recordTableXml}</w:body></w:document>`;
    zip.file('word/document.xml', documentXml);
    const blob = await zip.generateAsync({ type: 'blob' });

    const result = await parseParentReportDocxImport(blob);

    expect(result.coursePlanEntries.map(e => e.indicatorCode)).toEqual(['Ⅴ-1-6', 'Ⅴ-3-4']);
    expect(result.warnings).not.toContain(expect.stringContaining('無法辨識的段落標題'));
    expect(result.developmentRecordBlocks).toHaveLength(1);
    expect(result.developmentRecordBlocks[0].narrative).toBe('本月觀察發現...');
  });

  // Regression: classifyRecordBlocks (internal, not exported) extracts indicator codes referenced
  // inside a 適性發展紀錄表 narrative paragraph via its own regex, then cross-references those
  // against coursePlanEntries' indicatorCode to link the paragraph back to the course-plan item it
  // describes. That extraction regex used to only recognize the Unicode Roman numeral tier prefix
  // — so a narrative written with the same Latin-letter typo ("V-1-6") that parseCoursePlanTable
  // now normalizes away in the CODE CELL would never match the course-plan entry's now-Unicode
  // indicatorCode ("Ⅴ-1-6"), and courseEntryIndexes would silently come back empty even though the
  // reference is unambiguous to a human reader. Traced end-to-end through
  // parseParentReportDocxImport (not classifyRecordBlocks in isolation), matching how the real
  // failure was found in review: a real course-plan entry with normalized indicatorCode "Ⅴ-1-6"
  // (FIXTURE_XML's entry) must still be linked when the matching 身體動作 narrative block
  // references it as Latin "V-1-6".
  it('links a development-record block to its course-plan entry when the narrative references the indicator using a Latin-letter tier prefix', async () => {
    const secondTableXml = `
      <w:tbl>
      <w:tr><w:tc><w:tcPr><w:gridSpan w:val="6"/></w:tcPr><w:p><w:r><w:t>身體動作</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:tcPr><w:gridSpan w:val="6"/></w:tcPr><w:p><w:r><w:t>V-1-6 能拿筆塗鴉</w:t></w:r></w:p><w:p><w:r><w:t>小安能輕鬆畫畫</w:t></w:r></w:p></w:tc></w:tr>
      </w:tbl>
    `;
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const documentXml = `<w:document><w:body>${FIXTURE_XML}${secondTableXml}</w:body></w:document>`;
    zip.file('word/document.xml', documentXml);
    const blob = await zip.generateAsync({ type: 'blob' });

    const result = await parseParentReportDocxImport(blob);

    expect(result.coursePlanEntries[0].indicatorCode).toBe('Ⅴ-1-6'); // sanity: entry is normalized
    expect(result.developmentRecordBlocks).toHaveLength(1);
    expect(result.developmentRecordBlocks[0].courseEntryIndexes).toEqual([0]);
  });

  // Bug: the real document template embeds 2 header badge/logo <w:drawing> images (referenced
  // only from word/header*.xml), which Word saves into the SAME word/media/imageN numeric
  // sequence as the body's 點滴分享 photos, at the front. extractSortedMediaImages must skip past
  // however many <w:drawing> elements appear across all header*/footer*.xml parts before handing
  // images to the highlight-group consumption cursor, or every real legacy file's photos are
  // misassigned by that many images.
  const HIGHLIGHTS_SECOND_TABLE_XML = `
    <w:tbl>
    <w:tr><w:tc><w:tcPr><w:gridSpan w:val="3"/></w:tcPr><w:p><w:r><w:t>點滴分享</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr>
      <w:tc><w:p><w:r><w:drawing/></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:drawing/></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:drawing/></w:r></w:p></w:tc>
    </w:tr>
    <w:tr><w:tc><w:tcPr><w:gridSpan w:val="3"/></w:tcPr><w:p><w:r><w:t>我最喜歡騎車車了！</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
  `;

  // jsdom's Blob polyfill (used by this project's test suite) does not implement .text() — only
  // FileReader works there. Mirrors parentReportDocxExport.js's blobToArrayBuffer jsdom fallback.
  function blobText(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
  }

  async function buildZipWithMedia({ headerDrawingCount = 0, inlineDrawingCount = 0, mediaFiles }) {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    // Inline badge drawings (the real reference sample's shape, no header/footer part at all) go
    // in the body BEFORE the 點滴分享 table, exactly like the real file's badges sitting inline
    // ahead of the highlights section.
    const inlineDrawings = Array.from({ length: inlineDrawingCount }, () => '<w:p><w:r><w:drawing/></w:r></w:p>').join('');
    const documentXml = `<w:document><w:body>${inlineDrawings}${COURSE_PLAN_TABLE_XML}${HIGHLIGHTS_SECOND_TABLE_XML}</w:body></w:document>`;
    zip.file('word/document.xml', documentXml);
    if (headerDrawingCount > 0) {
      const drawings = Array.from({ length: headerDrawingCount }, () => '<w:drawing/>').join('');
      zip.file('word/header1.xml', `<w:hdr xmlns:w="ns">${drawings}</w:hdr>`);
    }
    for (const [name, content] of Object.entries(mediaFiles)) {
      zip.file(`word/media/${name}`, content);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    return parseParentReportDocxImport(blob);
  }

  it('skips the front-of-sequence header/logo images before assigning 點滴分享 photo groups', async () => {
    const result = await buildZipWithMedia({
      headerDrawingCount: 2,
      mediaFiles: {
        'image1.png': 'header-logo-1',
        'image2.png': 'header-logo-2',
        'image3.png': 'body-photo-A',
        'image4.jpg': 'body-photo-B',
        'image5.png': 'body-photo-C',
      },
    });

    expect(result.highlightEntries).toHaveLength(1);
    const photos = result.highlightEntries[0].photos;
    expect(photos).toHaveLength(3);
    const contents = await Promise.all(photos.map(p => blobText(p)));
    expect(contents).toEqual(['body-photo-A', 'body-photo-B', 'body-photo-C']);
  });

  it('behaves unchanged when there are zero header/logo images (no regression)', async () => {
    const result = await buildZipWithMedia({
      mediaFiles: {
        'image1.png': 'body-photo-A',
        'image2.jpg': 'body-photo-B',
        'image3.png': 'body-photo-C',
      },
    });

    expect(result.highlightEntries).toHaveLength(1);
    const photos = result.highlightEntries[0].photos;
    expect(photos).toHaveLength(3);
    const contents = await Promise.all(photos.map(p => blobText(p)));
    expect(contents).toEqual(['body-photo-A', 'body-photo-B', 'body-photo-C']);
  });

  // Shape verified against a real legacy 適性紀錄(家長版) sample (gitignored, not committed to
  // this repo): it has NO word/header*.xml part at all — the 幼兒姓名/出生年月日/紀錄時間 info
  // lives directly in word/document.xml's own body text, near the top, before the first table.
  // Also exercises the run-joining fix: "03" is deliberately split across two adjacent <w:r> runs
  // (as real Word documents sometimes do for font/formatting reasons), which must still parse as
  // "03", not "0 3" (which would fail parseHeaderInfo's \d{1,2} month pattern). The period is
  // deliberately ROC 113 (2024), not the current year, so this also proves the inferred occurrence
  // date year comes from the parsed period rather than silently falling back to today's year.
  it('falls back to parsing 幼兒姓名/出生年月日/紀錄時間 from word/document.xml body text when there is no header part at all (real legacy file shape)', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const introXml = `
      <w:p><w:r><w:t>屏東縣內埔鄉育英公設民營托嬰中心每月課程計畫表(19~24 個月)</w:t></w:r></w:p>
      <w:p><w:r><w:t>幼兒姓名：</w:t></w:r><w:r><w:t>陳小安</w:t></w:r></w:p>
      <w:p><w:r><w:t>出生年月日：113.06.20</w:t></w:r></w:p>
      <w:p><w:r><w:t>紀錄時間：113 年 0</w:t></w:r><w:r><w:t>3</w:t></w:r><w:r><w:t> 月</w:t></w:r></w:p>
    `;
    const documentXml = `<w:document><w:body>${introXml}${FIXTURE_XML}</w:body></w:document>`;
    zip.file('word/document.xml', documentXml);
    const blob = await zip.generateAsync({ type: 'blob' });

    const result = await parseParentReportDocxImport(blob);

    expect(result.child).toEqual({ name: '陳小安', birthDate: '2024-06-20' });
    expect(result.period).toBe('113年03月');
    expect(result.coursePlanEntries[0].occurrences[0].date).toBe('2024-06-11');
    expect(result.warnings).not.toContain('無法從檔案中判斷幼兒姓名，請手動輸入');
    expect(result.warnings).not.toContain('無法從檔案中判斷出生日期，請手動輸入');
    expect(result.warnings).not.toContain('無法從檔案中判斷紀錄年月，請手動選擇');
  });

  // Shape verified against a real legacy 適性紀錄(家長版) sample (gitignored, not committed to
  // this repo): it has NO word/header*.xml or word/footer*.xml part at all — its 2 badge/logo
  // drawings are plain inline <w:drawing> elements inside word/document.xml's body, both well
  // before the 點滴分享 section. countHeaderFooterDrawings alone returns 0 for this shape, so the
  // skip must also count front-loaded inline body drawings, not just header/footer ones.
  it('skips inline body drawings that appear before 點滴分享 when there is no header/footer part at all (real file shape)', async () => {
    const result = await buildZipWithMedia({
      inlineDrawingCount: 2,
      mediaFiles: {
        'image1.png': 'badge-logo-1',
        'image2.png': 'badge-logo-2',
        'image3.png': 'body-photo-A',
        'image4.jpg': 'body-photo-B',
        'image5.png': 'body-photo-C',
      },
    });

    expect(result.highlightEntries).toHaveLength(1);
    const photos = result.highlightEntries[0].photos;
    expect(photos).toHaveLength(3);
    const contents = await Promise.all(photos.map(p => blobText(p)));
    expect(contents).toEqual(['body-photo-A', 'body-photo-B', 'body-photo-C']);
  });

  // Regression repro: a real word/header*.xml can contain a decorative nested textbox
  // (<w:txbxContent> with its own inner <w:p>...</w:p>) INSIDE the same outer paragraph that also
  // carries the 幼兒姓名/出生年月日/紀錄時間 info text, with the textbox positioned first. The
  // non-greedy paragraph regex (`<w:p\b[\s\S]*?<\/w:p>`) used by paragraphJoinedText starts
  // matching at the outer <w:p> but stops at the FIRST </w:p> it meets — which is the textbox's
  // own INNER closing tag, not the outer paragraph's real one. That truncates the match before the
  // info-bearing <w:r> that comes after the textbox within the same outer paragraph, and critically
  // there is no subsequent "<w:p\b" for matchAll to re-anchor on (the rest of the outer paragraph
  // has no nested paragraph starts), so the 幼兒姓名 text is dropped entirely from
  // paragraphJoinedText's output — even though a flat <w:t> scan of the same XML still finds it.
  // (Note: putting the textbox in a separate, EARLIER paragraph does NOT reproduce this — matchAll
  // simply re-anchors on the next real "<w:p>" and still finds 幼兒姓名 fine. The truncation only
  // bites when the info text shares the SAME outer paragraph as the textbox.)
  it('falls back to a flat <w:t> scan when a header paragraph contains a nested textbox that truncates the paragraph-scoped extraction', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const headerXml = `<w:hdr xmlns:w="ns">
      <w:p>
        <w:r><w:pict><v:shape><v:textbox><w:txbxContent><w:p><w:r><w:t>裝飾標題</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:r>
        <w:r><w:t>幼兒姓名：陳小安 出生年月日：113.06.20 紀錄時間：115 年 06 月</w:t></w:r>
      </w:p>
    </w:hdr>`;
    zip.file('word/header1.xml', headerXml);
    const documentXml = `<w:document><w:body>${COURSE_PLAN_TABLE_XML}</w:body></w:document>`;
    zip.file('word/document.xml', documentXml);
    const blob = await zip.generateAsync({ type: 'blob' });

    const result = await parseParentReportDocxImport(blob);

    expect(result.child).toEqual({ name: '陳小安', birthDate: '2024-06-20' });
    expect(result.period).toBe('115年06月');
    expect(result.warnings).not.toContain('無法從檔案中判斷幼兒姓名，請手動輸入');
  });
});
