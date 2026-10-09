import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import {
  addMonthlyCoursePlan, getOrCreatePlanSlot, addPlanSlotItem, setChildItemOverride, listPlanSlotItems,
  listChildItemOverridesForPlan, getMonthlyCoursePlan,
} from '../src/storage/monthlyPlanDb.js';
import { renderMonthlyPlanEditorView } from '../src/ui/monthlyPlanEditorView.js';
import { generateMonthlyPlanDocxBlob } from '../src/export/monthlyPlanDocxExport.js';
import { waitFor } from './helpers.js';

// Mocked so the export-regression test below can inspect exactly what monthlyPlanEditorView.js's
// export button passes as `itemsBySlotId`/`overrides` — the same closure state (`data`) every
// other consumer reads — without needing to construct/parse a real docx Blob.
vi.mock('../src/export/monthlyPlanDocxExport.js', () => ({
  generateMonthlyPlanDocxBlob: vi.fn().mockResolvedValue(new Blob(['x'])),
}));

describe('monthlyPlanEditorView: rendering', () => {
  let container, child, plan;

  beforeEach(async () => {
    await clearAllData();
    container = document.createElement('div');
    child = await addChild({ name: '趙萬竑', birthDate: '2024-07-01' });
    plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [child.id], childTiers: { [child.id]: 'Ⅴ' } });
  });

  it('clears the imported plan\'s isNew flag as soon as it is opened', async () => {
    const importedPlan = await addMonthlyCoursePlan({
      period: '115年07月', childIds: [child.id], childTiers: { [child.id]: 'Ⅴ' }, isNew: true,
    });

    await renderMonthlyPlanEditorView(container, { plan: importedPlan, onBack: vi.fn() });

    expect(importedPlan.isNew).toBe(false);
    expect((await getMonthlyCoursePlan(importedPlan.id)).isNew).toBe(false);
  });

  it('renders one calendar section per child, with the child\'s name visible', async () => {
    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });

    const section = container.querySelector(`.monthly-calendar[data-child-id="${child.id}"]`);
    expect(section).not.toBeNull();
    expect(section.textContent).toContain('趙萬竑');
  });

  it('兩位以上幼兒時一次只顯示一位，點名字切換，重新整理後仍停在同一位', async () => {
    const second = await addChild({ name: '林小美', birthDate: '2024-05-01' });
    const twoPlan = await addMonthlyCoursePlan({
      period: '115年08月', childIds: [child.id, second.id], childTiers: { [child.id]: 'Ⅴ', [second.id]: 'Ⅴ' },
    });
    const visibleIds = () => [...container.querySelectorAll('.monthly-calendar')].filter(s => !s.hidden).map(s => s.dataset.childId);

    await renderMonthlyPlanEditorView(container, { plan: twoPlan, onBack: vi.fn() });
    expect(visibleIds()).toEqual([String(child.id)]);

    container.querySelector(`[data-switch-child="${second.id}"]`).click();
    expect(visibleIds()).toEqual([String(second.id)]);
    expect(container.querySelector(`[data-switch-child="${second.id}"]`).getAttribute('aria-pressed')).toBe('true');

    await renderMonthlyPlanEditorView(container, { plan: twoPlan, onBack: vi.fn() });
    expect(visibleIds()).toEqual([String(second.id)]);
  });

  it('切換幼兒時清掉上一位幼兒已選的格子與編輯面板，避免勾到別人身上', async () => {
    const second = await addChild({ name: '林小美', birthDate: '2024-05-01' });
    const twoPlan = await addMonthlyCoursePlan({
      period: '115年09月', childIds: [child.id, second.id], childTiers: { [child.id]: 'Ⅴ', [second.id]: 'Ⅴ' },
    });
    await renderMonthlyPlanEditorView(container, { plan: twoPlan, onBack: vi.fn() });

    container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`).click();
    await waitFor(() => container.querySelector('[data-panel-items]').children.length > 0);

    container.querySelector(`[data-switch-child="${second.id}"]`).click();
    await waitFor(() => container.querySelector('[data-panel-items]').children.length === 0);

    expect(container.querySelector('.monthly-calendar__day--selected')).toBeNull();
    expect(container.querySelector('[data-panel-header]').textContent).not.toContain('趙萬竑');
  });

  it('只有一位幼兒時不顯示切換列', async () => {
    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });
    expect(container.querySelector('.child-switch')).toBeNull();
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

  it('勾了請假但沒填替代內容時，日曆上的項目畫掉之外也顯示「請假」', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: '拼拼圖' });
    await setChildItemOverride({ planId: plan.id, childId: child.id, itemId: item.id, notAchieved: false, replaced: true, replacementText: '' });

    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });

    const cell = container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`);
    expect(cell.querySelector('.monthly-calendar__replacement').textContent).toBe('請假');
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
  let container, child, plan, confirmMessages, confirmAnswer;

  beforeEach(async () => {
    await clearAllData();
    container = document.createElement('div');
    child = await addChild({ name: '趙萬竑', birthDate: '2024-07-01' });
    plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [child.id], childTiers: { [child.id]: 'Ⅴ' } });
    confirmMessages = [];
    confirmAnswer = true;
    const confirmDelete = message => { confirmMessages.push(message); return confirmAnswer; };
    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn(), confirmDelete });
    container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`).click();
    await waitFor(() => container.querySelector('[data-field="new-item-indicator"]'));
  });

  it('picking an indicator auto-fills activity name and indicator text in the add-item form', () => {
    const select = container.querySelector('[data-field="new-item-indicator"]');
    select.value = 'Ⅴ-4-3';
    select.dispatchEvent(new Event('change'));

    expect(container.querySelector('[data-field="new-item-activity-name"]').value).toBe('分類遊戲');
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
    // Reselecting the same already-selected cell now skips the panel re-render (so unsaved input
    // survives a FAB-reopen/double-tap in the app) — select a different cell first, then back, to
    // force a fresh render that picks up the newly added item.
    container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="4"]`).click();
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

  it('clicking quickly from one day to another leaves the panel on the last day clicked', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: '第三天' });
    // Day 4 has no slot yet, so its panel load (which creates one) finishes after day 3's.
    container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="4"]`).click();
    container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`).click();
    await waitFor(() => container.querySelector(`[data-delete-item="${item.id}"]`));
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(container.querySelector(`[data-delete-item="${item.id}"]`)).not.toBeNull();
  });

  it('clicking the same day twice quickly still shows its items', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 2, weekday: 3 });
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: '連點' });
    const cell = container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="2"][data-weekday="3"]`);
    cell.click();
    cell.click();

    await waitFor(() => container.querySelector(`[data-delete-item="${item.id}"]`));
  });

  it('deleting an item removes it from storage and the cell', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: '要刪除' });
    // See the comment in the "editing an existing item" test above: reselecting the same cell no
    // longer force-refreshes the panel, so select away and back to pick up the direct storage write.
    container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="4"]`).click();
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
    expect(confirmMessages).toHaveLength(1);
    expect(confirmMessages[0]).toContain('要刪除');
  });

  it('刪除項目前先確認，按取消就不刪', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: '不要刪' });
    container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="4"]`).click();
    container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`).click();
    await waitFor(() => container.querySelector(`[data-delete-item="${item.id}"]`));
    confirmAnswer = false;

    container.querySelector(`[data-delete-item="${item.id}"]`).click();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(confirmMessages).toHaveLength(1);
    expect((await listPlanSlotItems(slot.id)).map(i => i.activityName)).toEqual(['不要刪']);
  });

  it('同階段有好幾位幼兒時，確認訊息說明會一起影響幾位', async () => {
    const other = await addChild({ name: '鍾晴妍', birthDate: '2024-08-01' });
    const { updateMonthlyCoursePlan } = await import('../src/storage/monthlyPlanDb.js');
    const twoPlan = await updateMonthlyCoursePlan(plan.id, { childIds: [child.id, other.id], childTiers: { [child.id]: 'Ⅴ', [other.id]: 'Ⅴ' } });
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: '共用活動' });
    await renderMonthlyPlanEditorView(container, { plan: twoPlan, onBack: vi.fn(), confirmDelete: m => { confirmMessages.push(m); return false; } });
    container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`).click();
    await waitFor(() => container.querySelector(`[data-delete-item="${item.id}"]`));

    container.querySelector(`[data-delete-item="${item.id}"]`).click();
    await waitFor(() => confirmMessages.length === 1);

    expect(confirmMessages[0]).toContain('2 位');
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
    replacementInput.value = '戶外教學';
    replacementInput.dispatchEvent(new Event('change'));
    // Wait on the rendered cell, not just the storage write: setChildItemOverride() resolving
    // only means the write landed, not that refreshCellAndPanel()'s subsequent (also async)
    // calendar-cell rewrite has completed yet. (Not 請假: the cell already shows that by default.)
    await waitFor(() => {
      const cell = container.querySelector(`.monthly-calendar__day[data-child-id="${childA.id}"][data-week-index="1"][data-weekday="3"]`);
      return cell && cell.textContent.includes('戶外教學');
    });

    const overrides = await listChildItemOverridesForPlan(plan.id);
    expect(overrides[0]).toMatchObject({ replaced: true, replacementText: '戶外教學' });
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

// Regression test for the review gap flagged in the final whole-branch review: the existing
// per-child override tests only assert a negative (child B's cell does NOT show child A's
// override), which would pass even if child B's cell never re-rendered at all. This asserts the
// feature's headline positive behavior — editing a slot's items via one child's panel must reach
// EVERY same-tier child's calendar, including one that was never clicked.
describe('monthlyPlanEditorView: 個別項目 (child-only items)', () => {
  let container, childA, childB, childC, plan, confirmMessages;
  const cell = id => container.querySelector(`.monthly-calendar__day[data-child-id="${id}"][data-week-index="1"][data-weekday="5"]`);
  const field = name => container.querySelector(`[data-field="${name}"]`);
  const submit = () => container.querySelector('[data-action="add-item"]').dispatchEvent(new Event('submit', { cancelable: true }));
  const allItems = async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 5 });
    return listPlanSlotItems(slot.id);
  };

  beforeEach(async () => {
    await clearAllData();
    container = document.createElement('div');
    childA = await addChild({ name: '趙萬竑', birthDate: '2024-07-01' });
    childB = await addChild({ name: '鍾晴妍', birthDate: '2024-08-01' });
    childC = await addChild({ name: '林小美', birthDate: '2025-01-01' });
    plan = await addMonthlyCoursePlan({
      period: '115年06月',
      childIds: [childA.id, childB.id, childC.id],
      childTiers: { [childA.id]: 'Ⅴ', [childB.id]: 'Ⅴ', [childC.id]: 'Ⅳ' },
    });
    confirmMessages = [];
    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn(), confirmDelete: m => { confirmMessages.push(m); return true; } });
    cell(childA.id).click();
    await waitFor(() => field('new-item-indicator'));
  });

  const toggle = () => container.querySelector('[data-individual-add]');
  const turnOn = () => { toggle().checked = true; toggle().dispatchEvent(new Event('change')); };
  const turnOff = () => { toggle().checked = false; toggle().dispatchEvent(new Event('change')); };
  const nameButton = id => container.querySelector(`[data-switch-child="${id}"]`);
  const note = () => container.querySelector('[data-individual-note]');

  it('with 個別新增 off, adds a shared item as before, the button just reads 新增', async () => {
    expect(toggle().checked).toBe(false);
    expect(note().hidden).toBe(true);
    expect(container.querySelector('[data-add-submit]').textContent).toBe('新增');
    field('new-item-activity-name').value = '共用活動';
    submit();
    await waitFor(() => cell(childB.id).textContent.includes('共用活動'));
    const [shared] = (await allItems()).filter(i => i.activityName === '共用活動');
    expect(shared).not.toHaveProperty('childId');
  });

  it('個別新增 adds an item only this child sees, tagged 個別, keeping text typed before switching it on', async () => {
    field('new-item-activity-name').value = '補課：積木';
    turnOn();
    expect(note().hidden).toBe(false);
    expect(note().textContent).toBe('新增項目只給趙萬竑；共用項目暫停編輯、刪除。');
    expect(container.querySelector('.tab-layout').classList.contains('tab-layout--individual')).toBe(true);
    expect(field('new-item-activity-name').value).toBe('補課：積木');
    submit();
    await waitFor(() => cell(childA.id).textContent.includes('補課：積木'));

    expect(cell(childA.id).querySelector('.monthly-calendar__item-tag').textContent).toBe('個別');
    expect(cell(childB.id).textContent).not.toContain('補課：積木');
    const [own] = (await allItems()).filter(i => i.activityName === '補課：積木');
    expect(own.childId).toBe(childA.id);
    expect(container.querySelector(`[data-panel-item="${own.id}"] .indicator-block__title`).textContent).toContain('個別');
  });

  it('while on, tapping a same-tier name picks them for 同時新增 (each gets their own copy) instead of switching child; other tiers are disabled', async () => {
    turnOn();
    expect(nameButton(childC.id).disabled).toBe(true);
    nameButton(childB.id).click();
    expect(nameButton(childB.id).classList.contains('child-switch__button--also')).toBe(true);
    expect(nameButton(childA.id).getAttribute('aria-pressed')).toBe('true'); // still on childA
    expect(note().textContent).toBe('新增項目只給趙萬竑、鍾晴妍；共用項目暫停編輯、刪除。');
    expect(container.querySelector('[data-child-switch-current]').textContent).toBe('趙萬竑 ＋1');

    field('new-item-activity-name').value = '補課：積木';
    submit();
    await waitFor(() => cell(childB.id).textContent.includes('補課：積木'));
    const copies = (await allItems()).filter(i => i.activityName === '補課：積木');
    expect(copies.map(i => i.childId).sort()).toEqual([childA.id, childB.id].sort());
    expect(nameButton(childB.id).classList.contains('child-switch__button--also')).toBe(true); // kept for the next add

    const mine = copies.find(i => i.childId === childA.id);
    container.querySelector(`[data-delete-item="${mine.id}"]`).click();
    await waitFor(() => !cell(childA.id).textContent.includes('補課：積木'));
    expect(confirmMessages[0]).toBe('確定要刪除趙萬竑的個別項目「補課：積木」嗎？此操作無法復原。');
    expect(cell(childB.id).textContent).toContain('補課：積木');
  });

  it('tapping a picked name again un-picks it; turning the mode off clears picks and names switch child again', async () => {
    turnOn();
    nameButton(childB.id).click();
    nameButton(childB.id).click();
    expect(nameButton(childB.id).classList.contains('child-switch__button--also')).toBe(false);
    nameButton(childB.id).click();
    turnOff();
    expect(nameButton(childB.id).classList.contains('child-switch__button--also')).toBe(false);
    expect(nameButton(childC.id).disabled).toBe(false);
    expect(container.querySelector('.tab-layout').classList.contains('tab-layout--individual')).toBe(false);
    nameButton(childB.id).click();
    expect(nameButton(childB.id).getAttribute('aria-pressed')).toBe('true');
  });

  it('locks shared items while on: their save and delete do nothing', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 5 });
    const shared = await addPlanSlotItem({ slotId: slot.id, activityName: '共用活動' });
    cell(childB.id).click(); // reopen a cell so the panel picks the new item up
    cell(childA.id).click();
    await waitFor(() => container.querySelector(`[data-panel-item="${shared.id}"]`));
    turnOn();
    expect(container.querySelector(`[data-panel-item="${shared.id}"]`).hasAttribute('data-shared-item')).toBe(true);

    container.querySelector(`[data-delete-item="${shared.id}"]`).click();
    container.querySelector(`[data-item-edit-field="activityName"][data-item-id="${shared.id}"]`).value = '改掉';
    container.querySelector(`[data-item-edit-save-for="${shared.id}"]`).click();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(confirmMessages).toEqual([]);
    expect((await allItems()).find(i => i.id === shared.id).activityName).toBe('共用活動');
  });
});

describe('monthlyPlanEditorView: shared-per-tier update reaches a second, never-clicked child', () => {
  it('adding an item via child A\'s panel shows it in child B\'s (same-tier, never-selected) cell too', async () => {
    await clearAllData();
    const container = document.createElement('div');
    const childA = await addChild({ name: '趙萬竑', birthDate: '2024-07-01' });
    const childB = await addChild({ name: '鍾晴妍', birthDate: '2024-08-01' });
    const plan = await addMonthlyCoursePlan({
      period: '115年06月',
      childIds: [childA.id, childB.id],
      childTiers: { [childA.id]: 'Ⅴ', [childB.id]: 'Ⅴ' },
    });

    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });
    container.querySelector(`.monthly-calendar__day[data-child-id="${childA.id}"][data-week-index="1"][data-weekday="3"]`).click();
    await waitFor(() => container.querySelector('[data-field="new-item-indicator"]'));

    container.querySelector('[data-field="new-item-activity-name"]').value = '大團體活動：拍手歌';
    container.querySelector('[data-action="add-item"]').dispatchEvent(new Event('submit', { cancelable: true }));

    const cellB = () =>
      container.querySelector(`.monthly-calendar__day[data-child-id="${childB.id}"][data-week-index="1"][data-weekday="3"]`);
    await waitFor(() => cellB() && cellB().textContent.includes('大團體活動：拍手歌'));

    expect(cellB().textContent).toContain('大團體活動：拍手歌');
  });
});

describe('monthlyPlanEditorView: manage children', () => {
  let container, childA, childB, plan;

  beforeEach(async () => {
    await clearAllData();
    container = document.createElement('div');
    childA = await addChild({ name: '趙萬竑', birthDate: '2024-07-01' });
    childB = await addChild({ name: '張珏銨', birthDate: '2024-12-01' }); // different tier
    plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [childA.id], childTiers: { [childA.id]: 'Ⅴ' } });
    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });
  });

  it('adding a child recomputes their tier and seeds Mon/Tue defaults for a new tier', async () => {
    container.querySelector('[data-action="manage-children"]').click();
    container.querySelector(`[data-manage-child-checkbox="${childB.id}"]`).checked = true;
    container.querySelector('[data-action="save-children"]').click();
    // Wait for the recursive re-render (the save handler's last step, after updateMonthlyCoursePlan
    // AND seedDefaultPlanSlots have both completed) rather than on the plan's childIds alone: the
    // plan update resolves before seeding even starts, so polling only childIds would let the
    // assertion below race the seed write and read an empty slot.
    await waitFor(() => container.querySelector(`.monthly-calendar[data-child-id="${childB.id}"]`));

    const updated = await getMonthlyCoursePlan(plan.id);
    expect(updated.childIds.sort()).toEqual([childA.id, childB.id].sort());
    expect(updated.childTiers[childB.id]).toBeTypeOf('string');

    const bSlot = await getOrCreatePlanSlot({ planId: plan.id, tier: updated.childTiers[childB.id], weekIndex: 1, weekday: 1 });
    expect((await listPlanSlotItems(bSlot.id)).map(i => i.activityName)).toEqual(['大團體活動']);

    expect(container.querySelector(`.monthly-calendar[data-child-id="${childB.id}"]`)).not.toBeNull();
  });

  it('removing a child clears their overrides and 個別項目 for this plan and their calendar block', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: 'x' });
    await addPlanSlotItem({ slotId: slot.id, activityName: '補課', childId: childA.id });
    await setChildItemOverride({ planId: plan.id, childId: childA.id, itemId: item.id, notAchieved: true, replaced: false });

    container.querySelector('[data-action="manage-children"]').click();
    container.querySelector(`[data-manage-child-checkbox="${childA.id}"]`).checked = false;
    container.querySelector('[data-action="save-children"]').click();
    // Wait for the recursive re-render (the save handler's last step, after
    // deleteChildItemOverridesForChild has already completed) rather than on the plan's childIds
    // alone, for the same reason as the "adding a child" test above.
    await waitFor(() => !container.querySelector(`.monthly-calendar[data-child-id="${childA.id}"]`));

    const updated = await getMonthlyCoursePlan(plan.id);
    expect(updated.childIds).toEqual([]);
    expect(await listChildItemOverridesForPlan(plan.id)).toEqual([]);
    expect((await listPlanSlotItems(slot.id)).map(i => i.activityName)).toEqual(['x']);
    expect(container.querySelector(`.monthly-calendar[data-child-id="${childA.id}"]`)).toBeNull();
  });
});

// Regression test for the staleness bug flagged in Task 13 review: refreshCellAndPanel (Task 8)
// used to redraw the calendar cell from a locally-scoped `freshData` copy without writing the
// fresh slots/items/overrides back onto the outer `data` object that the export button (Task 13)
// reads. That meant "add/edit an item, then click 匯出 Word without a full re-render" silently
// exported stale (pre-edit) data. The fix makes refreshCellAndPanel mutate `data` itself.
describe('monthlyPlanEditorView: export sees fresh data after a panel edit', () => {
  let container, child, plan;

  beforeEach(async () => {
    await clearAllData();
    generateMonthlyPlanDocxBlob.mockClear();
    // jsdom doesn't implement URL.createObjectURL/revokeObjectURL; stub them the same way
    // highlightsTabView.test.js does so the export handler's download step doesn't throw.
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() });
    container = document.createElement('div');
    child = await addChild({ name: '趙萬竑', birthDate: '2024-07-01' });
    plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [child.id], childTiers: { [child.id]: 'Ⅴ' } });
  });

  it('exporting right after adding a panel item (no intervening full re-render) includes that item', async () => {
    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });
    container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`).click();
    await waitFor(() => container.querySelector('[data-field="new-item-indicator"]'));

    container.querySelector('[data-field="new-item-activity-name"]').value = '戶外教學';
    container.querySelector('[data-action="add-item"]').dispatchEvent(new Event('submit', { cancelable: true }));
    await waitFor(() => {
      const cell = container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`);
      return cell && cell.textContent.includes('戶外教學');
    });

    // No "管理小朋友" save (the only thing that used to trigger a full renderMonthlyPlanEditorView
    // re-render) happens between the edit above and the export click below.
    container.querySelector('[data-action="export-docx"]').click();
    await waitFor(() => generateMonthlyPlanDocxBlob.mock.calls.length === 1);

    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const exportArgs = generateMonthlyPlanDocxBlob.mock.calls[0][0];
    const exportedItems = exportArgs.itemsBySlotId[slot.id] || [];
    expect(exportedItems.map(i => i.activityName)).toContain('戶外教學');
  });

  it('exporting right after toggling an override (no intervening full re-render) includes it', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: '拼拼圖' });
    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });
    container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`).click();
    await waitFor(() => container.querySelector(`[data-override-field="notAchieved"][data-item-id="${item.id}"]`));

    const notAchievedBox = container.querySelector(`[data-override-field="notAchieved"][data-item-id="${item.id}"]`);
    notAchievedBox.checked = true;
    notAchievedBox.dispatchEvent(new Event('change'));
    await waitFor(async () => (await listChildItemOverridesForPlan(plan.id)).length === 1);

    container.querySelector('[data-action="export-docx"]').click();
    await waitFor(() => generateMonthlyPlanDocxBlob.mock.calls.length === 1);

    const exportArgs = generateMonthlyPlanDocxBlob.mock.calls[0][0];
    const exportedOverride = exportArgs.overrides.find(o => o.childId === child.id && o.itemId === item.id);
    expect(exportedOverride).toMatchObject({ notAchieved: true });
  });
});
