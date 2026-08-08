import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import {
  addParentReport, addCoursePlanEntry, addCourseOccurrence,
  listCoursePlanEntriesForReport, listCourseOccurrencesForEntry,
} from '../src/storage/parentReportDb.js';
import { renderCoursePlanTab } from '../src/ui/courseplanTabView.js';
import { waitFor } from './helpers.js';

describe('renderCoursePlanTab', () => {
  let report;

  beforeEach(async () => {
    await clearAllData();
    const child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
  });

  it('adds a new course plan entry via the form', async () => {
    const container = document.createElement('div');
    let changed = false;
    await renderCoursePlanTab(container, { report, onChange: () => { changed = true; } });

    container.querySelector('[data-field="indicatorCode"]').value = 'Ⅴ-1-6';
    container.querySelector('[data-field="activityName"]').value = '我愛畫畫';
    container.querySelector('[data-action="add-entry"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => changed);
  });

  it('adds a new course plan entry with teacher-entered indicator text via the form', async () => {
    const container = document.createElement('div');
    let changed = false;
    await renderCoursePlanTab(container, { report, onChange: () => { changed = true; } });

    container.querySelector('[data-field="indicatorCode"]').value = 'Ⅴ-1-6';
    container.querySelector('[data-field="activityName"]').value = '我愛畫畫';
    container.querySelector('[data-field="indicatorText"]').value = '能穩定握筆塗鴉';
    container.querySelector('[data-action="add-entry"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => changed);

    const [entry] = await listCoursePlanEntriesForReport(report.id);
    expect(entry.indicatorText).toBe('能穩定握筆塗鴉');
  });

  it('renders an existing entry grouped under its domain, with its teacher-entered indicator text (not the system description)', async () => {
    await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫', indicatorText: '能穩定握筆塗鴉' });

    const container = document.createElement('div');
    await renderCoursePlanTab(container, { report, onChange: () => {} });

    expect(container.textContent).toContain('身體動作');
    expect(container.textContent).toContain('我愛畫畫');
    expect(container.textContent).toContain('能穩定握筆塗鴉');
    // The dropdown's option labels (both the always-visible add-form's and the entry's own
    // hidden edit-form's) still use the system's official description as a selection aid, so
    // '能拿筆塗鴉' (Ⅴ-1-6's official description) legitimately still appears in the DOM via
    // <option> elements — but it must NOT be used for the entry card's own visible title content.
    const entryTitle = container.querySelector(`[data-course-entry] .indicator-block__title`);
    expect(entryTitle.textContent).not.toContain('能拿筆塗鴉');
  });

  it('adds an occurrence to an existing entry', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });

    const container = document.createElement('div');
    let changed = false;
    await renderCoursePlanTab(container, { report, onChange: () => { changed = true; } });

    container.querySelector(`[data-add-occurrence-for="${entry.id}"]`).click();
    container.querySelector(`[data-occurrence-field="date"][data-entry-id="${entry.id}"]`).value = '2026-06-11';
    container.querySelector(`[data-occurrence-field="status"][data-entry-id="${entry.id}"][value="developed"]`).checked = true;
    container.querySelector(`[data-occurrence-field="note"][data-entry-id="${entry.id}"]`).value = '小安能拿著海綿印章畫畫';
    container.querySelector(`[data-occurrence-save-for="${entry.id}"]`).click();

    await waitFor(() => changed);
  });

  it('marking absent disables the status choice', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });

    const container = document.createElement('div');
    await renderCoursePlanTab(container, { report, onChange: () => {} });

    container.querySelector(`[data-add-occurrence-for="${entry.id}"]`).click();
    const absentCheckbox = container.querySelector(`[data-occurrence-field="absent"][data-entry-id="${entry.id}"]`);
    absentCheckbox.checked = true;
    absentCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    const statusRadios = container.querySelectorAll(`[data-occurrence-field="status"][data-entry-id="${entry.id}"]`);
    for (const radio of statusRadios) expect(radio.disabled).toBe(true);
  });

  it('deletes a course plan entry after confirmation', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });

    const container = document.createElement('div');
    let changed = false;
    await renderCoursePlanTab(container, { report, onChange: () => { changed = true; }, confirmDelete: () => true });

    container.querySelector(`[data-delete-entry="${entry.id}"]`).click();
    await waitFor(() => changed);
  });

  it('keeps the course plan entry when deletion is not confirmed', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });

    const container = document.createElement('div');
    let changed = false;
    await renderCoursePlanTab(container, { report, onChange: () => { changed = true; }, confirmDelete: () => false });

    container.querySelector(`[data-delete-entry="${entry.id}"]`).click();

    const remaining = await listCoursePlanEntriesForReport(report.id);
    expect(remaining).toHaveLength(1);
    expect(changed).toBe(false);
  });

  it('deletes an occurrence after confirmation', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });
    const occurrence = await addCourseOccurrence({ entryId: entry.id, date: '2026-06-11', status: 'developed', absent: false, note: 'x' });

    const container = document.createElement('div');
    let changed = false;
    await renderCoursePlanTab(container, { report, onChange: () => { changed = true; }, confirmDelete: () => true });

    container.querySelector(`[data-delete-occurrence="${occurrence.id}"]`).click();
    await waitFor(() => changed);
  });

  it('keeps the occurrence when deletion is not confirmed', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });
    const occurrence = await addCourseOccurrence({ entryId: entry.id, date: '2026-06-11', status: 'developed', absent: false, note: 'x' });

    const container = document.createElement('div');
    let changed = false;
    await renderCoursePlanTab(container, { report, onChange: () => { changed = true; }, confirmDelete: () => false });

    container.querySelector(`[data-delete-occurrence="${occurrence.id}"]`).click();

    const remaining = await listCourseOccurrencesForEntry(entry.id);
    expect(remaining).toHaveLength(1);
    expect(changed).toBe(false);
  });

  it('toggles the occurrence add-form open and closed when the "＋ 新增實施紀錄" button is clicked repeatedly', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });

    const container = document.createElement('div');
    await renderCoursePlanTab(container, { report, onChange: () => {} });

    const toggleButton = container.querySelector(`[data-add-occurrence-for="${entry.id}"]`);
    const form = container.querySelector(`[data-occurrence-form-for="${entry.id}"]`);
    expect(form.hidden).toBe(true);

    toggleButton.click();
    expect(form.hidden).toBe(false);

    toggleButton.click();
    expect(form.hidden).toBe(true);
  });

  it('editing a course plan entry: shows a pre-filled form, saves via updateCoursePlanEntry, and triggers onChange', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫', indicatorText: '能穩定握筆塗鴉' });

    const container = document.createElement('div');
    let changed = false;
    await renderCoursePlanTab(container, { report, onChange: () => { changed = true; } });

    const editForm = container.querySelector(`[data-entry-edit-form-for="${entry.id}"]`);
    expect(editForm.hidden).toBe(true);

    container.querySelector(`[data-edit-entry="${entry.id}"]`).click();
    expect(editForm.hidden).toBe(false);
    expect(container.querySelector(`[data-entry-edit-field="activityName"][data-entry-id="${entry.id}"]`).value).toBe('我愛畫畫');
    expect(container.querySelector(`[data-entry-edit-field="indicatorText"][data-entry-id="${entry.id}"]`).value).toBe('能穩定握筆塗鴉');

    container.querySelector(`[data-entry-edit-field="activityName"][data-entry-id="${entry.id}"]`).value = '我愛畫水彩';
    container.querySelector(`[data-entry-edit-save-for="${entry.id}"]`).click();

    await waitFor(() => changed);
    const [updated] = await listCoursePlanEntriesForReport(report.id);
    expect(updated.activityName).toBe('我愛畫水彩');

    // Clicking 編輯 again should toggle the (still-open, since no re-render happened) form back closed.
    container.querySelector(`[data-edit-entry="${entry.id}"]`).click();
    expect(editForm.hidden).toBe(true);
  });

  it('editing a course occurrence: shows a pre-filled form, saves via updateCourseOccurrence, and triggers onChange', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });
    const occurrence = await addCourseOccurrence({ entryId: entry.id, date: '2026-06-11', status: 'developed', absent: false, note: '小安畫得很開心' });

    const container = document.createElement('div');
    let changed = false;
    await renderCoursePlanTab(container, { report, onChange: () => { changed = true; } });

    const editForm = container.querySelector(`[data-occurrence-edit-form-for="${occurrence.id}"]`);
    expect(editForm.hidden).toBe(true);

    container.querySelector(`[data-edit-occurrence="${occurrence.id}"]`).click();
    expect(editForm.hidden).toBe(false);
    expect(container.querySelector(`[data-occurrence-edit-field="date"][data-occurrence-id="${occurrence.id}"]`).value).toBe('2026-06-11');
    expect(container.querySelector(`[data-occurrence-edit-field="note"][data-occurrence-id="${occurrence.id}"]`).value).toBe('小安畫得很開心');

    container.querySelector(`[data-occurrence-edit-field="note"][data-occurrence-id="${occurrence.id}"]`).value = '小安畫得更開心了';
    container.querySelector(`[data-occurrence-edit-save-for="${occurrence.id}"]`).click();

    await waitFor(() => changed);
    const [updated] = await listCourseOccurrencesForEntry(entry.id);
    expect(updated.note).toBe('小安畫得更開心了');
  });

  it('editing an occurrence and changing only the note does not silently flip its status (regression)', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });
    const occurrence = await addCourseOccurrence({ entryId: entry.id, date: '2026-06-11', status: 'developing', absent: false, note: '小安正在嘗試' });

    const container = document.createElement('div');
    let changed = false;
    await renderCoursePlanTab(container, { report, onChange: () => { changed = true; } });

    container.querySelector(`[data-edit-occurrence="${occurrence.id}"]`).click();

    // The edit form must show the occurrence's actual current status, not silently default to 已發展○.
    const checkedStatus = container.querySelector(
      `[data-occurrence-edit-field="status"][data-occurrence-id="${occurrence.id}"]:checked`
    );
    expect(checkedStatus).not.toBeNull();
    expect(checkedStatus.value).toBe('developing');

    // Change only the note; leave status untouched.
    container.querySelector(`[data-occurrence-edit-field="note"][data-occurrence-id="${occurrence.id}"]`).value = '小安持續練習中';
    container.querySelector(`[data-occurrence-edit-save-for="${occurrence.id}"]`).click();

    await waitFor(() => changed);
    const [updated] = await listCourseOccurrencesForEntry(entry.id);
    expect(updated.note).toBe('小安持續練習中');
    expect(updated.status).toBe('developing');
  });

  it('marking 請假 in the occurrence EDIT form disables its status radios', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });
    const occurrence = await addCourseOccurrence({ entryId: entry.id, date: '2026-06-11', status: 'developed', absent: false, note: 'x' });

    const container = document.createElement('div');
    await renderCoursePlanTab(container, { report, onChange: () => {} });

    container.querySelector(`[data-edit-occurrence="${occurrence.id}"]`).click();

    const absentCheckbox = container.querySelector(`[data-occurrence-edit-field="absent"][data-occurrence-id="${occurrence.id}"]`);
    absentCheckbox.checked = true;
    absentCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    const statusRadios = container.querySelectorAll(`[data-occurrence-edit-field="status"][data-occurrence-id="${occurrence.id}"]`);
    expect(statusRadios.length).toBe(2);
    for (const radio of statusRadios) expect(radio.disabled).toBe(true);
  });
});
