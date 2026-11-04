import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import {
  addMonthlyCoursePlan, getOrCreatePlanSlot, addPlanSlotItem, listPlanSlotsForPlan, listPlanSlotItems,
  setChildItemOverride, listChildItemOverridesForPlan,
} from '../src/storage/monthlyPlanDb.js';
import { childItemCounts, copyMonthlyPlan } from '../src/domain/copyMonthlyPlan.js';

async function itemsOf(planId, childId) {
  const result = [];
  for (const slot of await listPlanSlotsForPlan(planId)) {
    for (const item of await listPlanSlotItems(slot.id)) {
      if (item.childId === childId) result.push({ ...item, slot });
    }
  }
  return result;
}

describe('copyMonthlyPlan', () => {
  let plan, a, b;
  beforeEach(async () => {
    await clearAllData();
    a = await addChild({ name: '甲', birthDate: '2024-07-01' });
    b = await addChild({ name: '乙', birthDate: '2025-01-01' });
    plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [a.id, b.id], childTiers: { [a.id]: 'Ⅴ', [b.id]: 'Ⅳ' } });
  });

  it('replaces the target child\'s whole month with a copy of the source\'s, into the target\'s own tier, without marks', async () => {
    const aSlot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 2, weekday: 4 });
    const source = await addPlanSlotItem({ slotId: aSlot.id, indicatorCode: 'Ⅴ-1-1', activityName: '畫畫', indicatorText: '說明', childId: a.id });
    await setChildItemOverride({ planId: plan.id, childId: a.id, itemId: source.id, notAchieved: true, replaced: false });
    const bSlot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅳ', weekIndex: 1, weekday: 1 });
    const old = await addPlanSlotItem({ slotId: bSlot.id, activityName: '舊的', childId: b.id });
    await setChildItemOverride({ planId: plan.id, childId: b.id, itemId: old.id, notAchieved: false, replaced: true });

    const slots = await listPlanSlotsForPlan(plan.id);
    const itemsBySlotId = Object.fromEntries(await Promise.all(slots.map(async s => [s.id, await listPlanSlotItems(s.id)])));
    expect(childItemCounts(plan, slots, itemsBySlotId)).toEqual(new Map([[a.id, 1], [b.id, 1]]));
    await copyMonthlyPlan({ plan, targetChildId: b.id, sourceChildId: a.id });

    const copied = await itemsOf(plan.id, b.id);
    expect(copied.map(i => [i.slot.tier, i.slot.weekIndex, i.slot.weekday, i.indicatorCode, i.activityName, i.indicatorText]))
      .toEqual([['Ⅳ', 2, 4, 'Ⅴ-1-1', '畫畫', '說明']]);
    expect((await itemsOf(plan.id, a.id)).map(i => i.id)).toEqual([source.id]);
    const overrides = await listChildItemOverridesForPlan(plan.id);
    expect(overrides.map(o => [o.childId, o.itemId])).toEqual([[a.id, source.id]]);
  });

  it('does nothing when source and target are the same child', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 1 });
    await addPlanSlotItem({ slotId: slot.id, activityName: '畫畫', childId: a.id });
    await copyMonthlyPlan({ plan, targetChildId: a.id, sourceChildId: a.id });
    expect(await itemsOf(plan.id, a.id)).toHaveLength(1);
  });
});

async function allItems(planId) {
  const result = [];
  for (const slot of await listPlanSlotsForPlan(planId)) result.push(...await listPlanSlotItems(slot.id));
  return result;
}

describe('childItemCounts', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('leaves out untouched preset activities (大團體活動／節氣 on their own days), but counts an edited one', async () => {
    const plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [1], childTiers: { 1: 'Ⅴ' } });
    const monday = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 1 });
    const tuesday = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 2 });
    const wednesday = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    await addPlanSlotItem({ slotId: monday.id, activityName: '大團體活動', childId: 1 });
    await addPlanSlotItem({ slotId: tuesday.id, activityName: '節氣', childId: 1 });
    await addPlanSlotItem({ slotId: tuesday.id, activityName: '戶外教學', childId: 1 });
    await addPlanSlotItem({ slotId: wednesday.id, activityName: '大團體活動', childId: 1 }); // not a preset day
    await addPlanSlotItem({ slotId: monday.id, indicatorCode: 'Ⅴ-1-1', activityName: '大團體活動', childId: 1 });

    const slots = await listPlanSlotsForPlan(plan.id);
    const itemsBySlotId = Object.fromEntries(await Promise.all(slots.map(async s => [s.id, await listPlanSlotItems(s.id)])));
    expect(childItemCounts(plan, slots, itemsBySlotId)).toEqual(new Map([[1, 3]]));
  });
});
