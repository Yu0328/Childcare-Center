import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import {
  addMonthlyCoursePlan, getOrCreatePlanSlot, addPlanSlotItem, setChildItemOverride,
} from '../src/storage/monthlyPlanDb.js';
import { renderMonthlyPlanEditorView } from '../src/ui/monthlyPlanEditorView.js';

describe('monthlyPlanEditorView: rendering', () => {
  let container, child, plan;

  beforeEach(async () => {
    await clearAllData();
    container = document.createElement('div');
    child = await addChild({ name: '趙萬竑', birthDate: '2024-07-01' });
    plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [child.id], childTiers: { [child.id]: 'Ⅴ' } });
  });

  it('renders one calendar section per child, with the child\'s name visible', async () => {
    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });

    const section = container.querySelector(`.monthly-calendar[data-child-id="${child.id}"]`);
    expect(section).not.toBeNull();
    expect(section.textContent).toContain('趙萬竑');
  });

  it('renders a slot item\'s text in its day cell', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    await addPlanSlotItem({ slotId: slot.id, indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲', indicatorText: '能依形狀或顏色分類' });

    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });

    const cell = container.querySelector(
      `.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`
    );
    expect(cell.textContent).toContain('分類遊戲');
    expect(cell.textContent).toContain('能依形狀或顏色分類');
  });

  it('renders a not-achieved item in red and a replaced item struck-through, for that child only', async () => {
    const otherChild = await addChild({ name: '鍾晴妍', birthDate: '2024-08-01' });
    const withOther = await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() }).then(async () => {
      const { updateMonthlyCoursePlan } = await import('../src/storage/monthlyPlanDb.js');
      return updateMonthlyCoursePlan(plan.id, {
        childIds: [child.id, otherChild.id],
        childTiers: { [child.id]: 'Ⅴ', [otherChild.id]: 'Ⅴ' },
      });
    });

    const slot = await getOrCreatePlanSlot({ planId: withOther.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: '拼拼圖' });
    await setChildItemOverride({ planId: withOther.id, childId: child.id, itemId: item.id, notAchieved: true, replaced: false });
    await setChildItemOverride({
      planId: withOther.id, childId: otherChild.id, itemId: item.id, notAchieved: false, replaced: true, replacementText: '請假',
    });

    await renderMonthlyPlanEditorView(container, { plan: withOther, onBack: vi.fn() });

    const cellA = container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`);
    const itemA = cellA.querySelector('.monthly-calendar__item');
    expect(itemA.classList.contains('monthly-calendar__item--not-achieved')).toBe(true);
    expect(itemA.classList.contains('monthly-calendar__item--replaced')).toBe(false);

    const cellB = container.querySelector(`.monthly-calendar__day[data-child-id="${otherChild.id}"][data-week-index="1"][data-weekday="3"]`);
    const itemB = cellB.querySelector('.monthly-calendar__item');
    expect(itemB.classList.contains('monthly-calendar__item--replaced')).toBe(true);
    expect(itemB.textContent).toContain('請假');
  });

  it('clicking a day cell selects it and updates the panel header', async () => {
    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });

    const cell = container.querySelector(
      `.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`
    );
    cell.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(cell.classList.contains('monthly-calendar__day--selected')).toBe(true);
    expect(container.querySelector('[data-panel-header]').textContent).toContain('趙萬竑');
    expect(container.querySelector('[data-panel-header]').textContent).toContain('06/03');
  });

  it('clicking a second cell moves the selection instead of adding to it', async () => {
    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });

    const cell3 = container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`);
    const cell4 = container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="4"]`);
    cell3.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    cell4.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(cell3.classList.contains('monthly-calendar__day--selected')).toBe(false);
    expect(cell4.classList.contains('monthly-calendar__day--selected')).toBe(true);
  });
});
