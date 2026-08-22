import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { generateParentReportDocxBlob } from '../src/export/parentReportDocxExport.js';

const child = { name: '陳小安', birthDate: '2024-06-20' };
const report = { tier: 'Ⅴ', period: '115年06月' };

async function exportParts(overrides = {}) {
  const blob = await generateParentReportDocxBlob({
    child, report,
    coursePlanEntries: [], courseOccurrencesByEntryId: {},
    developmentRecordEntries: [], behaviorObservations: [], highlightEntries: [],
    ...overrides,
  });
  const zip = await JSZip.loadAsync(blob);
  const documentXml = await zip.file('word/document.xml').async('text');
  // The document has one section (and therefore one header) per form — 課程計畫表 and
  // 適性發展紀錄表 — so assert against all of them joined, not just whichever is written first.
  const headerFiles = zip.file(/word\/header\d*\.xml/);
  const headerXml = (await Promise.all(headerFiles.map(file => file.async('text')))).join('\n');
  return { documentXml, headerXml };
}

describe('generateParentReportDocxBlob acceptance', () => {
  it('titles the header with the institution name, "每月課程計畫表", and the tilde-formatted tier label', async () => {
    const { headerXml } = await exportParts();
    expect(headerXml).toContain('屏東縣內埔鄉育英公設民營托嬰中心每月課程計畫表');
    expect(headerXml).toContain('(19~24 個月)');
  });

  // The reference sample gives the second form its own page and its own title, with no tier label.
  it('titles the 適性發展紀錄表 section separately, without the tier label', async () => {
    const { headerXml } = await exportParts();
    expect(headerXml).toContain('屏東縣內埔鄉育英公設民營托嬰中心每月嬰幼兒適性發展紀錄表');
    expect(headerXml).not.toContain('每月嬰幼兒適性發展紀錄表(19~24 個月)');
  });

  it('prints child name, ROC birth date, actual age, and record period in the header', async () => {
    const { headerXml } = await exportParts();
    expect(headerXml).toContain('陳小安');
    expect(headerXml).toContain('113/06/20');
    expect(headerXml).toContain('115年06月');
  });

  it('uses 標楷體 throughout', async () => {
    const { documentXml, headerXml } = await exportParts();
    expect(documentXml).toContain('標楷體');
    expect(headerXml).toContain('標楷體');
  });

  it('includes signature lines for 家長 and 托育人員／主任', async () => {
    const { documentXml } = await exportParts();
    expect(documentXml).toContain('家長簽名');
    expect(documentXml).toContain('托育人員');
    expect(documentXml).toContain('主任簽名');
  });

  // The header icon must use Word's "文字在後"(Behind Text) layout — the image floats freely near
  // the title without pushing it away, but paints BEHIND the text so it never cuts through a
  // glyph — not "四周型"(Square), which docxExport.js's sibling 適性總表 export still uses (see
  // docxExport.acceptance.test.js), and not "文字在前"(In Front of Text, behindDoc="0"), which was
  // this document's original layout until real output showed the icon overlapping and obscuring
  // part of the title's first character. In OOXML, Square wrapping emits <wp:wrapSquare .../>,
  // while both "in front of"/"behind text" emit <wp:wrapNone/>, distinguished only by behindDoc.
  it('floats the header icon "behind text" (wrapNone, behindDoc) rather than Square-wrapped or in front', async () => {
    const { headerXml } = await exportParts();
    expect(headerXml).toContain('<wp:wrapNone/>');
    expect(headerXml).not.toContain('wrapSquare');
    expect(headerXml).toMatch(/<wp:anchor[^>]*\bbehindDoc="1"/);
  });

  it('includes all four section titles when data is present in every section', async () => {
    const coursePlanEntries = [{ id: 1, reportId: 1, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' }];
    const { documentXml } = await exportParts({
      coursePlanEntries,
      courseOccurrencesByEntryId: { 1: [{ date: '2026-06-11', status: 'developed', absent: false, note: 'x' }] },
      developmentRecordEntries: [{ id: 1, reportId: 1, domain: 1, courseEntryIds: [1], narrative: 'y' }],
      behaviorObservations: [{ id: 1, reportId: 1, title: '我會好好說！', narrative: 'z' }],
      highlightEntries: [{ id: 1, reportId: 1, photos: [{ blob: new Blob(['a']), width: 10, height: 10 }], caption: '開心！' }],
    });
    expect(documentXml).toContain('我愛畫畫');
    expect(documentXml).toContain('行為觀察－我會好好說！');
    expect(documentXml).toContain('點滴分享');
    expect(documentXml).toContain('開心！');
  });
});
