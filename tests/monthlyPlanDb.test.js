import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllData } from '../src/storage/db.js';
import {
  addMonthlyCoursePlan, listMonthlyCoursePlans, getMonthlyCoursePlan, updateMonthlyCoursePlan, deleteMonthlyCoursePlan,
  listPlanSlotsForPlan, getOrCreatePlanSlot, deletePlanSlot,
  listPlanSlotItems, addPlanSlotItem, updatePlanSlotItem, deletePlanSlotItem,
  listChildItemOverridesForPlan, setChildItemOverride, deleteChildItemOverridesForChild,
} from '../src/storage/monthlyPlanDb.js';

describe('monthlyPlanDb: MonthlyCoursePlan', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('adds a plan and lists it back', async () => {
    const plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [1, 2], childTiers: { 1: 'Ⅳ', 2: 'Ⅴ' } });
    expect(plan.id).toBeTypeOf('number');
    expect(plan.createdAt).toBeTypeOf('string');
    expect(await listMonthlyCoursePlans()).toEqual([plan]);
  });

  it('gets a plan by id', async () => {
    const plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [1], childTiers: { 1: 'Ⅴ' } });
    expect(await getMonthlyCoursePlan(plan.id)).toEqual(plan);
  });

  it('updates a plan (e.g. adding a child)', async () => {
    const plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [1], childTiers: { 1: 'Ⅴ' } });
    const updated = await updateMonthlyCoursePlan(plan.id, { childIds: [1, 2], childTiers: { 1: 'Ⅴ', 2: 'Ⅳ' } });
    expect(updated.childIds).toEqual([1, 2]);
    expect(await getMonthlyCoursePlan(plan.id)).toEqual(updated);
  });

  it('deleting a plan cascades to its slots, items, and overrides', async () => {
    const plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [1], childTiers: { 1: 'Ⅴ' } });
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 1 });
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: '大團體活動' });
    await setChildItemOverride({ planId: plan.id, childId: 1, itemId: item.id, notAchieved: true, replaced: false });

    await deleteMonthlyCoursePlan(plan.id);

    expect(await getMonthlyCoursePlan(plan.id)).toBeUndefined();
    expect(await listPlanSlotsForPlan(plan.id)).toEqual([]);
    expect(await listPlanSlotItems(slot.id)).toEqual([]);
    expect(await listChildItemOverridesForPlan(plan.id)).toEqual([]);
  });
});

describe('monthlyPlanDb: PlanSlot / PlanSlotItem', () => {
  let plan;

  beforeEach(async () => {
    await clearAllData();
    plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [1], childTiers: { 1: 'Ⅴ' } });
  });

  it('getOrCreatePlanSlot creates once, then returns the same slot on repeat calls', async () => {
    const first = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const second = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    expect(second).toEqual(first);
    expect(await listPlanSlotsForPlan(plan.id)).toHaveLength(1);
  });

  it('different (tier, weekIndex, weekday) combos are different slots', async () => {
    await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 4 });
    await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅳ', weekIndex: 1, weekday: 3 });
    expect(await listPlanSlotsForPlan(plan.id)).toHaveLength(3);
  });

  it('adds, updates, and deletes a slot item', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const item = await addPlanSlotItem({ slotId: slot.id, indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲', indicatorText: '能依形狀或顏色分類' });
    expect(await listPlanSlotItems(slot.id)).toEqual([item]);

    const updated = await updatePlanSlotItem(item.id, { activityName: '分類遊戲(改)' });
    expect(updated.activityName).toBe('分類遊戲(改)');

    await deletePlanSlotItem(item.id);
    expect(await listPlanSlotItems(slot.id)).toEqual([]);
  });

  it('deleting a slot cascades to its items', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    await addPlanSlotItem({ slotId: slot.id, activityName: 'x' });
    await deletePlanSlot(slot.id);
    expect(await listPlanSlotItems(slot.id)).toEqual([]);
    expect(await listPlanSlotsForPlan(plan.id)).toEqual([]);
  });

  it('deleting an item cascades to overrides referencing it, leaving other overrides alone', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const itemA = await addPlanSlotItem({ slotId: slot.id, activityName: 'a' });
    const itemB = await addPlanSlotItem({ slotId: slot.id, activityName: 'b' });
    await setChildItemOverride({ planId: plan.id, childId: 1, itemId: itemA.id, notAchieved: true, replaced: false });
    await setChildItemOverride({ planId: plan.id, childId: 1, itemId: itemB.id, notAchieved: true, replaced: false });

    await deletePlanSlotItem(itemA.id);

    const remaining = await listChildItemOverridesForPlan(plan.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].itemId).toBe(itemB.id);
  });
});

describe('monthlyPlanDb: ChildItemOverride', () => {
  let plan, item;

  beforeEach(async () => {
    await clearAllData();
    plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [1], childTiers: { 1: 'Ⅴ' } });
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    item = await addPlanSlotItem({ slotId: slot.id, activityName: 'x' });
  });

  it('creates an override when a flag is set', async () => {
    const override = await setChildItemOverride({ planId: plan.id, childId: 1, itemId: item.id, notAchieved: true, replaced: false });
    expect(override.notAchieved).toBe(true);
    expect(await listChildItemOverridesForPlan(plan.id)).toEqual([override]);
  });

  it('updates the same row on a second call instead of creating a duplicate', async () => {
    await setChildItemOverride({ planId: plan.id, childId: 1, itemId: item.id, notAchieved: true, replaced: false });
    const second = await setChildItemOverride({
      planId: plan.id, childId: 1, itemId: item.id, notAchieved: true, replaced: true, replacementText: '請假',
    });
    const all = await listChildItemOverridesForPlan(plan.id);
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(second);
    expect(second.replacementText).toBe('請假');
  });

  it('two concurrent calls for the same key serialize into a single row instead of racing into duplicates', async () => {
    // Neither call is awaited before the other starts — this mirrors two `change` events firing
    // back-to-back in the UI (e.g. a double-click toggling a checkbox) before the first call's
    // read-modify-write has had a chance to complete. Semantics: calls serialize in the order
    // they were made, so the second call's values win and exactly one row survives.
    const [, second] = await Promise.all([
      setChildItemOverride({ planId: plan.id, childId: 1, itemId: item.id, notAchieved: true, replaced: false }),
      setChildItemOverride({
        planId: plan.id, childId: 1, itemId: item.id, notAchieved: false, replaced: true, replacementText: '請假',
      }),
    ]);

    const all = await listChildItemOverridesForPlan(plan.id);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ notAchieved: false, replaced: true, replacementText: '請假' });
    expect(second).toMatchObject({ notAchieved: false, replaced: true, replacementText: '請假' });
  });

  it('deletes the row once both flags are cleared', async () => {
    await setChildItemOverride({ planId: plan.id, childId: 1, itemId: item.id, notAchieved: true, replaced: false });
    const result = await setChildItemOverride({ planId: plan.id, childId: 1, itemId: item.id, notAchieved: false, replaced: false });
    expect(result).toBeNull();
    expect(await listChildItemOverridesForPlan(plan.id)).toEqual([]);
  });

  it('deleteChildItemOverridesForChild removes only that child\'s rows', async () => {
    await setChildItemOverride({ planId: plan.id, childId: 1, itemId: item.id, notAchieved: true, replaced: false });
    await setChildItemOverride({ planId: plan.id, childId: 2, itemId: item.id, notAchieved: true, replaced: false });

    await deleteChildItemOverridesForChild(plan.id, 1);

    const remaining = await listChildItemOverridesForPlan(plan.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].childId).toBe(2);
  });
});
