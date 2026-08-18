import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import { addParentReport, getParentReport } from '../src/storage/parentReportDb.js';
import { renderParentReportEditorView } from '../src/ui/parentReportEditorView.js';
import { waitFor } from './helpers.js';

describe('renderParentReportEditorView', () => {
  let child, report;

  beforeEach(async () => {
    await clearAllData();
    child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
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
});
