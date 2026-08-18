import { runRequest } from './dbCore.js';

// Serializes concurrent async calls that share the same key, so each call's read only ever starts
// after the previous call's write for that key has fully committed. Needed anywhere the UI can
// fire two calls for the same logical row with no coordination between them (one call per
// checkbox/text-field `change` event, or two cells clicked in quick succession) — an unguarded
// read-then-write (find existing row, then add/put/delete) would otherwise let both calls read
// "no existing row" before either write lands, producing duplicate rows instead of one upsert.
// Used by setChildItemOverride and getOrCreatePlanSlot below.
const writeQueues = new Map();

function serializeByKey(key, fn) {
  const previous = writeQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(fn);
  writeQueues.set(key, next);
  return next;
}

export async function addMonthlyCoursePlan({ period, childIds, childTiers, isNew = false }) {
  const createdAt = new Date().toISOString();
  const id = await runRequest('monthlyCoursePlans', 'readwrite', store => store.add({ period, childIds, childTiers, createdAt, isNew }));
  return { id, period, childIds, childTiers, createdAt, isNew };
}

export async function listMonthlyCoursePlans() {
  return runRequest('monthlyCoursePlans', 'readonly', store => store.getAll());
}

export async function getMonthlyCoursePlan(id) {
  return runRequest('monthlyCoursePlans', 'readonly', store => store.get(id));
}

export async function updateMonthlyCoursePlan(id, changes) {
  const existing = await runRequest('monthlyCoursePlans', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`MonthlyCoursePlan ${id} not found`);
  const updated = { ...existing, ...changes, id };
  await runRequest('monthlyCoursePlans', 'readwrite', store => store.put(updated));
  return updated;
}

// Cascades: deleting a plan also deletes every PlanSlot (+ its PlanSlotItems, + any
// ChildItemOverrides those items carry) and any ChildItemOverride left over.
export async function deleteMonthlyCoursePlan(id) {
  const slots = await listPlanSlotsForPlan(id);
  for (const slot of slots) {
    await deletePlanSlot(slot.id);
  }
  const overrides = await listChildItemOverridesForPlan(id);
  for (const override of overrides) {
    await runRequest('childItemOverrides', 'readwrite', store => store.delete(override.id));
  }
  await runRequest('monthlyCoursePlans', 'readwrite', store => store.delete(id));
}

export async function listPlanSlotsForPlan(planId) {
  return runRequest('planSlots', 'readonly', store => store.index('by_planId').getAll(planId));
}

// getOrCreatePlanSlot does the same unguarded read-then-write (find existing row, then add) as
// setChildItemOverride below. The UI can fire two calls for the same (planId, tier, weekIndex,
// weekday) in quick succession (e.g. selecting two different same-tier children's cells for the
// same week/weekday before the first call resolves), and both would see "no existing slot" and
// both `add()`, producing duplicate slot rows for one key — see serializeByKey.
export async function getOrCreatePlanSlot({ planId, tier, weekIndex, weekday }) {
  const key = `slot:${planId}:${tier}:${weekIndex}:${weekday}`;
  return serializeByKey(key, () => writeOrCreatePlanSlot({ planId, tier, weekIndex, weekday }));
}

async function writeOrCreatePlanSlot({ planId, tier, weekIndex, weekday }) {
  const slots = await listPlanSlotsForPlan(planId);
  const existing = slots.find(s => s.tier === tier && s.weekIndex === weekIndex && s.weekday === weekday);
  if (existing) return existing;
  const id = await runRequest('planSlots', 'readwrite', store => store.add({ planId, tier, weekIndex, weekday }));
  return { id, planId, tier, weekIndex, weekday };
}

// Cascades: deleting a slot also deletes every PlanSlotItem under it (and, via deletePlanSlotItem,
// every ChildItemOverride referencing one of those items).
export async function deletePlanSlot(id) {
  const items = await listPlanSlotItems(id);
  for (const item of items) {
    await deletePlanSlotItem(item.id);
  }
  await runRequest('planSlots', 'readwrite', store => store.delete(id));
}

export async function listPlanSlotItems(slotId) {
  return runRequest('planSlotItems', 'readonly', store => store.index('by_slotId').getAll(slotId));
}

export async function addPlanSlotItem({ slotId, indicatorCode = null, activityName, indicatorText = '' }) {
  const id = await runRequest('planSlotItems', 'readwrite', store => store.add({ slotId, indicatorCode, activityName, indicatorText }));
  return { id, slotId, indicatorCode, activityName, indicatorText };
}

export async function updatePlanSlotItem(id, changes) {
  const existing = await runRequest('planSlotItems', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`PlanSlotItem ${id} not found`);
  const updated = { ...existing, ...changes, id };
  await runRequest('planSlotItems', 'readwrite', store => store.put(updated));
  return updated;
}

// Cascades: deleting an item also deletes every ChildItemOverride referencing it. Overrides are
// only indexed by planId, so this looks up the item's plan (via its slot) to scope the scan.
export async function deletePlanSlotItem(id) {
  const item = await runRequest('planSlotItems', 'readonly', store => store.get(id));
  if (item) {
    const slot = await runRequest('planSlots', 'readonly', store => store.get(item.slotId));
    if (slot) {
      const overrides = await listChildItemOverridesForPlan(slot.planId);
      for (const override of overrides) {
        if (override.itemId === id) {
          await runRequest('childItemOverrides', 'readwrite', store => store.delete(override.id));
        }
      }
    }
  }
  await runRequest('planSlotItems', 'readwrite', store => store.delete(id));
}

export async function listChildItemOverridesForPlan(planId) {
  return runRequest('childItemOverrides', 'readonly', store => store.index('by_planId').getAll(planId));
}

// Upserts a child's mark on one item. Once both flags are false there is nothing left to
// remember, so the row is deleted instead of kept around as a no-op default — every other
// consumer can then treat "no matching row" as the single source of truth for "no override".
export async function setChildItemOverride({ planId, childId, itemId, notAchieved, replaced, replacementText = '' }) {
  const key = `override:${planId}:${childId}:${itemId}`;
  return serializeByKey(key, () =>
    writeChildItemOverride({ planId, childId, itemId, notAchieved, replaced, replacementText })
  );
}

async function writeChildItemOverride({ planId, childId, itemId, notAchieved, replaced, replacementText }) {
  const existing = (await listChildItemOverridesForPlan(planId)).find(o => o.childId === childId && o.itemId === itemId);

  if (!notAchieved && !replaced) {
    if (existing) await runRequest('childItemOverrides', 'readwrite', store => store.delete(existing.id));
    return null;
  }

  if (existing) {
    const updated = { ...existing, notAchieved, replaced, replacementText };
    await runRequest('childItemOverrides', 'readwrite', store => store.put(updated));
    return updated;
  }

  const id = await runRequest('childItemOverrides', 'readwrite', store =>
    store.add({ planId, childId, itemId, notAchieved, replaced, replacementText })
  );
  return { id, planId, childId, itemId, notAchieved, replaced, replacementText };
}

export async function deleteChildItemOverridesForChild(planId, childId) {
  const overrides = await listChildItemOverridesForPlan(planId);
  for (const override of overrides) {
    if (override.childId === childId) {
      await runRequest('childItemOverrides', 'readwrite', store => store.delete(override.id));
    }
  }
}
