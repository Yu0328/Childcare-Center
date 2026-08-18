import JSZip from 'jszip';
import { parseDocxImport } from './docxImport.js';
import { parseParentReportDocxImport } from './parentReportDocxImport.js';
import { parseMonthlyPlanDocxImport, extractTitleText, parsePeriodFromTitleText } from './monthlyPlanDocxImport.js';

// A real hand-typed legacy file often splits one visible word across multiple <w:r> runs (mixed
// formatting, copy-paste artifacts) — matching raw XML directly misses text that's contiguous on
// screen but not contiguous in the markup, so every check below matches against joined <w:t>
// contents instead. Same extraction monthlyPlanDocxImport.js's own flatJoinedText does.
function flatJoinedText(xml) {
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('');
}

async function readXmlParts(file) {
  const zip = await JSZip.loadAsync(file);
  const documentXml = (await zip.file('word/document.xml')?.async('text')) ?? '';
  const headerNames = Object.keys(zip.files).filter(name => /^word\/header\d*\.xml$/.test(name));
  const headerXmls = await Promise.all(headerNames.map(name => zip.file(name).async('text')));
  return { zip, documentXml, headerXmls };
}

// Cheap sniff of each file's text (matching the existing importers' own regex-over-XML
// convention, not a real XML parser) rather than a full parse, since we only need "which of the
// three known document types is this" — the real parser for the matched type does the actual
// precise work.
export async function detectDocxImportType(file) {
  const { zip, documentXml, headerXmls } = await readXmlParts(file);
  // docxExport.js/parentReportDocxExport.js put their 幼兒姓名 line in the page header
  // (word/header*.xml), not the body — every marker below is checked against both.
  const flatText = flatJoinedText([documentXml, ...headerXmls].join('\n'));

  // 點滴分享／行為觀察 are section headers parentReportDocxExport.js always emits — unique to
  // this document type, so check first regardless of the other two's own markers.
  if (/點滴分享|行為觀察/.test(flatText)) return 'parent-report';

  // Reuses monthlyPlanDocxImport.js's own period-detection (header-or-body search, plus its
  // tolerance for a real legacy file's "...課程計" title typo missing the trailing 畫) instead
  // of a second, narrower pattern here.
  if (parsePeriodFromTitleText(await extractTitleText(zip, documentXml))) return 'monthly-plan';

  // 幼兒姓名 is emitted by both assessment and parent-report exports, but parent-report is
  // already ruled out above by the time we get here.
  if (/幼兒姓名/.test(flatText)) return 'assessment';

  return null;
}

export async function parseUnifiedDocxImport(file) {
  const type = await detectDocxImportType(file);
  if (!type) throw new Error('無法辨識檔案類型');
  if (type === 'parent-report') return { type, parsed: await parseParentReportDocxImport(file) };
  if (type === 'monthly-plan') return { type, parsed: await parseMonthlyPlanDocxImport(file) };
  return { type, parsed: await parseDocxImport(file) };
}
