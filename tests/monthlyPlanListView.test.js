import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import { listMonthlyCoursePlans, listPlanSlotItems, getOrCreatePlanSlot } from '../src/storage/monthlyPlanDb.js';
import { renderMonthlyPlanListView } from '../src/ui/monthlyPlanListView.js';
import { currentRocYear } from '../src/ui/periodFields.js';
import { waitFor } from './helpers.js';

describe('monthlyPlanListView', () => {
  let container, childA, childB;

  beforeEach(async () => {
    await clearAllData();
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
});
