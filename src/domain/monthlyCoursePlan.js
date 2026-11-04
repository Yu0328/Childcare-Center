import { getOrCreatePlanSlot, listPlanSlotItems, addPlanSlotItem, itemVisibleToChild } from '../storage/monthlyPlanDb.js';
import { CENTER } from '../centers.js';

// A centre can name its own fixed days (src/centers.js `monthlyPlanDefaults`); Wed/Thu stay open for 適性.
const DEFAULTS = CENTER.monthlyPlanDefaults ?? [
  [1, '大團體活動'],
  [2, '節氣'],
  [5, '大團體活動'],
];

// The editor tints these days warm as "already filled in" (src/styles.css `--preset`).
export const PRESET_WEEKDAYS = new Set(DEFAULTS.map(([weekday]) => weekday));

// New MonthlyCoursePlans start with 大團體活動 (Monday & Friday) and 節氣 (Tuesday) pre-filled for every
// child — each their own copy, in their own tier's slot — for every week that actually has that
// weekday (a month's first/last week may be partial — see monthlyCalendar.js). A child who already
// has something on that day is skipped, so it's safe to call again later (e.g. after 管理幼兒 adds
// a child) without duplicating or overwriting anything the teacher already edited.
export async function seedDefaultPlanSlots({ plan, weeks }) {
  for (const childId of plan.childIds) {
    const tier = plan.childTiers[childId];
    for (const week of weeks) {
      for (const [weekday, activityName] of DEFAULTS) {
        if (!week.days.some(d => d.weekday === weekday)) continue;
        const slot = await getOrCreatePlanSlot({ planId: plan.id, tier, weekIndex: week.weekIndex, weekday });
        const existingItems = (await listPlanSlotItems(slot.id)).filter(item => itemVisibleToChild(item, childId));
        if (existingItems.length === 0) {
          await addPlanSlotItem({ slotId: slot.id, indicatorCode: null, activityName, indicatorText: '', childId });
        }
      }
    }
  }
}
