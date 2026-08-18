import JSZip from 'jszip';
import { parseDocxImport } from './docxImport.js';
import { parseParentReportDocxImport } from './parentReportDocxImport.js';
import { parseMonthlyPlanDocxImport } from './monthlyPlanDocxImport.js';

async function readXmlParts(file) {
  const zip = await JSZip.loadAsync(file);
  const documentXml = (await zip.file('word/document.xml')?.async('text')) ?? '';
  const headerNames = Object.keys(zip.files).filter(name => /^word\/header\d*\.xml$/.test(name));
  const headerXmls = await Promise.all(headerNames.map(name => zip.file(name).async('text')));
  return { documentXml, headerXmls };
}

// Cheap regex sniff of each file's raw XML (matching the existing importers' own
// regex-over-raw-XML convention, not a real XML parser) rather than a full parse, since we only
// need "which of the three known document types is this" — the real parser for the matched type
// does the actual precise work.
export async function detectDocxImportType(file) {
  const { documentXml, headerXmls } = await readXmlParts(file);
  // docxExport.js/parentReportDocxExport.js put their 幼兒姓名 line in the page header
  // (word/header*.xml), not the body — every marker below is checked against both.
  const allXml = [documentXml, ...headerXmls].join('\n');

  // 點滴分享／行為觀察 are section headers parentReportDocxExport.js always emits — unique to
  // this document type, so check first regardless of the other two's own markers.
  if (/點滴分享|行為觀察/.test(allXml)) return 'parent-report';

  // Same anchor pattern monthlyPlanDocxImport.js already uses to find its own period — the
  // title text monthlyPlanDocxExport.js emits ("{period}課程計畫"). Parent-report's own
  // "每月課程計畫表" title never has digits immediately before 課程計畫, so it can't collide.
  if (/\d{1,3}年\d{1,2}月課程計畫/.test(allXml)) return 'monthly-plan';

  // 幼兒姓名 is emitted by both assessment and parent-report exports, but parent-report is
  // already ruled out above by the time we get here.
  if (/幼兒姓名/.test(allXml)) return 'assessment';

  return null;
}

export async function parseUnifiedDocxImport(file) {
  const type = await detectDocxImportType(file);
  if (!type) throw new Error('無法辨識檔案類型');
  if (type === 'parent-report') return { type, parsed: await parseParentReportDocxImport(file) };
  if (type === 'monthly-plan') return { type, parsed: await parseMonthlyPlanDocxImport(file) };
  return { type, parsed: await parseDocxImport(file) };
}
