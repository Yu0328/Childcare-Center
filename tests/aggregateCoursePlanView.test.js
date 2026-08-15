import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearAllData, addChild, addForm, addEntry, listFormsForChild, listEntriesForForm } from '../src/storage/db.js';
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

  it('disables 合併進現有總表 when the selected tier has no existing forms', async () => {
    await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });

    const container = document.createElement('div');
    await renderAggregateCoursePlanView(container, { child, onCreated: () => {}, onBack: () => {} });

    expect(container.querySelector('[data-field="target-mode"][value="existing"]').disabled).toBe(true);
    expect(container.querySelector('[data-field="target-form"]')).toBeNull();
  });

  it('lists existing forms for the tier once 合併進現有總表 is selected', async () => {
    await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    await addForm({ childId: child.id, tier: 'Ⅴ', period: '115年03月' });

    const container = document.createElement('div');
    await renderAggregateCoursePlanView(container, { child, onCreated: () => {}, onBack: () => {} });

    const existingRadio = container.querySelector('[data-field="target-mode"][value="existing"]');
    expect(existingRadio.disabled).toBe(false);
    existingRadio.checked = true;
    existingRadio.dispatchEvent(new Event('change', { bubbles: true }));

    const options = [...container.querySelectorAll('[data-field="target-form"] option')].map(o => o.textContent);
    expect(options).toContain('115年03月');
  });

  it('keeps a checked 適性紀錄 checked after switching to 合併進現有總表', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    await addForm({ childId: child.id, tier: 'Ⅴ', period: '115年03月' });

    const container = document.createElement('div');
    await renderAggregateCoursePlanView(container, { child, onCreated: () => {}, onBack: () => {} });

    const checkbox = container.querySelector(`[data-report-checkbox="${report.id}"]`);
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    const existingRadio = container.querySelector('[data-field="target-mode"][value="existing"]');
    existingRadio.checked = true;
    existingRadio.dispatchEvent(new Event('change', { bubbles: true }));

    expect(container.querySelector(`[data-report-checkbox="${report.id}"]`).checked).toBe(true);
  });

  it('resets to 建立新總表 when switching to a tier with no existing forms', async () => {
    // Tiers sort to ['Ⅳ', 'Ⅴ'], so the view's default selected tier is Ⅳ — explicitly switch to
    // Ⅴ first (the tier that has an existing form) before exercising the existing-mode selection,
    // then switch to Ⅳ (no existing form) to verify the reset.
    await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    await addParentReport({ childId: child.id, tier: 'Ⅳ', period: '114年11月' });
    await addForm({ childId: child.id, tier: 'Ⅴ', period: '115年03月' });

    const container = document.createElement('div');
    await renderAggregateCoursePlanView(container, { child, onCreated: () => {}, onBack: () => {} });

    container.querySelector('[data-field="tier"]').value = 'Ⅴ';
    container.querySelector('[data-field="tier"]').dispatchEvent(new Event('change', { bubbles: true }));

    const existingRadio = container.querySelector('[data-field="target-mode"][value="existing"]');
    existingRadio.checked = true;
    existingRadio.dispatchEvent(new Event('change', { bubbles: true }));
    expect(container.querySelector('[data-field="target-form"]')).not.toBeNull();

    container.querySelector('[data-field="tier"]').value = 'Ⅳ';
    container.querySelector('[data-field="tier"]').dispatchEvent(new Event('change', { bubbles: true }));

    expect(container.querySelector('[data-field="target-mode"][value="new"]').checked).toBe(true);
    expect(container.querySelector('[data-field="target-form"]')).toBeNull();
  });

  it('requires selecting a target form when 合併進現有總表 is chosen', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    await addForm({ childId: child.id, tier: 'Ⅴ', period: '115年03月' });

    const container = document.createElement('div');
    await renderAggregateCoursePlanView(container, { child, onCreated: () => {}, onBack: () => {} });

    const existingRadio = container.querySelector('[data-field="target-mode"][value="existing"]');
    existingRadio.checked = true;
    existingRadio.dispatchEvent(new Event('change', { bubbles: true }));

    container.querySelector(`[data-report-checkbox="${report.id}"]`).checked = true;
    container.querySelector('[data-action="aggregate"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(container.querySelector('[data-action="aggregate"] [data-error]').textContent).toContain('請選擇要合併進去的總表');
  });

  it('merges into the selected existing form and calls onCreated directly when clean', async () => {
    const existingForm = await addForm({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年02月' });
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-02-10', status: 'developed', absent: false, note: 'x' });

    const container = document.createElement('div');
    let created = null;
    await renderAggregateCoursePlanView(container, { child, onCreated: form => { created = form; }, onBack: () => {} });

    const existingRadio = container.querySelector('[data-field="target-mode"][value="existing"]');
    existingRadio.checked = true;
    existingRadio.dispatchEvent(new Event('change', { bubbles: true }));
    container.querySelector('[data-field="target-form"]').value = String(existingForm.id);

    container.querySelector(`[data-report-checkbox="${report.id}"]`).checked = true;
    container.querySelector('[data-action="aggregate"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => created !== null);
    expect(created.id).toBe(existingForm.id);
    expect(created.period).toBe('115年01月-115年02月');
  });

  it('shows a preview with the skipped-duplicates count and only writes/navigates after "確認彙整" is clicked', async () => {
    const existingForm = await addForm({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    await addEntry({ formId: existingForm.id, indicatorCode: 'Ⅴ-1-6', date: '2026-01-10', status: 'developed', note: 'x' });

    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-01-10', status: 'developed', absent: false, note: 'x' });

    const container = document.createElement('div');
    let created = null;
    await renderAggregateCoursePlanView(container, { child, onCreated: form => { created = form; }, onBack: () => {} });

    const existingRadio = container.querySelector('[data-field="target-mode"][value="existing"]');
    existingRadio.checked = true;
    existingRadio.dispatchEvent(new Event('change', { bubbles: true }));
    container.querySelector('[data-field="target-form"]').value = String(existingForm.id);

    container.querySelector(`[data-report-checkbox="${report.id}"]`).checked = true;
    container.querySelector('[data-action="aggregate"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => container.querySelector('[data-action="confirm-aggregate"]'));
    expect(container.textContent).toContain('將跳過 1 筆重複資料');
    // Nothing written yet — the preview appears before any commit.
    expect(created).toBeNull();
    expect(await listEntriesForForm(existingForm.id)).toHaveLength(1);

    container.querySelector('[data-action="confirm-aggregate"]').click();
    await waitFor(() => created !== null);
    expect(created.id).toBe(existingForm.id);
  });

  it('lets the user cancel out of the preview without writing anything, back to an editable selection form', async () => {
    const existingForm = await addForm({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    await addEntry({ formId: existingForm.id, indicatorCode: 'Ⅴ-1-6', date: '2026-01-10', status: 'developed', note: 'x' });

    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-01-10', status: 'developed', absent: false, note: 'x' });

    const container = document.createElement('div');
    let created = null;
    await renderAggregateCoursePlanView(container, { child, onCreated: form => { created = form; }, onBack: () => {} });

    const existingRadio = container.querySelector('[data-field="target-mode"][value="existing"]');
    existingRadio.checked = true;
    existingRadio.dispatchEvent(new Event('change', { bubbles: true }));
    container.querySelector('[data-field="target-form"]').value = String(existingForm.id);

    container.querySelector(`[data-report-checkbox="${report.id}"]`).checked = true;
    container.querySelector('[data-action="aggregate"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => container.querySelector('[data-action="cancel-preview"]'));
    container.querySelector('[data-action="cancel-preview"]').click();

    expect(container.querySelector('[data-action="aggregate"]')).not.toBeNull();
    expect(created).toBeNull();
    expect(await listEntriesForForm(existingForm.id)).toHaveLength(1);
  });

  it('previews an unresolved-code entry (e.g. "我大大了") with its code/activity name/date/note before committing anything', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    const badEntry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-9-9', activityName: '我大大了' });
    await addCourseOccurrence({ entryId: badEntry.id, date: '2026-01-10', status: 'developed', absent: false, note: '無法對應到系統指標的紀錄' });

    const container = document.createElement('div');
    let created = null;
    await renderAggregateCoursePlanView(container, { child, onCreated: form => { created = form; }, onBack: () => {} });

    container.querySelector(`[data-report-checkbox="${report.id}"]`).checked = true;
    container.querySelector('[data-action="aggregate"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => container.querySelector('[data-action="confirm-aggregate"]'));
    expect(container.textContent).toContain('Ⅴ-9-9');
    expect(container.textContent).toContain('我大大了');
    expect(container.textContent).toContain('無法對應到系統指標的紀錄');
    // No form created yet at all — this is purely a preview.
    expect(created).toBeNull();
    expect(await listFormsForChild(child.id)).toEqual([]);

    container.querySelector('[data-action="confirm-aggregate"]').click();
    await waitFor(() => created !== null);
    expect(await listEntriesForForm(created.id)).toMatchObject([{ indicatorCode: 'Ⅴ-9-9' }]);
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

  it('previews (rather than writing immediately) when an entry\'s indicator code cannot be resolved, and still writes it once confirmed — not discarded', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    const badEntry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-9-9', activityName: '不存在的指標' });
    await addCourseOccurrence({ entryId: badEntry.id, date: '2026-01-10', status: 'developed', absent: false, note: 'x' });

    const container = document.createElement('div');
    let created = null;
    await renderAggregateCoursePlanView(container, { child, onCreated: form => { created = form; }, onBack: () => {} });

    container.querySelector(`[data-report-checkbox="${report.id}"]`).checked = true;
    container.querySelector('[data-action="aggregate"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => container.querySelector('[data-action="confirm-aggregate"]'));
    expect(created).toBeNull();

    container.querySelector('[data-action="confirm-aggregate"]').click();
    await waitFor(() => created !== null);
    expect(await listEntriesForForm(created.id)).toMatchObject([{ indicatorCode: 'Ⅴ-9-9' }]);
  });

  it('previews rerouted cross-tier entries instead of onCreated firing immediately, and files them into the right tier once confirmed', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    // Ⅳ-1-1 is a real indicator, but for the Ⅳ tier, not Ⅴ.
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅳ-1-1', activityName: '走路練習' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-01-10', status: 'developed', absent: false, note: 'x' });

    const container = document.createElement('div');
    let created = null;
    await renderAggregateCoursePlanView(container, { child, onCreated: form => { created = form; }, onBack: () => {} });

    container.querySelector(`[data-report-checkbox="${report.id}"]`).checked = true;
    container.querySelector('[data-action="aggregate"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => container.querySelector('[data-action="confirm-aggregate"]'));
    expect(container.textContent).toContain('將加進對應總表的備註');
    expect(created).toBeNull();
    expect(await listFormsForChild(child.id)).toEqual([]);

    container.querySelector('[data-action="confirm-aggregate"]').click();
    await waitFor(() => created !== null);

    const forms = await listFormsForChild(child.id);
    const ivForm = forms.find(f => f.tier === 'Ⅳ');
    expect(ivForm).toBeDefined();
    expect(await listEntriesForForm(ivForm.id)).toMatchObject([{ indicatorCode: 'Ⅳ-1-1' }]);
  });

  it('calls onBack when the back button is clicked', async () => {
    const container = document.createElement('div');
    const onBack = vi.fn();
    await renderAggregateCoursePlanView(container, { child, onCreated: () => {}, onBack });

    container.querySelector('[data-action="back"]').click();

    expect(onBack).toHaveBeenCalled();
  });
});
