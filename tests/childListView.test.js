import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import { renderChildListView } from '../src/ui/childListView.js';
import { generateDocxBlob } from '../src/export/docxExport.js';
import { generateParentReportDocxBlob } from '../src/export/parentReportDocxExport.js';
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

function setBirthDate(container, iso) {
  const [year, month, day] = iso.split('-').map(Number);
  container.querySelector('[data-field="birthDate-year"]').value = String(year);
  container.querySelector('[data-field="birthDate-month"]').value = String(month);
  container.querySelector('[data-field="birthDate-day"]').value = String(day);
}

function getBirthDate(container) {
  const year = container.querySelector('[data-field="birthDate-year"]').value;
  const month = container.querySelector('[data-field="birthDate-month"]').value;
  const day = container.querySelector('[data-field="birthDate-day"]').value;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function buildSampleDocxFile({ name = '陳小安', birthDate = '2024-11-01' } = {}) {
  const indicators = getIndicatorsForTier('Ⅳ');
  const blob = await generateDocxBlob({
    child: { name, birthDate },
    form: { tier: 'Ⅳ', period: '115年01月' },
    indicators,
    entries: [{ indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '可以來回穩定行走' }],
  });
  return new File([blob], `${name}.docx`, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

async function buildSampleParentReportDocxFile() {
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

describe('renderChildListView', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('renders existing children', async () => {
    await addChild({ name: '陳小安', birthDate: '2024-11-01' });

    const container = document.createElement('div');
    await renderChildListView(container, { onSelectChild: () => {} });

    expect(container.textContent).toContain('陳小安');
  });

  it('shows a 新 badge on a child with an unseen imported form (assessment), not on a child without one', async () => {
    const { addForm } = await import('../src/storage/db.js');
    const withNew = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    const without = await addChild({ name: '林小美', birthDate: '2024-06-01' });
    await addForm({ childId: withNew.id, tier: 'Ⅳ', period: '115年01月', isNew: true });
    await addForm({ childId: without.id, tier: 'Ⅳ', period: '115年01月' });

    const container = document.createElement('div');
    await renderChildListView(container, { onSelectChild: () => {}, reportType: 'assessment' });

    const rows = [...container.querySelectorAll('.card-list__row')];
    const newRow = rows.find(r => r.textContent.includes('陳小安'));
    const normalRow = rows.find(r => r.textContent.includes('林小美'));
    expect(newRow.querySelector('.new-badge')).not.toBeNull();
    expect(normalRow.querySelector('.new-badge')).toBeNull();
  });

  it('shows a 新 badge on a child with an unseen imported parent report when reportType is parent-report', async () => {
    const { addParentReport } = await import('../src/storage/parentReportDb.js');
    const withNew = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    await addParentReport({ childId: withNew.id, tier: 'Ⅴ', period: '115年06月', isNew: true });

    const container = document.createElement('div');
    await renderChildListView(container, { onSelectChild: () => {}, reportType: 'parent-report' });

    const row = [...container.querySelectorAll('.card-list__row')].find(r => r.textContent.includes('陳小安'));
    expect(row.querySelector('.new-badge')).not.toBeNull();
  });

  it('adds a new child via the form and re-renders the list', async () => {
    const container = document.createElement('div');
    await renderChildListView(container, { onSelectChild: () => {} });

    container.querySelector('[data-field="name"]').value = '林小晴';
    setBirthDate(container, '2024-07-19');
    container.querySelector('[data-action="add-child"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => container.textContent.includes('林小晴'));

    expect(container.textContent).toContain('林小晴');
  });

  it('calls onSelectChild with the clicked child', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });

    const container = document.createElement('div');
    let selected = null;
    await renderChildListView(container, { onSelectChild: c => { selected = c; } });

    container.querySelector(`[data-child-id="${child.id}"]`).click();

    expect(selected).toEqual(child);
  });

  it('shows error message when addChild fails and preserves form input', async () => {
    // Mock the addChild import in childListView
    const dbModule = await import('../src/storage/db.js');
    const originalAddChild = dbModule.addChild;

    const container = document.createElement('div');
    await renderChildListView(container, { onSelectChild: () => {} });

    // Mock addChild to reject on the next call
    vi.spyOn(dbModule, 'addChild').mockRejectedValueOnce(new Error('Database error'));

    container.querySelector('[data-field="name"]').value = '失敗測試';
    setBirthDate(container, '2024-07-19');
    container.querySelector('[data-action="add-child"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => container.textContent.includes('新增失敗，請再試一次'));

    // Error message should appear
    expect(container.textContent).toContain('新增失敗，請再試一次');

    // Form inputs should still have values (not cleared)
    expect(container.querySelector('[data-field="name"]').value).toBe('失敗測試');
    expect(getBirthDate(container)).toBe('2024-07-19');

    // Restore original function
    vi.restoreAllMocks();
  });
  it('opens the import preview after selecting a valid Word file', async () => {
    const container = document.createElement('div');
    await renderChildListView(container, { onSelectChild: () => {} });

    const file = await buildSampleDocxFile();
    selectFile(container.querySelector('[data-field="import-file"]'), file);

    await waitFor(() => container.textContent.includes('確認匯入內容'));
    expect(container.querySelector('[data-field="name"]').value).toBe('陳小安');
  });

  it('imports multiple selected files one after another, showing each one\'s own preview in turn', async () => {
    const container = document.createElement('div');
    await renderChildListView(container, { onSelectChild: () => {} });

    const fileA = await buildSampleDocxFile({ name: '陳小安', birthDate: '2024-11-01' });
    const fileB = await buildSampleDocxFile({ name: '林小美', birthDate: '2024-06-01' });
    selectFiles(container.querySelector('[data-field="import-file"]'), [fileA, fileB]);

    await waitFor(() => container.textContent.includes('確認匯入內容'));
    expect(container.querySelector('[data-field="name"]').value).toBe('陳小安');
    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    // The second file's own preview comes up automatically, without returning to the child list first.
    await waitFor(() => container.querySelector('[data-field="name"]')?.value === '林小美');
    expect(container.textContent).toContain('確認匯入內容');
    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => container.textContent.includes('幼兒列表'));
    expect(container.textContent).toContain('陳小安');
    expect(container.textContent).toContain('林小美');
    expect(container.querySelector('[data-success="import"]').textContent).toBe('已成功匯入：陳小安.docx、林小美.docx');
  });

  it('shows an error and stays on the child list when the selected file cannot be read', async () => {
    const container = document.createElement('div');
    await renderChildListView(container, { onSelectChild: () => {} });

    const badFile = new File(['not a docx file'], '壞檔案.docx', { type: 'text/plain' });
    selectFile(container.querySelector('[data-field="import-file"]'), badFile);

    await waitFor(() => container.textContent.includes('無法讀取'));
    expect(container.textContent).toContain('壞檔案.docx');
    expect(container.textContent).toContain('幼兒列表');
  });

  it('deletes a child after confirmation and re-renders the list without it', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });

    const container = document.createElement('div');
    await renderChildListView(container, { onSelectChild: () => {}, confirmDelete: () => true });

    container.querySelector(`[data-delete-child="${child.id}"]`).click();

    await waitFor(() => !container.textContent.includes('陳小安'));
    expect(container.textContent).not.toContain('陳小安');
  });

  it('keeps the child when deletion is not confirmed', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });

    const container = document.createElement('div');
    await renderChildListView(container, { onSelectChild: () => {}, confirmDelete: () => false });

    container.querySelector(`[data-delete-child="${child.id}"]`).click();

    expect(container.textContent).toContain('陳小安');
  });

  it('shows an error message when deleting a child fails', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    const dbModule = await import('../src/storage/db.js');
    vi.spyOn(dbModule, 'deleteChild').mockRejectedValueOnce(new Error('Database error'));

    const container = document.createElement('div');
    await renderChildListView(container, { onSelectChild: () => {}, confirmDelete: () => true });

    container.querySelector(`[data-delete-child="${child.id}"]`).click();

    await waitFor(() => container.textContent.includes('刪除失敗，請再試一次'));
    expect(container.textContent).toContain('陳小安');

    vi.restoreAllMocks();
  });

  it('renders a malicious child name as inert text, not markup', async () => {
    await addChild({ name: '<script>window.__xss = true;</script>', birthDate: '2024-11-01' });

    const container = document.createElement('div');
    await renderChildListView(container, { onSelectChild: () => {} });

    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).toContain('&lt;script&gt;');
    expect(container.textContent).toContain('<script>window.__xss = true;</script>');
  });

  it('renders no back button when onBack is not provided (existing top-level usage)', async () => {
    const container = document.createElement('div');
    await renderChildListView(container, { onSelectChild: () => {} });
    expect(container.querySelector('[data-action="back"]')).toBeNull();
  });

  it('calls onBack when the back button is clicked, when onBack is provided', async () => {
    const container = document.createElement('div');
    let backCalled = false;
    await renderChildListView(container, { onSelectChild: () => {}, onBack: () => { backCalled = true; } });

    container.querySelector('[data-action="back"]').click();
    expect(backCalled).toBe(true);
  });

  it('shows the relabeled 適性總表 import trigger when reportType is not passed (backward compatibility)', async () => {
    const container = document.createElement('div');
    await renderChildListView(container, { onSelectChild: () => {} });

    expect(container.querySelector('[data-action="import-docx"]').textContent).toBe('適性總表匯入');
    expect(container.querySelector('[data-action="import-parent-report-docx"]')).toBeNull();
  });

  it('shows the 適性總表 import trigger, not the 適性紀錄 one, when reportType is not parent-report', async () => {
    const container = document.createElement('div');
    await renderChildListView(container, { onSelectChild: () => {}, reportType: 'assessment' });

    expect(container.querySelector('[data-action="import-docx"]').textContent).toBe('適性總表匯入');
    expect(container.querySelector('[data-action="import-parent-report-docx"]')).toBeNull();
  });

  it('shows the 適性紀錄 import trigger, not the 適性總表 one, when reportType is parent-report', async () => {
    const container = document.createElement('div');
    await renderChildListView(container, { onSelectChild: () => {}, reportType: 'parent-report' });

    expect(container.querySelector('[data-action="import-parent-report-docx"]').textContent).toBe('適性紀錄匯入');
    expect(container.querySelector('[data-action="import-docx"]')).toBeNull();
  });

  it('opens the parent-report import preview after selecting a valid Word file, when reportType is parent-report', async () => {
    const container = document.createElement('div');
    await renderChildListView(container, { onSelectChild: () => {}, reportType: 'parent-report' });

    const file = await buildSampleParentReportDocxFile();
    selectFile(container.querySelector('[data-field="import-parent-report-file"]'), file);

    await waitFor(() => container.textContent.includes('確認匯入內容（適性紀錄）'));
    expect(container.querySelector('[data-field="name"]').value).toBe('陳小安');
  });
});
