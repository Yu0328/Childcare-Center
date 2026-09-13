import { runRequest, addRecord, putRecord, deleteRecord } from './dbCore.js';

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

export async function addMonthlyCoursePlan({ period, childIds, childTiers, isNew = false, uid, updatedAt }) {
  const createdAt = new Date().toISOString();
  return addRecord('monthlyCoursePlans', { period, childIds, childTiers, createdAt, isNew, uid, updatedAt });
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
  return putRecord('monthlyCoursePlans', { ...existing, ...changes, id });
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
    await deleteRecord('childItemOverrides', override.id);
  }
  await deleteRecord('monthlyCoursePlans', id);
}

export async function listPlanSlotsForPlan(planId) {
  return runRequest('planSlots', 'readonly', store => store.index('by_planId').getAll(planId));
}

// getOrCreatePlanSlot does the same unguarded read-then-write (find existing row, then add) as
// setChildItemOverride below. The UI can fire two calls for the same (planId, tier, weekIndex,
// weekday) in quick succession (e.g. selecting two different same-tier children's cells for the
// same week/weekday before the first call resolves), and both would see "no existing slot" and
// both `add()`, producing duplicate slot rows for one key — see serializeByKey.
export async function getOrCreatePlanSlot({ planId, tier, weekIndex, weekday, uid, updatedAt }) {
  const key = `slot:${planId}:${tier}:${weekIndex}:${weekday}`;
  return serializeByKey(key, () => writeOrCreatePlanSlot({ planId, tier, weekIndex, weekday, uid, updatedAt }));
}

async function writeOrCreatePlanSlot({ planId, tier, weekIndex, weekday, uid, updatedAt }) {
  const slots = await listPlanSlotsForPlan(planId);
  const existing = slots.find(s => s.tier === tier && s.weekIndex === weekIndex && s.weekday === weekday);
  if (existing) return existing;
  return addRecord('planSlots', { planId, tier, weekIndex, weekday, uid, updatedAt });
}

// Cascades: deleting a slot also deletes every PlanSlotItem under it (and, via deletePlanSlotItem,
// every ChildItemOverride referencing one of those items).
export async function deletePlanSlot(id) {
  const items = await listPlanSlotItems(id);
  for (const item of items) {
    await deletePlanSlotItem(item.id);
  }
  await deleteRecord('planSlots', id);
}

export async function listPlanSlotItems(slotId) {
  return runRequest('planSlotItems', 'readonly', store => store.index('by_slotId').getAll(slotId));
}

export async function addPlanSlotItem({ slotId, indicatorCode = null, activityName, indicatorText = '', uid, updatedAt }) {
  return addRecord('planSlotItems', { slotId, indicatorCode, activityName, indicatorText, uid, updatedAt });
}

export async function updatePlanSlotItem(id, changes) {
  const existing = await runRequest('planSlotItems', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`PlanSlotItem ${id} not found`);
  return putRecord('planSlotItems', { ...existing, ...changes, id });
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
          await deleteRecord('childItemOverrides', override.id);
        }
      }
    }
  }
  await deleteRecord('planSlotItems', id);
}

export async function listChildItemOverridesForPlan(planId) {
  return runRequest('childItemOverrides', 'readonly', store => store.index('by_planId').getAll(planId));
}

// Upserts a child's mark on one item. Once both flags are false there is nothing left to
// remember, so the row is deleted instead of kept around as a no-op default — every other
// consumer can then treat "no matching row" as the single source of truth for "no override".
export async function setChildItemOverride({ planId, childId, itemId, notAchieved, replaced, replacementText = '', uid, updatedAt }) {
  const key = `override:${planId}:${childId}:${itemId}`;
  return serializeByKey(key, () =>
    writeChildItemOverride({ planId, childId, itemId, notAchieved, replaced, replacementText, uid, updatedAt })
  );
}

async function writeChildItemOverride({ planId, childId, itemId, notAchieved, replaced, replacementText, uid, updatedAt }) {
  const existing = (await listChildItemOverridesForPlan(planId)).find(o => o.childId === childId && o.itemId === itemId);

  if (!notAchieved && !replaced) {
    if (existing) await deleteRecord('childItemOverrides', existing.id);
    return null;
  }

  if (existing) {
    return putRecord('childItemOverrides', { ...existing, notAchieved, replaced, replacementText });
  }

  return addRecord('childItemOverrides', {
    planId, childId, itemId, notAchieved, replaced, replacementText, uid, updatedAt,
  });
}

export async function deleteChildItemOverridesForChild(planId, childId) {
  const overrides = await listChildItemOverridesForPlan(planId);
  for (const override of overrides) {
    if (override.childId === childId) {
      await deleteRecord('childItemOverrides', override.id);
    }
  }
}
