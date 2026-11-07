import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  it('tints only the centre\'s pre-filled weekdays (育英: Mon, Tue, Fri) as preset', async () => {
    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });

    const preset = weekday => container.querySelector(
      `.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="${weekday}"]`
    ).classList.contains('monthly-calendar__day--preset');
    expect([1, 2, 3, 4, 5].map(preset)).toEqual([true, true, false, false, true]);
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
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: '原活動', childId: child.id });
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
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: '第三天', childId: child.id });
    // Day 4 has no slot yet, so its panel load (which creates one) finishes after day 3's.
    container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="4"]`).click();
    container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`).click();
    await waitFor(() => container.querySelector(`[data-delete-item="${item.id}"]`));
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(container.querySelector(`[data-delete-item="${item.id}"]`)).not.toBeNull();
  });

  it('clicking the same day twice quickly still shows its items', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 2, weekday: 3 });
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: '連點', childId: child.id });
    const cell = container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="2"][data-weekday="3"]`);
    cell.click();
    cell.click();

    await waitFor(() => container.querySelector(`[data-delete-item="${item.id}"]`));
  });

  it('deleting an item removes it from storage and the cell', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: '要刪除', childId: child.id });
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
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: '不要刪', childId: child.id });
    container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="4"]`).click();
    container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`).click();
    await waitFor(() => container.querySelector(`[data-delete-item="${item.id}"]`));
    confirmAnswer = false;

    container.querySelector(`[data-delete-item="${item.id}"]`).click();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(confirmMessages).toHaveLength(1);
    expect((await listPlanSlotItems(slot.id)).map(i => i.activityName)).toEqual(['不要刪']);
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
    item = await addPlanSlotItem({ slotId: slot.id, activityName: '拼拼圖', childId: childA.id });

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

describe('monthlyPlanEditorView: each child has their own items', () => {
  const originalShowModal = HTMLDialogElement.prototype.showModal;
  const originalClose = HTMLDialogElement.prototype.close;
  let container, childA, childB, childC, plan, confirmMessages, copyMessages, copyAnswer;
  const cell = (id, weekday = 5) => container.querySelector(`.monthly-calendar__day[data-child-id="${id}"][data-week-index="1"][data-weekday="${weekday}"]`);
  const field = name => container.querySelector(`[data-field="${name}"]`);
  const submit = () => container.querySelector('[data-action="add-item"]').dispatchEvent(new Event('submit', { cancelable: true }));
  const allItems = async (tier = 'Ⅴ', weekday = 5) => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier, weekIndex: 1, weekday });
    return listPlanSlotItems(slot.id);
  };
  const render = () => renderMonthlyPlanEditorView(container, {
    plan, onBack: vi.fn(),
    confirmDelete: m => { confirmMessages.push(m); return true; },
    confirmCopy: m => { copyMessages.push(m); return copyAnswer; },
  });

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
    copyMessages = [];
    copyAnswer = true;
    // jsdom has no <dialog> behaviour (same stubs as copyCoursePlanPanel.test.js).
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
  });
  afterEach(() => {
    HTMLDialogElement.prototype.showModal = originalShowModal;
    HTMLDialogElement.prototype.close = originalClose;
  });

  it('has no 指定新增 toggle or 個別 tag; an added item goes to the shown child only', async () => {
    await render();
    expect(container.querySelector('[data-individual-add]')).toBeNull();
    cell(childA.id).click();
    await waitFor(() => field('new-item-indicator'));
    field('new-item-activity-name').value = '補課：積木';
    submit();
    await waitFor(() => cell(childA.id).textContent.includes('補課：積木'));

    expect(cell(childA.id).textContent).not.toContain('個別');
    expect(cell(childB.id).textContent).not.toContain('補課：積木');
    const [own] = (await allItems()).filter(i => i.activityName === '補課：積木');
    expect(own.childId).toBe(childA.id);
  });

  it('deleting asks about this child only', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 5 });
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: '積木', childId: childA.id });
    await addPlanSlotItem({ slotId: slot.id, activityName: '積木', childId: childB.id });
    await render();
    cell(childA.id).click();
    await waitFor(() => container.querySelector(`[data-delete-item="${item.id}"]`));
    container.querySelector(`[data-delete-item="${item.id}"]`).click();
    await waitFor(() => !cell(childA.id).textContent.includes('積木'));

    expect(confirmMessages).toEqual(['確定要刪除趙萬竑的「積木」嗎？此操作無法復原。']);
    expect(cell(childB.id).textContent).toContain('積木');
  });

  it('opening a plan with old shared items gives each same-tier child their own copy', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 5 });
    await addPlanSlotItem({ slotId: slot.id, activityName: '舊共用' });
    await render();

    const items = await allItems();
    expect(items.map(i => i.childId).sort()).toEqual([childA.id, childB.id].sort());
    expect(cell(childA.id).textContent).toContain('舊共用');
    expect(cell(childB.id).textContent).toContain('舊共用');
  });

  it('套用 lists other children with items, confirms with counts, and replaces the shown child\'s month', async () => {
    const vSlot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 5 });
    await addPlanSlotItem({ slotId: vSlot.id, activityName: '畫畫', childId: childA.id });
    await addPlanSlotItem({ slotId: vSlot.id, activityName: '唱歌', childId: childA.id });
    const ivSlot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅳ', weekIndex: 1, weekday: 3 });
    await addPlanSlotItem({ slotId: ivSlot.id, activityName: '舊的', childId: childC.id });
    await render();
    container.querySelector(`[data-switch-child="${childC.id}"]`).click();

    expect(container.querySelector('[data-action="copy-monthly-plan"]').textContent).toContain('套用');
    const labels = [...container.querySelectorAll('[data-copy-plan-form] label')].map(l => l.textContent.trim());
    expect(labels).toEqual(['趙萬竑（2 筆）']);

    container.querySelector(`input[name="copy-plan-source"][value="${childA.id}"]`).checked = true;
    container.querySelector('[data-copy-plan-form]').dispatchEvent(new Event('submit', { cancelable: true }));
    await waitFor(() => cell(childC.id) && cell(childC.id).textContent.includes('畫畫'));

    expect(copyMessages).toEqual(['林小美目前的 1 筆會換成趙萬竑的 2 筆，未達成、請假的勾選不會複製。\n確定要套用嗎？']);
    expect((await allItems('Ⅳ', 5)).map(i => [i.activityName, i.childId])).toEqual([['畫畫', childC.id], ['唱歌', childC.id]]);
    expect(await allItems('Ⅳ', 3)).toEqual([]);
    expect(container.querySelector(`[data-switch-child="${childC.id}"]`).getAttribute('aria-pressed')).toBe('true');
  });

  it('套用 says so when no other child has anything yet, and asks a shorter question for an empty month', async () => {
    await render();
    expect(container.querySelector('[data-copy-plan-form]').textContent).toContain('這份月計畫裡沒有其他已排課的幼兒。');

    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 5 });
    await addPlanSlotItem({ slotId: slot.id, activityName: '畫畫', childId: childB.id });
    copyAnswer = false;
    await render();
    container.querySelector(`[data-switch-child="${childA.id}"]`).click();
    container.querySelector(`input[name="copy-plan-source"][value="${childB.id}"]`).checked = true;
    container.querySelector('[data-copy-plan-form]').dispatchEvent(new Event('submit', { cancelable: true }));
    await waitFor(() => copyMessages.length === 1);

    expect(copyMessages[0]).toBe('要把鍾晴妍的 1 筆套用給趙萬竑嗎？');
    expect((await allItems()).map(i => i.childId)).toEqual([childB.id]);
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

  it('removing a child clears their overrides and items for this plan and their calendar block', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: 'x', childId: childA.id });
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
    expect((await listPlanSlotItems(slot.id)).map(i => i.activityName)).toEqual([]);
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
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: '拼拼圖', childId: child.id });
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

describe('monthlyPlanEditorView: 指標達成狀況', () => {
  it('marks each option by the selected child\'s records and lists same-tier classmates once one is picked', async () => {
    await clearAllData();
    const { addForm, addEntry } = await import('../src/storage/db.js');
    const container = document.createElement('div');
    const a = await addChild({ name: '甲', birthDate: '2024-07-01' });
    const b = await addChild({ name: '乙', birthDate: '2024-07-01' });
    const c = await addChild({ name: '丙', birthDate: '2023-01-01' });
    const formA = await addForm({ childId: a.id, tier: 'Ⅴ', period: '115年05月' });
    await addEntry({ formId: formA.id, indicatorCode: 'Ⅴ-1-1', date: '2026-05-01', status: 'developed', note: '' });
    const formB = await addForm({ childId: b.id, tier: 'Ⅴ', period: '115年05月' });
    await addEntry({ formId: formB.id, indicatorCode: 'Ⅴ-1-1', date: '2026-05-01', status: 'developing', note: '' });
    const formC = await addForm({ childId: c.id, tier: 'Ⅴ', period: '115年05月' });
    await addEntry({ formId: formC.id, indicatorCode: 'Ⅴ-1-1', date: '2026-05-01', status: 'developed', note: '' });
    const plan = await addMonthlyCoursePlan({
      period: '115年06月', childIds: [a.id, b.id, c.id], childTiers: { [a.id]: 'Ⅴ', [b.id]: 'Ⅴ', [c.id]: 'Ⅵ' },
    });

    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });
    container.querySelector(`.monthly-calendar__day[data-child-id="${a.id}"][data-week-index="1"][data-weekday="3"]`).click();
    await waitFor(() => container.querySelector('[data-field="new-item-indicator"]'));
    const select = container.querySelector('[data-field="new-item-indicator"]');

    const row = code => container.querySelector(`[data-pick-indicator="${code}"]`);
    expect(row('Ⅴ-1-1').querySelector('.progress-dot--achieved')).not.toBeNull();
    expect(row('Ⅴ-1-2').querySelector('.progress-dot--none')).not.toBeNull();
    expect(container.querySelector('[data-indicator-legend]').textContent).toContain('未達成');

    const roster = container.querySelector('[data-indicator-roster]');
    select.value = 'Ⅴ-1-1';
    select.dispatchEvent(new Event('change'));
    expect(roster.textContent).toContain('已達成甲');
    expect(roster.textContent).toContain('未達成乙');
    expect(roster.textContent).not.toContain('丙'); // different tier
    expect(roster.textContent).not.toContain('還沒做過');

    select.value = '';
    select.dispatchEvent(new Event('change'));
    expect(roster.textContent).toBe('');

    // Picking from the drawn list sets the hidden <select> and fills the form like before.
    const toggle = container.querySelector('[data-indicator-picker-toggle]');
    toggle.click();
    expect(container.querySelector('[data-indicator-picker-list]').hidden).toBe(false);
    row('Ⅴ-1-1').click();
    expect(select.value).toBe('Ⅴ-1-1');
    expect(container.querySelector('[data-indicator-picker-list]').hidden).toBe(true);
    expect(container.querySelector('[data-field="new-item-indicator-text"]').value).not.toBe('');
    expect(roster.textContent).toContain('已達成甲');
  });

  it('新增後再打開指標清單，從上次選的指標那一段開始顯示，不是從最上面', async () => {
    await clearAllData();
    const container = document.createElement('div');
    const a = await addChild({ name: '甲', birthDate: '2024-07-01' });
    const plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [a.id], childTiers: { [a.id]: 'Ⅴ' } });
    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });
    container.querySelector(`.monthly-calendar__day[data-child-id="${a.id}"][data-week-index="1"][data-weekday="3"]`).click();
    await waitFor(() => container.querySelector('[data-indicator-picker-toggle]'));

    container.querySelector('[data-indicator-picker-toggle]').click();
    container.querySelector('[data-pick-indicator="Ⅴ-3-2"]').click();
    container.querySelector('[data-action="add-item"]').dispatchEvent(new Event('submit', { cancelable: true }));
    // The panel redraws after 新增 with nothing picked.
    await waitFor(() => container.querySelector('[data-field="new-item-indicator"]')?.value === '' && container.querySelectorAll('[data-edit-item]').length === 1);

    // jsdom has no layout: give the remembered row a position and catch where the list scrolls to.
    const list = container.querySelector('[data-indicator-picker-list]');
    Object.defineProperty(container.querySelector('[data-pick-indicator="Ⅴ-3-2"]'), 'offsetTop', { value: 600 });
    let scrolledTo = null;
    Object.defineProperty(list, 'scrollTop', { get: () => scrolledTo ?? 0, set: value => { scrolledTo = value; } });
    container.querySelector('[data-indicator-picker-toggle]').click();
    expect(scrolledTo).toBeGreaterThan(0);
  });
});

describe('monthlyPlanEditorView: child order', () => {
  let container, childA, childB, childC;

  const q = selector => container.querySelector(selector);
  const savedOrder = async planId => (await getMonthlyCoursePlan(planId)).childIds;
  const switchOrder = () => [...container.querySelectorAll('[data-switch-child]')].map(b => Number(b.dataset.switchChild));

  async function open(childIds) {
    const childTiers = Object.fromEntries(childIds.map(id => [id, 'Ⅴ']));
    const plan = await addMonthlyCoursePlan({ period: '115年06月', childIds, childTiers });
    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });
    q('[data-action="manage-children"]').click();
    return plan;
  }

  async function saveAndWait(plan, expected) {
    q('[data-action="save-children"]').click();
    await waitFor(async () => JSON.stringify(await savedOrder(plan.id)) === JSON.stringify(expected) && switchOrder().length === expected.length);
  }

  beforeEach(async () => {
    await clearAllData();
    container = document.createElement('div');
    childA = await addChild({ name: '甲', birthDate: '2024-07-01' });
    childB = await addChild({ name: '乙', birthDate: '2024-07-02' });
    childC = await addChild({ name: '丙', birthDate: '2024-07-03' });
  });

  it('saves the tapped order, untapped children after them', async () => {
    const plan = await open([childA.id, childB.id, childC.id]);
    q('[data-action="sort-children"]').click();
    q(`[data-sort-child="${childC.id}"]`).click();
    q(`[data-sort-child="${childA.id}"]`).click();
    q('[data-action="sort-done"]').click();
    await saveAndWait(plan, [childC.id, childA.id, childB.id]);

    expect(await savedOrder(plan.id)).toEqual([childC.id, childA.id, childB.id]);
    expect(switchOrder()).toEqual([childC.id, childA.id, childB.id]);
  });

  it('tapping a numbered child again removes its number and moves later numbers up', async () => {
    await open([childA.id, childB.id, childC.id]);
    q('[data-action="sort-children"]').click();
    q(`[data-sort-child="${childA.id}"]`).click();
    q(`[data-sort-child="${childB.id}"]`).click();
    q(`[data-sort-child="${childA.id}"]`).click();

    expect(q(`[data-sort-child="${childB.id}"] [data-sort-number]`).textContent).toBe('①');
    expect(q(`[data-sort-child="${childA.id}"] [data-sort-number]`).textContent).toBe('');
  });

  it('keeps the saved order when only a new child is checked', async () => {
    const plan = await open([childB.id, childA.id]);
    q(`[data-manage-child-checkbox="${childC.id}"]`).checked = true;
    await saveAndWait(plan, [childB.id, childA.id, childC.id]);

    expect(await savedOrder(plan.id)).toEqual([childB.id, childA.id, childC.id]);
  });

  it('cancelling the sort, or the whole popup, leaves the order alone', async () => {
    const plan = await open([childA.id, childB.id, childC.id]);
    q('[data-action="sort-children"]').click();
    q(`[data-sort-child="${childC.id}"]`).click();
    q('[data-action="sort-cancel"]').click();
    expect(q('[data-sort-children]').hidden).toBe(true);

    q('[data-action="sort-children"]').click();
    q(`[data-sort-child="${childC.id}"]`).click();
    q('[data-action="sort-done"]').click();
    q('[data-action="cancel-manage-children"]').click();

    q('[data-action="manage-children"]').click();
    q(`[data-manage-child-checkbox="${childB.id}"]`).checked = false;
    await saveAndWait(plan, [childA.id, childC.id]);
    expect(await savedOrder(plan.id)).toEqual([childA.id, childC.id]);
  });

  it('lists only checked children, with no checkboxes, in the sort view', async () => {
    await open([childA.id, childB.id]);
    q('[data-action="sort-children"]').click();

    expect(q('[data-sort-children] input[type=checkbox]')).toBeNull();
    expect([...container.querySelectorAll('[data-sort-child]')].map(b => Number(b.dataset.sortChild))).toEqual([childA.id, childB.id]);
  });
});
