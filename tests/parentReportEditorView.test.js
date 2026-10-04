import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import {
  addParentReport, getParentReport, addCoursePlanEntry, addCourseOccurrence, listCourseOccurrencesForEntry,
  addBehaviorObservation, listBehaviorObservationsForReport,
} from '../src/storage/parentReportDb.js';
import { downloadParentReportDocx } from '../src/export/parentReportDocxExport.js';
import { renderParentReportEditorView } from '../src/ui/parentReportEditorView.js';
import { waitFor } from './helpers.js';

// Mocked so the 匯出 tests below can see whether a download happened without building a real docx.
vi.mock('../src/export/parentReportDocxExport.js', () => ({
  generateParentReportDocxBlob: vi.fn().mockResolvedValue(new Blob(['x'])),
  downloadParentReportDocx: vi.fn(),
}));

describe('renderParentReportEditorView', () => {
  let child, report;

  let scrollToSpy;

  beforeEach(async () => {
    scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    await clearAllData();
    child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
  });

  afterEach(() => {
    scrollToSpy.mockRestore();
  });

  it('clears the imported report\'s isNew flag as soon as it is opened', async () => {
    const importedReport = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年07月', isNew: true });

    const container = document.createElement('div');
    await renderParentReportEditorView(container, { child, report: importedReport, onBack: () => {} });

    expect(importedReport.isNew).toBe(false);
    expect((await getParentReport(importedReport.id)).isNew).toBe(false);
  });

  it('shows the child name, tier, and period in the header', async () => {
    const container = document.createElement('div');
    await renderParentReportEditorView(container, { child, report, onBack: () => {} });
    expect(container.textContent).toContain('陳小安');
    expect(container.textContent).toContain('Ⅴ');
    expect(container.textContent).toContain('115年06月');
  });

  it('defaults to the 課程計畫表 tab', async () => {
    const container = document.createElement('div');
    await renderParentReportEditorView(container, { child, report, onBack: () => {} });
    expect(container.querySelector('[data-tab="coursePlan"]').classList.contains('tabs__button--active')).toBe(true);
  });

  it('switches tabs when a tab button is clicked', async () => {
    const container = document.createElement('div');
    await renderParentReportEditorView(container, { child, report, onBack: () => {} });

    container.querySelector('[data-tab="highlights"]').click();
    await waitFor(() => container.querySelector('[data-tab="highlights"]').classList.contains('tabs__button--active'));

    expect(container.querySelector('[data-tab="highlights"]').classList.contains('tabs__button--active')).toBe(true);
    expect(container.querySelector('[data-tab="coursePlan"]').classList.contains('tabs__button--active')).toBe(false);
  });

  it('calls onBack when the back button is clicked', async () => {
    const container = document.createElement('div');
    let backCalled = false;
    await renderParentReportEditorView(container, { child, report, onBack: () => { backCalled = true; } });

    container.querySelector('[data-action="back"]').click();
    expect(backCalled).toBe(true);
  });

  it('puts 套用其他幼兒課程計畫 left of 匯出 Word on the 課程計畫表 tab only', async () => {
    const container = document.createElement('div');
    await renderParentReportEditorView(container, { child, report, onBack: () => {} });

    const actions = container.querySelector('.page-header .page-header__actions');
    const [copyButton, exportButton] = actions.querySelectorAll('button');
    expect(copyButton.dataset.action).toBe('copy-course-plan');
    expect(copyButton.classList.contains('btn--purple')).toBe(true);
    expect(copyButton.querySelector('.btn__label-full').textContent).toBe('套用其他幼兒課程計畫');
    expect(copyButton.querySelector('.btn__label-short').textContent).toBe('套用');
    expect(exportButton.dataset.action).toBe('export');
    expect(container.querySelector('[data-copy-plan-form]')).not.toBeNull();

    for (const activeTab of ['developmentRecord', 'behaviorObservation', 'highlights']) {
      const other = document.createElement('div');
      await renderParentReportEditorView(other, { child, report, onBack: () => {}, activeTab });
      expect(other.querySelector('[data-action="copy-course-plan"]')).toBeNull();
      expect(other.querySelector('[data-copy-plan-form]')).toBeNull();
      expect(other.querySelector('.page-header [data-action="export"]')).not.toBeNull();
    }
  });
});

describe('匯出: 今天/今日 check', () => {
  const OLD = '2020-01-01T00:00:00.000Z';
  let child, report, container, entry;

  beforeEach(async () => {
    await clearAllData();
    vi.mocked(downloadParentReportDocx).mockClear();
    // jsdom has no showModal/close behaviour for <dialog>.
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
    child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
    entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-1', activityName: '積木遊戲' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-06-03', status: 'developed', absent: false, note: '今天很專心' });
    await addBehaviorObservation({ reportId: report.id, title: '分享', narrative: '今日主動幫忙', updatedAt: OLD });
    container = document.createElement('div');
    document.body.appendChild(container);
    await renderParentReportEditorView(container, { child, report, onBack: () => {} });
  });

  afterEach(() => {
    container.remove();
    document.querySelectorAll('dialog.today-check').forEach(d => d.remove());
  });

  const openCheck = async () => {
    container.querySelector('[data-action="export"]').click();
    await waitFor(() => document.querySelector('dialog.today-check'));
    return document.querySelector('dialog.today-check');
  };

  it('exports straight away with no popup when nothing mentions 今天/今日', async () => {
    const plainReport = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年07月' });
    await renderParentReportEditorView(container, { child, report: plainReport, onBack: () => {} });
    container.querySelector('[data-action="export"]').click();
    await waitFor(() => vi.mocked(downloadParentReportDocx).mock.calls.length === 1);
    expect(document.querySelector('dialog.today-check')).toBeNull();
  });

  it('lists each matching field with its label and text, without exporting yet', async () => {
    const dialog = await openCheck();
    expect(dialog.textContent).toContain('以下內容含有『今天』或『今日』，可以在這裡修改');
    expect([...dialog.querySelectorAll('[data-today-field]')].map(f => f.value)).toEqual(['今天很專心', '今日主動幫忙']);
    expect(dialog.textContent).toContain('課程計畫表｜積木遊戲｜115/06/03 說明');
    expect(dialog.textContent).toContain('行為觀察｜分享｜內容');
    expect(vi.mocked(downloadParentReportDocx)).not.toHaveBeenCalled();
  });

  it('只儲存 saves only changed fields and does not export', async () => {
    const dialog = await openCheck();
    dialog.querySelectorAll('[data-today-field]')[0].value = '6/3很專心';
    dialog.querySelector('[data-today-action="save"]').click();
    await waitFor(() => !document.querySelector('dialog.today-check'));
    expect((await listCourseOccurrencesForEntry(entry.id))[0].note).toBe('6/3很專心');
    const [observation] = await listBehaviorObservationsForReport(report.id);
    expect(observation.narrative).toBe('今日主動幫忙');
    expect(observation.updatedAt).toBe(OLD); // unchanged field not rewritten
    expect(vi.mocked(downloadParentReportDocx)).not.toHaveBeenCalled();
    await waitFor(() => container.textContent.includes('6/3很專心'));
  });

  it('儲存並匯出 saves, then exports', async () => {
    const dialog = await openCheck();
    dialog.querySelectorAll('[data-today-field]')[1].value = '主動幫忙';
    dialog.querySelector('[data-today-action="save-export"]').click();
    await waitFor(() => vi.mocked(downloadParentReportDocx).mock.calls.length === 1);
    expect((await listBehaviorObservationsForReport(report.id))[0].narrative).toBe('主動幫忙');
  });

  it('取消 saves nothing and does not export', async () => {
    const dialog = await openCheck();
    dialog.querySelectorAll('[data-today-field]')[0].value = '改了';
    dialog.querySelector('[data-today-action="cancel"]').click();
    await waitFor(() => !document.querySelector('dialog.today-check'));
    expect((await listCourseOccurrencesForEntry(entry.id))[0].note).toBe('今天很專心');
    expect(vi.mocked(downloadParentReportDocx)).not.toHaveBeenCalled();
  });

  it('keeps unsaved typing elsewhere on the tab through the redraw after 只儲存', async () => {
    container.querySelector('[data-field="activityName"]').value = '打到一半';
    const dialog = await openCheck();
    dialog.querySelectorAll('[data-today-field]')[0].value = '6/3很專心';
    dialog.querySelector('[data-today-action="save"]').click();
    await waitFor(() => container.textContent.includes('6/3很專心'));
    expect(container.querySelector('[data-field="activityName"]').value).toBe('打到一半');
  });
});
