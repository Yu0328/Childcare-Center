import { getOrCreatePlanSlot, listPlanSlotItems, addPlanSlotItem } from '../storage/monthlyPlanDb.js';

const DEFAULTS = [
  [1, '大團體活動'],
  [2, '節氣'],
];

// New MonthlyCoursePlans start with 大團體活動 (Monday) and 節氣 (Tuesday) pre-filled for every
// tier present among the plan's children, for every week that actually has that weekday (a
// month's first/last week may be partial — see monthlyCalendar.js). Only touches slots that
// don't already have items, so it's safe to call again later (e.g. adding a child of an
// already-seeded tier, or of a genuinely new tier) without duplicating or overwriting anything
// the teacher already edited.
export async function seedDefaultPlanSlots({ planId, tiers, weeks }) {
  for (const tier of tiers) {
    for (const week of weeks) {
      for (const [weekday, activityName] of DEFAULTS) {
        if (!week.days.some(d => d.weekday === weekday)) continue;
        const slot = await getOrCreatePlanSlot({ planId, tier, weekIndex: week.weekIndex, weekday });
        const existingItems = await listPlanSlotItems(slot.id);
        if (existingItems.length === 0) {
          await addPlanSlotItem({ slotId: slot.id, indicatorCode: null, activityName, indicatorText: '' });
        }
      }
    }
  }
}
