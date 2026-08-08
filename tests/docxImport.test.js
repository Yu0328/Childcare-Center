import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { generateDocxBlob } from '../src/export/docxExport.js';
import { getIndicatorsForTier } from '../src/data/indicators.js';
import { parseDocxImport } from '../src/import/docxImport.js';

describe('parseDocxImport (round-trip against our own generateDocxBlob)', () => {
  it('recovers child, tier, period and entries from a generated .docx', async () => {
    const indicators = getIndicatorsForTier('Ⅳ');
    const entries = [
      { indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', achieved: true, note: '可以來回穩定行走' },
      { indicatorCode: 'Ⅳ-1-1', date: '2026-02-26', achieved: true, note: '可穩定行走至戶外遊戲場' },
      { indicatorCode: 'Ⅳ-1-2', date: '2026-01-07', achieved: false, note: '仍在練習中' },
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
    expect(ivOneOne[0]).toMatchObject({ date: '2026-01-07', achieved: true, note: '可以來回穩定行走' });
    expect(ivOneOne[1]).toMatchObject({ date: '2026-02-26', achieved: true, note: '可穩定行走至戶外遊戲場' });

    const ivOneTwo = parsed.entries.find(e => e.indicatorCode === 'Ⅳ-1-2');
    expect(ivOneTwo).toMatchObject({ date: '2026-01-07', achieved: false, note: '仍在練習中' });
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
      { indicatorCode: 'Ⅳ-1-1', date: '2025-12-20', achieved: true, note: '十二月的紀錄' },
      { indicatorCode: 'Ⅳ-1-1', date: '2026-01-10', achieved: true, note: '一月的紀錄' },
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
    expect(parsed.warnings).toContain('部分指標代碼無法對應到系統內建的指標，這些項目匯入後可能無法正確顯示，建議確認後再匯入');
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
