import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { generateDocxBlob } from '../src/export/docxExport.js';
import { getIndicatorsForTier } from '../src/data/indicators.js';
import { parseDocxImport, parsePeriodFromHeaderText } from '../src/import/docxImport.js';

describe('parseDocxImport (round-trip against our own generateDocxBlob)', () => {
  it('recovers child, tier, period and entries from a generated .docx', async () => {
    const indicators = getIndicatorsForTier('Ⅳ');
    const entries = [
      { indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '可以來回穩定行走' },
      { indicatorCode: 'Ⅳ-1-1', date: '2026-02-26', status: 'developed', note: '可穩定行走至戶外遊戲場' },
      { indicatorCode: 'Ⅳ-1-2', date: '2026-01-07', status: 'developing', note: '仍在練習中' },
    ];

    const blob = await generateDocxBlob({
      child: { name: '測試寶寶', birthDate: '2024-11-01' },
      form: { tier: 'Ⅳ', period: '115年01月' },
      indicators,
      entries,
    });

    const parsed = await parseDocxImport(blob);

    expect(parsed.child.name).toBe('測試寶寶');
    expect(parsed.child.birthDate).toBe('2024-11-01');
    expect(parsed.tier).toBe('Ⅳ');
    expect(parsed.period).toBe('115年01月');
    expect(parsed.warnings).toEqual([]);

    const ivOneOne = parsed.entries.filter(e => e.indicatorCode === 'Ⅳ-1-1');
    expect(ivOneOne).toHaveLength(2);
    expect(ivOneOne[0]).toMatchObject({ date: '2026-01-07', status: 'developed', note: '可以來回穩定行走' });
    expect(ivOneOne[1]).toMatchObject({ date: '2026-02-26', status: 'developed', note: '可穩定行走至戶外遊戲場' });

    const ivOneTwo = parsed.entries.find(e => e.indicatorCode === 'Ⅳ-1-2');
    expect(ivOneTwo).toMatchObject({ date: '2026-01-07', status: 'developing', note: '仍在練習中' });
  });

  it('does not import indicators with no recorded entries (blank placeholder rows)', async () => {
    const indicators = getIndicatorsForTier('Ⅳ');
    const blob = await generateDocxBlob({
      child: { name: '測試寶寶', birthDate: '2024-11-01' },
      form: { tier: 'Ⅳ', period: '115年01月' },
      indicators,
      entries: [], // every indicator gets an empty placeholder row per buildIndicatorRows
    });

    const parsed = await parseDocxImport(blob);

    expect(parsed.entries).toEqual([]);
  });

  it('rolls the inferred year forward when a later entry’s month is earlier (Dec -> Jan)', async () => {
    const indicators = getIndicatorsForTier('Ⅳ');
    const entries = [
      { indicatorCode: 'Ⅳ-1-1', date: '2025-12-20', status: 'developed', note: '十二月的紀錄' },
      { indicatorCode: 'Ⅳ-1-1', date: '2026-01-10', status: 'developed', note: '一月的紀錄' },
    ];

    const blob = await generateDocxBlob({
      child: { name: '測試寶寶', birthDate: '2024-11-01' },
      form: { tier: 'Ⅳ', period: '114年12月' }, // 114年 = 2025
      indicators,
      entries,
    });

    const parsed = await parseDocxImport(blob);
    const dates = parsed.entries.filter(e => e.indicatorCode === 'Ⅳ-1-1').map(e => e.date);

    expect(dates).toEqual(['2025-12-20', '2026-01-10']);
  });

  it('25個月以上的總表大多是 Ⅶ（延伸活動）代碼時，整份仍判斷為 Ⅵ，每筆都歸 Ⅵ', async () => {
    const indicators = getIndicatorsForTier('Ⅵ');
    const entries = ['Ⅵ-1-1', 'Ⅶ-1-1', 'Ⅶ-1-2', 'Ⅶ-3-1'].map((indicatorCode, i) => ({
      indicatorCode, date: `2026-05-0${i + 1}`, status: 'developed', note: `紀錄${i}`,
    }));
    const blob = await generateDocxBlob({
      child: { name: '測試寶寶', birthDate: '2023-11-01' },
      form: { tier: 'Ⅵ', period: '115年05月' },
      indicators,
      entries,
    });

    const parsed = await parseDocxImport(blob);

    expect(parsed.tier).toBe('Ⅵ');
    expect(parsed.entries).toHaveLength(4);
    expect(parsed.entries.every(e => e.tier === 'Ⅵ')).toBe(true);
  });

  it('請假／更換課程的紅字列匯入後還原成原本的狀態，說明不帶前綴', async () => {
    const entries = [
      { indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'absent', note: '' },
      { indicatorCode: 'Ⅳ-1-1', date: '2026-01-14', status: 'absent', note: '家中有事' },
      { indicatorCode: 'Ⅳ-1-2', date: '2026-01-21', status: 'courseChanged', note: '改上音樂課' },
    ];
    const blob = await generateDocxBlob({
      child: { name: '測試寶寶', birthDate: '2024-11-01' },
      form: { tier: 'Ⅳ', period: '115年01月' },
      indicators: getIndicatorsForTier('Ⅳ'),
      entries,
    });

    const parsed = await parseDocxImport(blob);

    expect(parsed.entries.map(({ indicatorCode, date, status, note }) => ({ indicatorCode, date, status, note }))).toEqual(entries);
  });

  it('備註區的每一列都讀得回來，歸在這份總表，不列入對應不到的警告', async () => {
    const blob = await generateDocxBlob({
      child: { name: '測試寶寶', birthDate: '2024-11-01' },
      form: { tier: 'Ⅳ', period: '115年01月' },
      indicators: getIndicatorsForTier('Ⅳ'),
      entries: [{ indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '主表' }],
      previousTierEntries: [
        { indicatorCode: 'Ⅲ-1-1', date: '2025-12-03', status: 'developing', note: '上一階段未完成' },
        { indicatorCode: '自訂標籤', activityName: '我長大了', date: '2026-01-09', status: 'absent', note: '' },
        { indicatorCode: 'Ⅱ-2-1', date: '', status: 'developed', note: '沒有日期的備註' },
      ],
    });

    const parsed = await parseDocxImport(blob);

    expect(parsed.warnings).toEqual([]);
    expect(parsed.tier).toBe('Ⅳ');
    const remarks = parsed.entries.filter(e => e.isRemark);
    expect(remarks.map(({ indicatorCode, activityName, date, status, note, tier }) => ({ indicatorCode, activityName, date, status, note, tier }))).toEqual([
      { indicatorCode: 'Ⅲ-1-1', activityName: undefined, date: '2025-12-03', status: 'developing', note: '上一階段未完成', tier: null },
      { indicatorCode: '自訂標籤', activityName: '我長大了', date: '2026-01-09', status: 'absent', note: '', tier: null },
      { indicatorCode: 'Ⅱ-2-1', activityName: undefined, date: '', status: 'developed', note: '沒有日期的備註', tier: null },
    ]);
    expect(parsed.entries.filter(e => !e.isRemark)).toHaveLength(1);
  });

  it('沒有備註時，備註區的空白占位列不會被匯入', async () => {
    const blob = await generateDocxBlob({
      child: { name: '測試寶寶', birthDate: '2024-11-01' },
      form: { tier: 'Ⅳ', period: '115年01月' },
      indicators: getIndicatorsForTier('Ⅳ'),
      entries: [{ indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '主表' }],
    });

    const parsed = await parseDocxImport(blob);

    expect(parsed.entries.some(e => e.isRemark)).toBe(false);
  });

  it('flags entries whose indicator code is not recognized', async () => {
    // Build a minimal .docx-shaped zip by hand so we can inject an unknown indicator code —
    // generateDocxBlob only ever emits real codes from src/data/indicators.js.
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:tbl>
            <w:tr><w:tc><w:p><w:r><w:t>header row 0</w:t></w:r></w:p></w:tc></w:tr>
            <w:tr><w:tc><w:p><w:r><w:t>header row 1</w:t></w:r></w:p></w:tc></w:tr>
            <w:tr>
              <w:tc><w:p><w:r><w:t>1身體動作</w:t></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:t>粗動作</w:t></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:t>Ⅳ-9-9</w:t></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:t>未知指標</w:t></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:t>01/07○</w:t></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:t>測試備註</w:t></w:r></w:p></w:tc>
            </w:tr>
          </w:tbl>
        </w:body>
      </w:document>`
    );
    zip.file(
      'word/header1.xml',
      `<?xml version="1.0"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:p><w:r><w:t>幼兒姓名：測試寶寶 出生日期：113/11/01 實際月齡：14個月 實施時間：115年01月</w:t></w:r></w:p>
      </w:hdr>`
    );

    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    const parsed = await parseDocxImport(buffer);

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].description).toBeNull();
    expect(parsed.warnings.some(w => w.includes('無法對應到系統內建的指標：Ⅳ-9-9'))).toBe(true);
  });

  it('reads a real legacy 6-column document (no 備註 column) using the original code/date/note positions', async () => {
    // A real sample (陳小安C表-2.docx-shaped) never has our own exporter's 備註 column — code sits
    // at index 2, not 3.
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:tbl>
            <w:tr><w:tc><w:p><w:r><w:t>header row 0</w:t></w:r></w:p></w:tc></w:tr>
            <w:tr><w:tc><w:p><w:r><w:t>header row 1</w:t></w:r></w:p></w:tc></w:tr>
            <w:tr>
              <w:tc><w:p><w:r><w:t>1身體動作</w:t></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:t>粗動作</w:t></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:t>Ⅳ-1-1</w:t></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:t>能獨立穩定行走</w:t></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:t>01/07○</w:t></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:t>六欄舊格式備註</w:t></w:r></w:p></w:tc>
            </w:tr>
          </w:tbl>
        </w:body>
      </w:document>`
    );
    zip.file(
      'word/header1.xml',
      `<?xml version="1.0"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:p><w:r><w:t>幼兒姓名：測試寶寶 出生日期：113/11/01 實際月齡：14個月 實施時間：115年01月</w:t></w:r></w:p>
      </w:hdr>`
    );

    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    const parsed = await parseDocxImport(buffer);

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]).toMatchObject({ indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '六欄舊格式備註' });
  });

  it('flags missing header info instead of throwing', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body><w:tbl>
          <w:tr><w:tc><w:p><w:r><w:t>header row 0</w:t></w:r></w:p></w:tc></w:tr>
          <w:tr><w:tc><w:p><w:r><w:t>header row 1</w:t></w:r></w:p></w:tc></w:tr>
        </w:tbl></w:body>
      </w:document>`
    );
    // No header*.xml part at all.

    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    const parsed = await parseDocxImport(buffer);

    expect(parsed.child.name).toBeNull();
    expect(parsed.child.birthDate).toBeNull();
    expect(parsed.tier).toBeNull();
    expect(parsed.period).toBeNull();
    expect(parsed.warnings).toEqual(
      expect.arrayContaining([
        '無法從檔案中判斷幼兒姓名，請手動輸入',
        '無法從檔案中判斷出生日期，請手動輸入',
        '無法從檔案中判斷月齡階段，請手動選擇',
        '無法從檔案中判斷紀錄年月，日期年份可能不準確，請確認每一筆日期',
      ])
    );
  });
});

describe('parsePeriodFromHeaderText', () => {
  it('parses the canonical full-width single period', () => {
    expect(parsePeriodFromHeaderText('實施時間：114年09月')).toBe('114年09月');
  });

  it('parses a dot-separated single period', () => {
    expect(parsePeriodFromHeaderText('實施時間：115.1')).toBe('115年01月');
  });

  it('parses a dot-separated range, padding single-digit months on either side', () => {
    expect(parsePeriodFromHeaderText('實施時間：114.8-115.04')).toBe('114年08月-115年04月');
    expect(parsePeriodFromHeaderText('實施時間：114.08-115.4')).toBe('114年08月-115年04月');
  });

  it('parses a dot-separated range with a fullwidth or tilde separator', () => {
    expect(parsePeriodFromHeaderText('實施時間：114.8－115.4')).toBe('114年08月-115年04月');
    expect(parsePeriodFromHeaderText('實施時間：114.8~115.4')).toBe('114年08月-115年04月');
  });

  it('parses a same-year shorthand range ("115.3 月-7 月") with no repeated year on the end month', () => {
    expect(parsePeriodFromHeaderText('實施時間：115.3 月-7 月')).toBe('115年03月-115年07月');
  });

  it('collapses a range to a single period when both ends are the same month', () => {
    expect(parsePeriodFromHeaderText('實施時間：114.8-114.08')).toBe('114年08月');
  });

  it('returns null when there is no 實施時間 text at all', () => {
    expect(parsePeriodFromHeaderText('幼兒姓名：陳小安')).toBeNull();
  });
});
