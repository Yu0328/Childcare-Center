import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import { listMonthlyCoursePlans, listPlanSlotItems, getOrCreatePlanSlot } from '../src/storage/monthlyPlanDb.js';
import { renderMonthlyPlanListView } from '../src/ui/monthlyPlanListView.js';
import { currentRocYear } from '../src/ui/periodFields.js';
import { waitFor } from './helpers.js';
import { parseMonthlyPlanDocxImport } from '../src/import/monthlyPlanDocxImport.js';
import { generateMonthlyPlanDocxBlob } from '../src/export/monthlyPlanDocxExport.js';

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change'));
}

// Mirrors the fixture style in tests/monthlyPlanDocxExport.test.js: one child, one tier, no
// slot items — enough for parseMonthlyPlanDocxImport to round-trip the period and the child's
// name/tier out of the generated docx's title and per-child name cell.
async function buildSampleMonthlyPlanDocxFile() {
  const plan = { id: 1, period: '115年06月', childIds: [10], childTiers: { 10: 'Ⅴ' } };
  const children = [{ id: 10, name: '林小明', birthDate: '2024-07-01' }];
  const blob = await generateMonthlyPlanDocxBlob({ plan, children, slots: [], itemsBySlotId: {}, overrides: [] });
  return new File([blob], '115年06月課程計畫.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

describe('monthlyPlanListView', () => {
  let container, childA, childB;

  beforeEach(async () => {
    await clearAllData();
    document.querySelector('.toast-host')?.remove();
    container = document.createElement('div');
    // 2Y old as of 2026-06 -> tier Ⅴ (19-24個月); the exact birthdate only needs to land there.
    childA = await addChild({ name: '趙萬竑', birthDate: '2024-07-01' });
    childB = await addChild({ name: '張珏銨', birthDate: '2025-01-01' });
  });

  it('renders existing plans with their period', async () => {
    const { addMonthlyCoursePlan } = await import('../src/storage/monthlyPlanDb.js');
    await addMonthlyCoursePlan({ period: '115年06月', childIds: [childA.id], childTiers: { [childA.id]: 'Ⅴ' } });

    await renderMonthlyPlanListView(container, { onSelectPlan: vi.fn(), onBack: vi.fn() });

    expect(container.textContent).toContain('115年06月');
  });

  it('shows a 新 badge for a plan created via import, not for a normally-added one', async () => {
    const { addMonthlyCoursePlan } = await import('../src/storage/monthlyPlanDb.js');
    await addMonthlyCoursePlan({ period: '115年06月', childIds: [childA.id], childTiers: { [childA.id]: 'Ⅴ' }, isNew: true });
    await addMonthlyCoursePlan({ period: '115年07月', childIds: [childA.id], childTiers: { [childA.id]: 'Ⅴ' } });

    await renderMonthlyPlanListView(container, { onSelectPlan: vi.fn(), onBack: vi.fn() });

    const rows = [...container.querySelectorAll('.card-list__row')];
    const newRow = rows.find(r => r.textContent.includes('115年06月'));
    const normalRow = rows.find(r => r.textContent.includes('115年07月'));
    expect(newRow.querySelector('.new-badge')).not.toBeNull();
    expect(normalRow.querySelector('.new-badge')).toBeNull();
  });

  it('creating a plan: computes each child\'s tier for the period, seeds Mon/Tue defaults, and calls onSelectPlan', async () => {
    const onSelectPlan = vi.fn();
    await renderMonthlyPlanListView(container, { onSelectPlan, onBack: vi.fn() });

    const year = container.querySelector('[data-field="period-year"]');
    const month = container.querySelector('[data-field="period-month"]');
    year.value = String(currentRocYear());
    month.value = '6';
    container.querySelector(`[data-child-checkbox="${childA.id}"]`).checked = true;
    container.querySelector(`[data-child-checkbox="${childB.id}"]`).checked = true;

    container.querySelector('[data-action="add-plan"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => onSelectPlan.mock.calls.length > 0);

    const plans = await listMonthlyCoursePlans();
    expect(plans).toHaveLength(1);
    expect(plans[0].childIds.sort()).toEqual([childA.id, childB.id].sort());
    expect(plans[0].childTiers[childA.id]).toBeTypeOf('string');
    expect(onSelectPlan).toHaveBeenCalledWith(plans[0]);

    const slot = await getOrCreatePlanSlot({ planId: plans[0].id, tier: plans[0].childTiers[childA.id], weekIndex: 1, weekday: 1 });
    expect((await listPlanSlotItems(slot.id)).map(i => i.activityName)).toEqual(['大團體活動']);
  });

  it('shows a field error and does not create a plan when no child is selected', async () => {
    const onSelectPlan = vi.fn();
    await renderMonthlyPlanListView(container, { onSelectPlan, onBack: vi.fn() });

    container.querySelector('[data-action="add-plan"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => container.querySelector('[data-action="add-plan"] [data-error]').textContent !== '');

    expect(onSelectPlan).not.toHaveBeenCalled();
    expect(await listMonthlyCoursePlans()).toEqual([]);
    expect(container.querySelector('[data-action="add-plan"] [data-error]').textContent).not.toBe('');
  });

  it('deletes a plan after confirmation', async () => {
    const { addMonthlyCoursePlan } = await import('../src/storage/monthlyPlanDb.js');
    const plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [childA.id], childTiers: { [childA.id]: 'Ⅴ' } });

    await renderMonthlyPlanListView(container, { onSelectPlan: vi.fn(), onBack: vi.fn(), confirmDelete: () => true });
    container.querySelector(`[data-delete-plan="${plan.id}"]`).click();
    await waitFor(async () => (await listMonthlyCoursePlans()).length === 0);

    expect(await listMonthlyCoursePlans()).toEqual([]);
  });

  it('imports a docx file via the import button and file input', async () => {
    await renderMonthlyPlanListView(container, { onSelectPlan: vi.fn(), onBack: vi.fn() });

    const button = container.querySelector('[data-action="import-monthly-plan-docx"]');
    const fileInput = container.querySelector('[data-field="import-monthly-plan-file"]');
    expect(button).toBeTruthy();
    expect(fileInput).toBeTruthy();
    expect(fileInput.multiple).toBe(true);

    // A real file-picker interaction can't be simulated in jsdom; this test only asserts the
    // control exists and click() delegates to the hidden file input, matching childListView's
    // existing import-button test convention.
    const clickSpy = vi.spyOn(fileInput, 'click');
    button.click();
    expect(clickSpy).toHaveBeenCalled();
  });

  it('opens the monthly-plan import preview after selecting a valid Word file, with the parsed period/child data pre-filled', async () => {
    await renderMonthlyPlanListView(container, { onSelectPlan: vi.fn(), onBack: vi.fn() });

    const file = await buildSampleMonthlyPlanDocxFile();
    selectFile(container.querySelector('[data-field="import-monthly-plan-file"]'), file);

    await waitFor(() => container.textContent.includes('確認匯入內容（課程月計畫）'));
    expect(container.textContent).toContain('林小明');
    expect(container.querySelector('[data-field="period-year"]').value).toBe('115');
    expect(container.querySelector('[data-field="period-month"]').value).toBe('6');
  });

  it('shows a toast naming the file the moment the import is confirmed', async () => {
    await renderMonthlyPlanListView(container, { onSelectPlan: vi.fn(), onBack: vi.fn() });

    const file = await buildSampleMonthlyPlanDocxFile();
    selectFile(container.querySelector('[data-field="import-monthly-plan-file"]'), file);
    await waitFor(() => container.textContent.includes('確認匯入內容（課程月計畫）'));

    // 林小明 doesn't match an existing child, so the new-child birth date fields must be filled
    // in before the form validates (the docx export has no birth date to auto-fill).
    container.querySelector('[data-field="child-new-birthDate-year-0"]').value = '2024';
    container.querySelector('[data-field="child-new-birthDate-month-0"]').value = '7';
    container.querySelector('[data-field="child-new-birthDate-day-0"]').value = '1';

    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => document.querySelector('.toast')?.textContent.includes('115年06月課程計畫.docx'));
    expect(document.querySelector('.toast').textContent).toBe('已成功匯入：115年06月課程計畫.docx');
  });
});
