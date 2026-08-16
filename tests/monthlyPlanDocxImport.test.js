import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { parsePeriodFromTitleText, extractTitleText } from '../src/import/monthlyPlanDocxImport.js';

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
