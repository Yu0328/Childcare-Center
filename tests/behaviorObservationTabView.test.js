import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import { addParentReport, addBehaviorObservation, listBehaviorObservationsForReport } from '../src/storage/parentReportDb.js';
import { renderBehaviorObservationTab } from '../src/ui/behaviorObservationTabView.js';
import { waitFor } from './helpers.js';

describe('renderBehaviorObservationTab', () => {
  let report;

  beforeEach(async () => {
    await clearAllData();
    const child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
  });

  it('renders existing observations', async () => {
    await addBehaviorObservation({ reportId: report.id, title: '我會好好說！', narrative: '本月觀察發現...' });

    const container = document.createElement('div');
    await renderBehaviorObservationTab(container, { report, onChange: () => {} });

    expect(container.textContent).toContain('我會好好說！');
    expect(container.textContent).toContain('本月觀察發現');
  });

  it('adds a new observation via the form', async () => {
    const container = document.createElement('div');
    let changed = false;
    await renderBehaviorObservationTab(container, { report, onChange: () => { changed = true; } });

    container.querySelector('[data-field="title"]').value = '我會好好說！';
    container.querySelector('[data-field="narrative"]').value = '本月觀察發現...';
    container.querySelector('[data-action="add-observation"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => changed);
  });

  it('deletes an observation after confirmation', async () => {
    const observation = await addBehaviorObservation({ reportId: report.id, title: 'x', narrative: 'y' });

    const container = document.createElement('div');
    let changed = false;
    await renderBehaviorObservationTab(container, { report, onChange: () => { changed = true; }, confirmDelete: () => true });

    container.querySelector(`[data-delete-observation="${observation.id}"]`).click();
    await waitFor(() => changed);
  });

  it('keeps the observation when deletion is not confirmed', async () => {
    const observation = await addBehaviorObservation({ reportId: report.id, title: 'x', narrative: 'y' });

    const container = document.createElement('div');
    let changed = false;
    await renderBehaviorObservationTab(container, { report, onChange: () => { changed = true; }, confirmDelete: () => false });

    container.querySelector(`[data-delete-observation="${observation.id}"]`).click();

    const remaining = await listBehaviorObservationsForReport(report.id);
    expect(remaining).toHaveLength(1);
    expect(changed).toBe(false);
  });

  it('toggles the edit form open and closed when 編輯 is clicked repeatedly', async () => {
    const observation = await addBehaviorObservation({ reportId: report.id, title: '我會好好說！', narrative: '本月觀察發現...' });

    const container = document.createElement('div');
    await renderBehaviorObservationTab(container, { report, onChange: () => {} });

    const form = container.querySelector(`[data-observation-edit-form-for="${observation.id}"]`);
    expect(form.hidden).toBe(true);

    container.querySelector(`[data-edit-observation="${observation.id}"]`).click();
    expect(form.hidden).toBe(false);

    container.querySelector(`[data-edit-observation="${observation.id}"]`).click();
    expect(form.hidden).toBe(true);
  });

  it('editing an observation: shows a pre-filled form, saves via updateBehaviorObservation, and triggers onChange', async () => {
    const observation = await addBehaviorObservation({ reportId: report.id, title: '我會好好說！', narrative: '本月觀察發現...' });

    const container = document.createElement('div');
    let changed = false;
    await renderBehaviorObservationTab(container, { report, onChange: () => { changed = true; } });

    container.querySelector(`[data-edit-observation="${observation.id}"]`).click();
    expect(container.querySelector(`[data-observation-edit-field="title"][data-observation-id="${observation.id}"]`).value).toBe('我會好好說！');
    expect(container.querySelector(`[data-observation-edit-field="narrative"][data-observation-id="${observation.id}"]`).value).toBe('本月觀察發現...');

    container.querySelector(`[data-observation-edit-field="title"][data-observation-id="${observation.id}"]`).value = '我會排隊等待！';
    container.querySelector(`[data-observation-edit-save-for="${observation.id}"]`).click();

    await waitFor(() => changed);
    const [updated] = await listBehaviorObservationsForReport(report.id);
    expect(updated.title).toBe('我會排隊等待！');
  });
});
