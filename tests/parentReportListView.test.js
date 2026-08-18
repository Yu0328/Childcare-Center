import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import { addParentReport, listParentReportsForChild } from '../src/storage/parentReportDb.js';
import { renderParentReportListView } from '../src/ui/parentReportListView.js';
import { waitFor } from './helpers.js';

describe('renderParentReportListView', () => {
  let child;

  beforeEach(async () => {
    await clearAllData();
    child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
  });

  it('renders existing parent reports for the child', async () => {
    await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });

    const container = document.createElement('div');
    await renderParentReportListView(container, { child, onSelectReport: () => {}, onBack: () => {} });

    expect(container.textContent).toContain('Ⅴ');
    expect(container.textContent).toContain('115年06月');
  });

  it('shows a 新 badge for a report created via import, not for a normally-added one', async () => {
    await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月', isNew: true });
    await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年07月' });

    const container = document.createElement('div');
    await renderParentReportListView(container, { child, onSelectReport: () => {}, onBack: () => {} });

    const rows = [...container.querySelectorAll('.card-list__row')];
    const newRow = rows.find(r => r.textContent.includes('115年06月'));
    const normalRow = rows.find(r => r.textContent.includes('115年07月'));
    expect(newRow.querySelector('.new-badge')).not.toBeNull();
    expect(normalRow.querySelector('.new-badge')).toBeNull();
  });

  it('adds a new parent report via the form and re-renders the list', async () => {
    const container = document.createElement('div');
    await renderParentReportListView(container, { child, onSelectReport: () => {}, onBack: () => {} });

    container.querySelector('[data-field="tier"]').value = 'Ⅴ';
    container.querySelector('[data-field="period-year"]').value = '115';
    container.querySelector('[data-field="period-month"]').value = '6';
    container.querySelector('[data-action="add-report"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => container.textContent.includes('115年06月'));
    expect(container.textContent).toContain('115年06月');
  });

  it('calls onSelectReport with the clicked report', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });

    const container = document.createElement('div');
    let selected = null;
    await renderParentReportListView(container, { child, onSelectReport: r => { selected = r; }, onBack: () => {} });

    container.querySelector(`[data-report-id="${report.id}"]`).click();
    expect(selected).toEqual(report);
  });

  it('deletes a parent report after confirmation and re-renders the list without it', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });

    const container = document.createElement('div');
    await renderParentReportListView(container, { child, onSelectReport: () => {}, onBack: () => {}, confirmDelete: () => true });

    container.querySelector(`[data-delete-report="${report.id}"]`).click();

    await waitFor(() => !container.textContent.includes('115年06月'));
    expect(container.textContent).not.toContain('115年06月');
  });

  it('keeps the report when deletion is not confirmed', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });

    const container = document.createElement('div');
    await renderParentReportListView(container, { child, onSelectReport: () => {}, onBack: () => {}, confirmDelete: () => false });

    container.querySelector(`[data-delete-report="${report.id}"]`).click();
    expect(container.textContent).toContain('115年06月');
  });

  it('calls onBack when the back button is clicked', async () => {
    const container = document.createElement('div');
    let backCalled = false;
    await renderParentReportListView(container, { child, onSelectReport: () => {}, onBack: () => { backCalled = true; } });

    container.querySelector('[data-action="back"]').click();
    expect(backCalled).toBe(true);
  });
});
