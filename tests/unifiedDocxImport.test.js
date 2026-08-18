import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { generateDocxBlob } from '../src/export/docxExport.js';
import { generateParentReportDocxBlob } from '../src/export/parentReportDocxExport.js';
import { generateMonthlyPlanDocxBlob } from '../src/export/monthlyPlanDocxExport.js';
import { getIndicatorsForTier } from '../src/data/indicators.js';
import { parseDocxImport } from '../src/import/docxImport.js';
import { parseParentReportDocxImport } from '../src/import/parentReportDocxImport.js';
import { parseMonthlyPlanDocxImport } from '../src/import/monthlyPlanDocxImport.js';
import { detectDocxImportType, parseUnifiedDocxImport } from '../src/import/unifiedDocxImport.js';

async function buildAssessmentFile() {
  const indicators = getIndicatorsForTier('Ⅳ');
  const blob = await generateDocxBlob({
    child: { name: '陳小安', birthDate: '2024-11-01' },
    form: { tier: 'Ⅳ', period: '115年01月' },
    indicators,
    entries: [{ indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '可以來回穩定行走' }],
  });
  return new File([blob], '陳小安.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

async function buildParentReportFile() {
  const blob = await generateParentReportDocxBlob({
    child: { name: '陳小安', birthDate: '2024-06-20' },
    report: { tier: 'Ⅴ', period: '115年06月' },
    coursePlanEntries: [{ id: 1, reportId: 1, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' }],
    courseOccurrencesByEntryId: {},
    developmentRecordEntries: [],
    behaviorObservations: [],
    highlightEntries: [],
  });
  return new File([blob], '陳小安-115年06月適性紀錄(家長版).docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

async function buildMonthlyPlanFile() {
  const plan = { id: 1, period: '115年06月', childIds: [10], childTiers: { 10: 'Ⅴ' } };
  const children = [{ id: 10, name: '林小明', birthDate: '2024-07-01' }];
  const blob = await generateMonthlyPlanDocxBlob({ plan, children, slots: [], itemsBySlotId: {}, overrides: [] });
  return new File([blob], '115年06月課程計畫.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

async function buildUnrecognizedFile() {
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    '<w:document><w:body><w:p><w:r><w:t>hello world</w:t></w:r></w:p></w:body></w:document>'
  );
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], 'random.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

describe('detectDocxImportType', () => {
  it('detects an assessment (適性總表) export', async () => {
    expect(await detectDocxImportType(await buildAssessmentFile())).toBe('assessment');
  });

  it('detects a parent-report (適性紀錄) export', async () => {
    expect(await detectDocxImportType(await buildParentReportFile())).toBe('parent-report');
  });

  it('detects a monthly-plan (課程月計畫) export', async () => {
    expect(await detectDocxImportType(await buildMonthlyPlanFile())).toBe('monthly-plan');
  });

  it('returns null for a docx with none of the known markers', async () => {
    expect(await detectDocxImportType(await buildUnrecognizedFile())).toBeNull();
  });
});

describe('parseUnifiedDocxImport', () => {
  it('routes an assessment file to parseDocxImport and tags it', async () => {
    const file = await buildAssessmentFile();
    const { type, parsed } = await parseUnifiedDocxImport(file);
    expect(type).toBe('assessment');
    expect(parsed).toEqual(await parseDocxImport(file));
  });

  it('routes a parent-report file to parseParentReportDocxImport and tags it', async () => {
    const file = await buildParentReportFile();
    const { type, parsed } = await parseUnifiedDocxImport(file);
    expect(type).toBe('parent-report');
    expect(parsed).toEqual(await parseParentReportDocxImport(file));
  });

  it('routes a monthly-plan file to parseMonthlyPlanDocxImport and tags it', async () => {
    const file = await buildMonthlyPlanFile();
    const { type, parsed } = await parseUnifiedDocxImport(file);
    expect(type).toBe('monthly-plan');
    expect(parsed).toEqual(await parseMonthlyPlanDocxImport(file));
  });

  it('rejects an unrecognized file', async () => {
    await expect(parseUnifiedDocxImport(await buildUnrecognizedFile())).rejects.toThrow('無法辨識檔案類型');
  });
});
