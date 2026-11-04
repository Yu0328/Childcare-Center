import {
  listPlanSlotsForPlan, listPlanSlotItems, getOrCreatePlanSlot, addPlanSlotItem, deletePlanSlotItem,
} from '../storage/monthlyPlanDb.js';
import { isPresetItem } from './monthlyCoursePlan.js';

// How many items each of the plan's children has planned (the 套用 picker's 「林小美（12 筆）」 and
// its confirm). Untouched 大團體活動／節氣 presets don't count — every child starts with them, so
// they say nothing about what's been planned. They're still copied by 套用.
export function childItemCounts(plan, slots, itemsBySlotId) {
  const counts = new Map(plan.childIds.map(id => [id, 0]));
  for (const slot of slots) {
    for (const item of itemsBySlotId[slot.id] || []) {
      if (counts.has(item.childId) && !isPresetItem(item, slot)) counts.set(item.childId, counts.get(item.childId) + 1);
    }
  }
  return counts;
}

async function itemsWithSlotsOf(planId, childId) {
  const result = [];
  for (const slot of await listPlanSlotsForPlan(planId)) {
    for (const item of await listPlanSlotItems(slot.id)) {
      if (item.childId === childId) result.push({ item, slot });
    }
  }
  return result;
}

// 套用其他幼兒月計畫: the target child's whole month becomes a copy of the source child's, filed
// under the target's own tier (any two children may copy, whatever their tiers — an item keeps its
// own indicator code). 未達成／請假 describe the source child, so they're not copied. Copies first
// and deletes last, so an interruption leaves duplicates to tidy up rather than lost items.
export async function copyMonthlyPlan({ plan, targetChildId, sourceChildId }) {
  if (targetChildId === sourceChildId) return;
  const oldItems = await itemsWithSlotsOf(plan.id, targetChildId);
  const tier = plan.childTiers[targetChildId];
  for (const { item, slot } of await itemsWithSlotsOf(plan.id, sourceChildId)) {
    const targetSlot = await getOrCreatePlanSlot({ planId: plan.id, tier, weekIndex: slot.weekIndex, weekday: slot.weekday });
    await addPlanSlotItem({
      slotId: targetSlot.id, indicatorCode: item.indicatorCode, activityName: item.activityName,
      indicatorText: item.indicatorText, childId: targetChildId,
    });
  }
  for (const { item } of oldItems) await deletePlanSlotItem(item.id);
}
