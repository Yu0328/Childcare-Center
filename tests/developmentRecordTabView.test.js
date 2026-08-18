import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import {
  addParentReport, addCoursePlanEntry, addDevelopmentRecordEntry, listDevelopmentRecordEntriesForReport,
} from '../src/storage/parentReportDb.js';
import { renderDevelopmentRecordTab } from '../src/ui/developmentRecordTabView.js';
import { waitFor } from './helpers.js';

describe('renderDevelopmentRecordTab', () => {
  let report, entry;

  beforeEach(async () => {
    await clearAllData();
    const child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
    entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' }); // domain 1
  });

  it('gives the "新增段落" panel the wide/sticky variant class', async () => {
    const container = document.createElement('div');
    await renderDevelopmentRecordTab(container, { report, onChange: () => {} });

    expect(container.querySelector('[data-action="add-record"]').classList.contains('panel-form--wide')).toBe(true);
  });

  it('stacks domain cards in a single full-width column instead of side by side', async () => {
    const container = document.createElement('div');
    await renderDevelopmentRecordTab(container, { report, onChange: () => {} });

    expect(container.querySelector('.domain-grid').classList.contains('domain-grid--single')).toBe(true);
  });

  it('shows the indicator code, activity name, and indicator text on each reference checkbox so the teacher can tell entries apart', async () => {
    const withText = await addCoursePlanEntry({
      reportId: report.id, indicatorCode: 'Ⅴ-1-1', activityName: '上樓梯', indicatorText: '能獨立地走上樓梯',
    }); // domain 1

    const container = document.createElement('div');
    await renderDevelopmentRecordTab(container, { report, onChange: () => {}, selectedDomain: 1 });

    const label = container.querySelector(`[data-course-entry-checkbox="${withText.id}"]`).closest('label');
    expect(label.textContent).toContain('Ⅴ-1-1');
    expect(label.textContent).toContain('上樓梯');
    expect(label.textContent).toContain('能獨立地走上樓梯');
  });

  it('only lists course plan entries belonging to the currently selected domain as checkboxes', async () => {
    await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-2-2', activityName: '香蕉鬆餅' }); // domain 2

    const container = document.createElement('div');
    await renderDevelopmentRecordTab(container, { report, onChange: () => {}, selectedDomain: 1 });

    expect(container.querySelector(`[data-course-entry-checkbox="${entry.id}"]`)).not.toBeNull();
    expect(container.textContent).not.toContain('香蕉鬆餅');
  });

  it('re-renders with the checkbox list filtered to the newly selected domain when the domain picker changes', async () => {
    const other = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-2-2', activityName: '香蕉鬆餅' });

    const container = document.createElement('div');
    await renderDevelopmentRecordTab(container, { report, onChange: () => {}, selectedDomain: 1 });

    container.querySelector('[data-field="domain"]').value = '2';
    container.querySelector('[data-field="domain"]').dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => container.querySelector(`[data-course-entry-checkbox="${other.id}"]`) !== null);
    expect(container.textContent).toContain('香蕉鬆餅');
  });

  it('adds a development record entry referencing the checked course plan entries', async () => {
    const container = document.createElement('div');
    let changed = false;
    await renderDevelopmentRecordTab(container, { report, onChange: () => { changed = true; }, selectedDomain: 1 });

    container.querySelector(`[data-course-entry-checkbox="${entry.id}"]`).checked = true;
    container.querySelector('[data-field="narrative"]').value = '小安能拿著海綿印章在水畫布上畫畫';
    container.querySelector('[data-action="add-record"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => changed);
  });

  it('renders existing entries with their referenced indicator lines and narrative', async () => {
    await addDevelopmentRecordEntry({ reportId: report.id, domain: 1, courseEntryIds: [entry.id], narrative: '小安能輕鬆畫畫' });

    const container = document.createElement('div');
    await renderDevelopmentRecordTab(container, { report, onChange: () => {} });

    expect(container.textContent).toContain('身體動作');
    expect(container.textContent).toContain('Ⅴ-1-6');
    expect(container.textContent).toContain('小安能輕鬆畫畫');
  });

  it('deletes a development record entry after confirmation', async () => {
    const record = await addDevelopmentRecordEntry({ reportId: report.id, domain: 1, courseEntryIds: [entry.id], narrative: 'x' });

    const container = document.createElement('div');
    let changed = false;
    await renderDevelopmentRecordTab(container, { report, onChange: () => { changed = true; }, confirmDelete: () => true });

    container.querySelector(`[data-delete-record="${record.id}"]`).click();
    await waitFor(() => changed);
  });

  it('keeps the development record entry when deletion is not confirmed', async () => {
    const record = await addDevelopmentRecordEntry({ reportId: report.id, domain: 1, courseEntryIds: [entry.id], narrative: 'x' });

    const container = document.createElement('div');
    let changed = false;
    await renderDevelopmentRecordTab(container, { report, onChange: () => { changed = true; }, confirmDelete: () => false });

    container.querySelector(`[data-delete-record="${record.id}"]`).click();

    const remaining = await listDevelopmentRecordEntriesForReport(report.id);
    expect(remaining).toHaveLength(1);
    expect(changed).toBe(false);
  });

  it('toggles the edit form open and closed when 編輯 is clicked repeatedly', async () => {
    const record = await addDevelopmentRecordEntry({ reportId: report.id, domain: 1, courseEntryIds: [entry.id], narrative: '小安能輕鬆畫畫' });

    const container = document.createElement('div');
    await renderDevelopmentRecordTab(container, { report, onChange: () => {} });

    expect(container.querySelector(`[data-record-edit-form-for="${record.id}"]`).hidden).toBe(true);

    container.querySelector(`[data-edit-record="${record.id}"]`).click();
    await waitFor(() => container.querySelector(`[data-record-edit-form-for="${record.id}"]`).hidden === false);

    container.querySelector(`[data-edit-record="${record.id}"]`).click();
    await waitFor(() => container.querySelector(`[data-record-edit-form-for="${record.id}"]`).hidden === true);
  });

  it('editing a development record entry: shows a pre-filled form, saves via updateDevelopmentRecordEntry, and triggers onChange', async () => {
    const record = await addDevelopmentRecordEntry({ reportId: report.id, domain: 1, courseEntryIds: [entry.id], narrative: '小安能輕鬆畫畫' });

    const container = document.createElement('div');
    let changed = false;
    await renderDevelopmentRecordTab(container, { report, onChange: () => { changed = true; } });

    container.querySelector(`[data-edit-record="${record.id}"]`).click();
    await waitFor(() => container.querySelector(`[data-record-edit-form-for="${record.id}"]`).hidden === false);

    expect(container.querySelector(`[data-record-edit-field="narrative"][data-record-id="${record.id}"]`).value).toBe('小安能輕鬆畫畫');
    expect(container.querySelector(`[data-record-edit-entry-checkbox="${entry.id}"][data-record-id="${record.id}"]`).checked).toBe(true);

    container.querySelector(`[data-record-edit-field="narrative"][data-record-id="${record.id}"]`).value = '小安能自在地畫畫';
    container.querySelector(`[data-record-edit-save-for="${record.id}"]`).click();

    await waitFor(() => changed);
    const [updated] = await listDevelopmentRecordEntriesForReport(report.id);
    expect(updated.narrative).toBe('小安能自在地畫畫');
  });
});
