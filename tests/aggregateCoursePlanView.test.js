import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import { addParentReport, addCoursePlanEntry, addCourseOccurrence } from '../src/storage/parentReportDb.js';
import { renderAggregateCoursePlanView } from '../src/ui/aggregateCoursePlanView.js';
import { waitFor } from './helpers.js';

describe('renderAggregateCoursePlanView', () => {
  let child;

  beforeEach(async () => {
    await clearAllData();
    child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
  });

  it('shows a message when the child has no parent reports to aggregate', async () => {
    const container = document.createElement('div');
    await renderAggregateCoursePlanView(container, { child, onCreated: () => {}, onBack: () => {} });

    expect(container.textContent).toContain('尚無適性紀錄可彙整');
    expect(container.querySelector('[data-action="aggregate"]')).toBeNull();
  });

  it('lists only the reports for the selected tier, and switches when the tier changes', async () => {
    await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    await addParentReport({ childId: child.id, tier: 'Ⅳ', period: '114年11月' });

    const container = document.createElement('div');
    await renderAggregateCoursePlanView(container, { child, onCreated: () => {}, onBack: () => {} });

    expect(container.textContent).toContain('114年11月');
    expect(container.textContent).not.toContain('115年01月');

    container.querySelector('[data-field="tier"]').value = 'Ⅴ';
    container.querySelector('[data-field="tier"]').dispatchEvent(new Event('change', { bubbles: true }));

    expect(container.textContent).toContain('115年01月');
    expect(container.textContent).not.toContain('114年11月');
  });

  it('requires at least one report to be checked before submitting', async () => {
    await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });

    const container = document.createElement('div');
    await renderAggregateCoursePlanView(container, { child, onCreated: () => {}, onBack: () => {} });

    container.querySelector('[data-action="aggregate"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(container.querySelector('[data-action="aggregate"] [data-error]').textContent).toContain('請至少勾選一筆適性紀錄');
  });

  it('creates the form and calls onCreated directly when there are no failed items', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-01-10', status: 'developed', absent: false, note: 'x' });

    const container = document.createElement('div');
    let created = null;
    await renderAggregateCoursePlanView(container, { child, onCreated: form => { created = form; }, onBack: () => {} });

    container.querySelector(`[data-report-checkbox="${report.id}"]`).checked = true;
    container.querySelector('[data-action="aggregate"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => created !== null);
    expect(created.tier).toBe('Ⅴ');
  });

  it('shows the failed list and only calls onCreated after "前往查看總表" is clicked', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    const badEntry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-9-9', activityName: '不存在的指標' });
    await addCourseOccurrence({ entryId: badEntry.id, date: '2026-01-10', status: 'developed', absent: false, note: 'x' });

    const container = document.createElement('div');
    let created = null;
    await renderAggregateCoursePlanView(container, { child, onCreated: form => { created = form; }, onBack: () => {} });

    container.querySelector(`[data-report-checkbox="${report.id}"]`).checked = true;
    container.querySelector('[data-action="aggregate"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => container.querySelector('[data-action="go-to-form"]'));
    expect(container.textContent).toContain('Ⅴ-9-9');
    expect(created).toBeNull();

    container.querySelector('[data-action="go-to-form"]').click();
    expect(created).not.toBeNull();
  });

  it('calls onBack when the back button is clicked', async () => {
    const container = document.createElement('div');
    const onBack = vi.fn();
    await renderAggregateCoursePlanView(container, { child, onCreated: () => {}, onBack });

    container.querySelector('[data-action="back"]').click();

    expect(onBack).toHaveBeenCalled();
  });
});
