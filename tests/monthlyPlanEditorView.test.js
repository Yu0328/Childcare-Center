import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import {
  addMonthlyCoursePlan, getOrCreatePlanSlot, addPlanSlotItem, setChildItemOverride, listPlanSlotItems,
  listChildItemOverridesForPlan,
} from '../src/storage/monthlyPlanDb.js';
import { renderMonthlyPlanEditorView } from '../src/ui/monthlyPlanEditorView.js';
import { waitFor } from './helpers.js';

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

describe('monthlyPlanEditorView: slot item editing', () => {
  let container, child, plan;

  beforeEach(async () => {
    await clearAllData();
    container = document.createElement('div');
    child = await addChild({ name: '趙萬竑', birthDate: '2024-07-01' });
    plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [child.id], childTiers: { [child.id]: 'Ⅴ' } });
    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });
    container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`).click();
    await waitFor(() => container.querySelector('[data-field="new-item-indicator"]'));
  });

  it('picking an indicator auto-fills activity name and indicator text in the add-item form', () => {
    const select = container.querySelector('[data-field="new-item-indicator"]');
    select.value = 'Ⅴ-4-3';
    select.dispatchEvent(new Event('change'));

    expect(container.querySelector('[data-field="new-item-activity-name"]').value).toBe('分類遊戲'.length > 0 ? container.querySelector('[data-field="new-item-activity-name"]').value : '');
    // The auto-filled activityName must be non-empty and the indicatorText must match the reference data.
    expect(container.querySelector('[data-field="new-item-activity-name"]').value.length).toBeGreaterThan(0);
    expect(container.querySelector('[data-field="new-item-indicator-text"]').value).toBe('能依形狀或顏色分類');
  });

  it('adding an item without an indicator (free activity) writes a PlanSlotItem and shows it in the cell', async () => {
    container.querySelector('[data-field="new-item-activity-name"]').value = '戶外教學';
    container.querySelector('[data-action="add-item"]').dispatchEvent(new Event('submit', { cancelable: true }));
    await waitFor(() => {
      const cell = container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`);
      return cell && cell.textContent.includes('戶外教學');
    });

    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const items = await listPlanSlotItems(slot.id);
    expect(items.map(i => i.activityName)).toEqual(['戶外教學']);
    expect(items[0].indicatorCode).toBeNull();

    const cell = container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`);
    expect(cell.textContent).toContain('戶外教學');
  });

  it('editing an existing item\'s activity name updates storage and the rendered cell', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: '原活動' });
    // Re-select the cell so the panel picks up the newly added item.
    container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`).click();
    await waitFor(() => container.querySelector(`[data-item-edit-field="activityName"][data-item-id="${item.id}"]`));

    container.querySelector(`[data-item-edit-field="activityName"][data-item-id="${item.id}"]`).value = '改過的活動';
    container.querySelector(`[data-item-edit-save-for="${item.id}"]`).click();
    await waitFor(() => {
      const cell = container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`);
      return cell && cell.textContent.includes('改過的活動');
    });

    const updated = await listPlanSlotItems(slot.id);
    expect(updated[0].activityName).toBe('改過的活動');
    const cell = container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`);
    expect(cell.textContent).toContain('改過的活動');
  });

  it('deleting an item removes it from storage and the cell', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: '要刪除' });
    container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`).click();
    await waitFor(() => container.querySelector(`[data-delete-item="${item.id}"]`));

    container.querySelector(`[data-delete-item="${item.id}"]`).click();
    // Wait on storage directly, not the cell's rendered text: the cell was rendered before this
    // item existed (added via direct storage call, not the add-item form) and a plain `selectCell`
    // never repaints the calendar cell — only `refreshCellAndPanel` does — so "cell text no longer
    // contains 要刪除" would already be (trivially, vacuously) true before the delete even runs.
    await waitFor(async () => (await listPlanSlotItems(slot.id)).length === 0);

    expect(await listPlanSlotItems(slot.id)).toEqual([]);
    const cell = container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`);
    expect(cell.textContent).not.toContain('要刪除');
  });
});

describe('monthlyPlanEditorView: per-child overrides', () => {
  let container, childA, childB, plan, item;

  beforeEach(async () => {
    await clearAllData();
    container = document.createElement('div');
    childA = await addChild({ name: '趙萬竑', birthDate: '2024-07-01' });
    childB = await addChild({ name: '鍾晴妍', birthDate: '2024-08-01' });
    plan = await addMonthlyCoursePlan({
      period: '115年06月',
      childIds: [childA.id, childB.id],
      childTiers: { [childA.id]: 'Ⅴ', [childB.id]: 'Ⅴ' },
    });
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    item = await addPlanSlotItem({ slotId: slot.id, activityName: '拼拼圖' });

    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });
    container.querySelector(`.monthly-calendar__day[data-child-id="${childA.id}"][data-week-index="1"][data-weekday="3"]`).click();
    await waitFor(() => container.querySelector(`[data-override-field="notAchieved"][data-item-id="${item.id}"]`));
  });

  it('checking 未達成 for one child marks only that child\'s cell red', async () => {
    const notAchievedBox = container.querySelector(`[data-override-field="notAchieved"][data-item-id="${item.id}"]`);
    notAchievedBox.checked = true;
    notAchievedBox.dispatchEvent(new Event('change'));
    await waitFor(async () => (await listChildItemOverridesForPlan(plan.id)).length === 1);

    const overrides = await listChildItemOverridesForPlan(plan.id);
    expect(overrides).toHaveLength(1);
    expect(overrides[0]).toMatchObject({ childId: childA.id, itemId: item.id, notAchieved: true, replaced: false });

    const cellA = container.querySelector(`.monthly-calendar__day[data-child-id="${childA.id}"][data-week-index="1"][data-weekday="3"]`);
    expect(cellA.querySelector('.monthly-calendar__item--not-achieved')).not.toBeNull();
    const cellB = container.querySelector(`.monthly-calendar__day[data-child-id="${childB.id}"][data-week-index="1"][data-weekday="3"]`);
    expect(cellB.querySelector('.monthly-calendar__item--not-achieved')).toBeNull();
  });

  it('checking 請假 enables the replacement text field, and saving it shows the replacement in the cell', async () => {
    const replacedCheckbox = container.querySelector(`[data-override-field="replaced"][data-item-id="${item.id}"]`);
    replacedCheckbox.checked = true;
    replacedCheckbox.dispatchEvent(new Event('change'));
    // Wait on the actual persisted state, not just the input's `disabled` flag: that flag flips
    // synchronously inside the change handler as a UX nicety, well before the async
    // setChildItemOverride() write (and the refreshCellAndPanel() re-render that follows it)
    // actually completes. Waiting on the DOM flag alone lets this test's next interaction race
    // the first write's read-modify-write cycle and create a duplicate override row.
    await waitFor(async () => (await listChildItemOverridesForPlan(plan.id)).some(o => o.itemId === item.id && o.replaced === true));

    const replacementInput = container.querySelector(`[data-override-field="replacementText"][data-item-id="${item.id}"]`);
    expect(replacementInput.disabled).toBe(false);
    replacementInput.value = '請假';
    replacementInput.dispatchEvent(new Event('change'));
    // Wait on the rendered cell, not just the storage write: setChildItemOverride() resolving
    // only means the write landed, not that refreshCellAndPanel()'s subsequent (also async)
    // calendar-cell rewrite has completed yet.
    await waitFor(() => {
      const cell = container.querySelector(`.monthly-calendar__day[data-child-id="${childA.id}"][data-week-index="1"][data-weekday="3"]`);
      return cell && cell.textContent.includes('請假');
    });

    const overrides = await listChildItemOverridesForPlan(plan.id);
    expect(overrides[0]).toMatchObject({ replaced: true, replacementText: '請假' });

    const cellA = container.querySelector(`.monthly-calendar__day[data-child-id="${childA.id}"][data-week-index="1"][data-weekday="3"]`);
    expect(cellA.textContent).toContain('請假');
  });

  it('unchecking both flags removes the override row', async () => {
    const notAchievedBox = container.querySelector(`[data-override-field="notAchieved"][data-item-id="${item.id}"]`);
    notAchievedBox.checked = true;
    notAchievedBox.dispatchEvent(new Event('change'));
    await waitFor(async () => (await listChildItemOverridesForPlan(plan.id)).length === 1);

    notAchievedBox.checked = false;
    notAchievedBox.dispatchEvent(new Event('change'));
    await waitFor(async () => (await listChildItemOverridesForPlan(plan.id)).length === 0);

    expect(await listChildItemOverridesForPlan(plan.id)).toEqual([]);
  });
});
