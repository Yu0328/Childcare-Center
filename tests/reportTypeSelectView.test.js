import { describe, it, expect, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { clearAllData } from '../src/storage/db.js';
import { renderReportTypeSelectView } from '../src/ui/reportTypeSelectView.js';
import { generateDocxBlob } from '../src/export/docxExport.js';
import { generateParentReportDocxBlob } from '../src/export/parentReportDocxExport.js';
import { generateMonthlyPlanDocxBlob } from '../src/export/monthlyPlanDocxExport.js';
import { getIndicatorsForTier } from '../src/data/indicators.js';
import { waitFor } from './helpers.js';

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change'));
}

function selectFiles(input, files) {
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  input.dispatchEvent(new Event('change'));
}

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

describe('renderReportTypeSelectView', () => {
  it('calls onSelectType with "assessment" when 適性總表 is clicked', async () => {
    const container = document.createElement('div');
    let selected = null;
    await renderReportTypeSelectView(container, { onSelectType: type => { selected = type; } });

    container.querySelector('[data-type="assessment"]').click();
    expect(selected).toBe('assessment');
  });

  it('calls onManageChildren when 管理幼兒 is clicked', async () => {
    const container = document.createElement('div');
    let called = false;
    await renderReportTypeSelectView(container, { onSelectType: () => {}, onManageChildren: () => { called = true; } });

    container.querySelector('[data-action="manage-children"]').click();
    expect(called).toBe(true);
  });

  it('calls onSelectType with "parent-report" when 適性紀錄(家長版) is clicked', async () => {
    const container = document.createElement('div');
    let selected = null;
    await renderReportTypeSelectView(container, { onSelectType: type => { selected = type; } });

    container.querySelector('[data-type="parent-report"]').click();
    expect(selected).toBe('parent-report');
  });

  it('calls onSelectType with "monthly-plan" when 課程月計畫 is clicked', async () => {
    const container = document.createElement('div');
    let selected = null;
    await renderReportTypeSelectView(container, { onSelectType: type => { selected = type; } });

    container.querySelector('[data-type="monthly-plan"]').click();
    expect(selected).toBe('monthly-plan');
  });

  describe('unified 匯入檔案 button', () => {
    beforeEach(async () => {
      await clearAllData();
      document.querySelector('.toast-host')?.remove();
    });

    async function renderView() {
      const container = document.createElement('div');
      await renderReportTypeSelectView(container, { onSelectType: () => {} });
      return container;
    }

    it('opens the assessment (適性總表) preview for an assessment file', async () => {
      const container = await renderView();
      selectFile(container.querySelector('[data-field="import-any-file"]'), await buildAssessmentFile());

      await waitFor(() => container.textContent.includes('確認匯入內容（適性總表）'));
    });

    it('opens the parent-report (適性紀錄) preview for a parent-report file', async () => {
      const container = await renderView();
      selectFile(container.querySelector('[data-field="import-any-file"]'), await buildParentReportFile());

      await waitFor(() => container.textContent.includes('確認匯入內容（適性紀錄）'));
    });

    it('opens the monthly-plan (課程月計畫) preview for a monthly-plan file', async () => {
      const container = await renderView();
      selectFile(container.querySelector('[data-field="import-any-file"]'), await buildMonthlyPlanFile());

      await waitFor(() => container.textContent.includes('確認匯入內容（課程月計畫）'));
    });

    it('processes a mixed-type multi-file selection one at a time, in order', async () => {
      const container = await renderView();
      selectFiles(container.querySelector('[data-field="import-any-file"]'), [await buildAssessmentFile(), await buildMonthlyPlanFile()]);

      await waitFor(() => container.textContent.includes('確認匯入內容（適性總表）'));
      container.querySelector('[data-action="cancel"]').click();

      await waitFor(() => container.textContent.includes('確認匯入內容（課程月計畫）'));
    });

    it('reports an unrecognized file as skipped and returns to the home screen', async () => {
      const container = await renderView();
      selectFile(container.querySelector('[data-field="import-any-file"]'), await buildUnrecognizedFile());

      await waitFor(() => container.querySelector('[data-error="import"]')?.textContent.includes('random.docx'));
      expect(container.querySelector('.type-select')).not.toBeNull();
    });

    it('shows a toast naming the file the moment its import is confirmed', async () => {
      const container = await renderView();
      selectFile(container.querySelector('[data-field="import-any-file"]'), await buildAssessmentFile());

      await waitFor(() => container.textContent.includes('確認匯入內容（適性總表）'));
      container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      await waitFor(() => document.querySelector('.toast')?.textContent.includes('陳小安.docx'));
      expect(document.querySelector('.toast').textContent).toBe('已成功匯入：陳小安.docx');
    });

    it('shows one toast per file, in order, for a mixed-type multi-file batch', async () => {
      const container = await renderView();
      selectFiles(container.querySelector('[data-field="import-any-file"]'), [await buildAssessmentFile(), await buildMonthlyPlanFile()]);

      await waitFor(() => container.textContent.includes('確認匯入內容（適性總表）'));
      container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await waitFor(() => document.querySelectorAll('.toast').length === 1);

      await waitFor(() => container.textContent.includes('確認匯入內容（課程月計畫）'));
      // 林小明 doesn't match an existing child, so the monthly-plan docx (no birth date field)
      // needs it filled in manually before the form validates.
      container.querySelector('[data-field="child-new-birthDate-year-0"]').value = '2024';
      container.querySelector('[data-field="child-new-birthDate-month-0"]').value = '7';
      container.querySelector('[data-field="child-new-birthDate-day-0"]').value = '1';
      container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      await waitFor(() => document.querySelectorAll('.toast').length === 2);
      const toasts = [...document.querySelectorAll('.toast')].map(t => t.textContent);
      expect(toasts).toEqual(['已成功匯入：陳小安.docx', '已成功匯入：115年06月課程計畫.docx']);
    });
  });
});
