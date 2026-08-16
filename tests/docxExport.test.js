import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildIndicatorRowGroups, buildIndicatorRows, generateDocxBlob } from '../src/export/docxExport.js';

const indicators = [
  { code: 'Ⅳ-1-1', description: '能獨立穩定行走' },
  { code: 'Ⅳ-1-2', description: '能保持平衡撿拾地上物品' },
];

describe('buildIndicatorRows', () => {
  it('emits one blank row for an indicator with no entries', () => {
    const rows = buildIndicatorRows(indicators, {});
    expect(rows).toEqual([
      { code: 'Ⅳ-1-1', description: '能獨立穩定行走', date: '', status: null, note: '' },
      { code: 'Ⅳ-1-2', description: '能保持平衡撿拾地上物品', date: '', status: null, note: '' },
    ]);
  });

  it('emits one row per entry, preserving indicator order', () => {
    const entriesByIndicatorCode = {
      'Ⅳ-1-1': [
        { date: '2026-01-07', status: 'developed', note: '可以來回穩定行走' },
        { date: '2026-02-26', status: 'developing', note: '可穩定行走至戶外遊戲場' },
      ],
    };

    const rows = buildIndicatorRows(indicators, entriesByIndicatorCode);

    expect(rows).toEqual([
      { code: 'Ⅳ-1-1', description: '能獨立穩定行走', date: '2026-01-07', status: 'developed', note: '可以來回穩定行走' },
      { code: 'Ⅳ-1-1', description: '能獨立穩定行走', date: '2026-02-26', status: 'developing', note: '可穩定行走至戶外遊戲場' },
      { code: 'Ⅳ-1-2', description: '能保持平衡撿拾地上物品', date: '', status: null, note: '' },
    ]);
  });

  it('passes an entry\'s status through unchanged, even when it is undefined', () => {
    const rows = buildIndicatorRows(indicators, {
      'Ⅳ-1-1': [{ date: '2026-01-07', status: undefined, note: 'x' }],
    });
    expect(rows[0].status).toBeUndefined();
  });
});

describe('buildIndicatorRowGroups domain grouping', () => {
  const byDomain = [
    { code: 'Ⅳ-1-1', description: 'a', domain: 1, domainName: '身體動作' },
    { code: 'Ⅳ-1-2', description: 'b', domain: 1, domainName: '身體動作' },
    { code: 'Ⅳ-1-3', description: 'c', domain: 1, domainName: '身體動作' },
    { code: 'Ⅳ-2-1', description: 'd', domain: 2, domainName: '社會情緒' },
    { code: 'Ⅳ-2-2', description: 'e', domain: 2, domainName: '社會情緒' },
  ];

  it('flags only the first indicator of each domain, so 發展領域 merges across indicators', () => {
    const groups = buildIndicatorRowGroups(byDomain, {});

    expect(groups.map(group => group.isFirstGroupOfDomain)).toEqual([true, false, false, true, false]);
  });

  it('keeps the flag independent of how many entry rows an indicator has', () => {
    const groups = buildIndicatorRowGroups(byDomain, {
      'Ⅳ-1-1': [
        { date: '2026-01-07', status: 'developed', note: 'x' },
        { date: '2026-02-26', status: 'developed', note: 'y' },
      ],
    });

    expect(groups[0].rows).toHaveLength(2);
    expect(groups[0].isFirstGroupOfDomain).toBe(true);
    // The second indicator still belongs to 身體動作, so it must not restart the domain merge.
    expect(groups[1].isFirstGroupOfDomain).toBe(false);
  });

  it('treats indicators with no domain metadata as one group', () => {
    const groups = buildIndicatorRowGroups(
      [
        { code: 'Ⅳ-1-1', description: 'a' },
        { code: 'Ⅳ-1-2', description: 'b' },
      ],
      {}
    );

    expect(groups.map(group => group.isFirstGroupOfDomain)).toEqual([true, false]);
  });
});

describe('generateDocxBlob', () => {
  it('produces a non-empty .docx blob', async () => {
    const indicators = [
      { code: 'Ⅳ-1-1', description: '能獨立穩定行走', domainName: '身體動作', subdomain: '粗動作、精細動作' },
    ];
    const entries = [
      { indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '可以來回穩定行走' },
    ];

    const blob = await generateDocxBlob({
      child: { name: '陳小安', birthDate: '2024-11-01' },
      form: { tier: 'Ⅳ', period: '115年01月' },
      indicators,
      entries,
    });

    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  // The 請假/更換課程 label prints in the 說明 column only, not next to the date — a flagged date
  // cell must stay a plain date (just red), or the label would print twice whenever the teacher
  // also separately typed "請假" as their own note text.
  it('prints the flagged status label ("請假") in the 說明 column, not the date column', async () => {
    const indicators = [
      { code: 'Ⅳ-1-1', description: '能獨立穩定行走', domainName: '身體動作', subdomain: '粗動作、精細動作' },
    ];
    const entries = [{ indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'absent', note: '生病請假' }];

    const blob = await generateDocxBlob({
      child: { name: '陳小安', birthDate: '2024-11-01' },
      form: { tier: 'Ⅳ', period: '115年01月' },
      indicators,
      entries,
    });
    const zip = await JSZip.loadAsync(blob);
    const xml = await zip.file('word/document.xml').async('text');

    expect(xml).not.toMatch(/<w:t[^>]*>01\/07[^<]*請假/);
    expect(xml).toContain('請假　生病請假');
  });
});
