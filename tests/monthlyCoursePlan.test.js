import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllData } from '../src/storage/db.js';
import { addMonthlyCoursePlan, getOrCreatePlanSlot, listPlanSlotItems, addPlanSlotItem } from '../src/storage/monthlyPlanDb.js';
import { buildMonthlyCalendar } from '../src/domain/monthlyCalendar.js';
import { seedDefaultPlanSlots } from '../src/domain/monthlyCoursePlan.js';

describe('seedDefaultPlanSlots', () => {
  let plan, weeks;

  beforeEach(async () => {
    await clearAllData();
    plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [1], childTiers: { 1: 'Ⅴ' } });
    weeks = buildMonthlyCalendar(2026, 6); // 5 weeks, last week is Mon+Tue only (06/29-06/30)
  });

  it('fills every week\'s Monday with 大團體活動 and Tuesday with 節氣, for the given tier', async () => {
    await seedDefaultPlanSlots({ planId: plan.id, tiers: ['Ⅴ'], weeks });

    for (const week of weeks) {
      const mondaySlot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: week.weekIndex, weekday: 1 });
      const mondayItems = await listPlanSlotItems(mondaySlot.id);
      expect(mondayItems.map(i => i.activityName)).toEqual(['大團體活動']);

      const tuesdaySlot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: week.weekIndex, weekday: 2 });
      const tuesdayItems = await listPlanSlotItems(tuesdaySlot.id);
      expect(tuesdayItems.map(i => i.activityName)).toEqual(['節氣']);
    }
  });

  it('seeds every tier passed in', async () => {
    await seedDefaultPlanSlots({ planId: plan.id, tiers: ['Ⅳ', 'Ⅴ'], weeks });

    const ivMonday = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅳ', weekIndex: 1, weekday: 1 });
    expect((await listPlanSlotItems(ivMonday.id)).map(i => i.activityName)).toEqual(['大團體活動']);
  });

  it('does not duplicate items when called again on an already-seeded tier', async () => {
    await seedDefaultPlanSlots({ planId: plan.id, tiers: ['Ⅴ'], weeks });
    await seedDefaultPlanSlots({ planId: plan.id, tiers: ['Ⅴ'], weeks });

    const mondaySlot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 1 });
    expect(await listPlanSlotItems(mondaySlot.id)).toHaveLength(1);
  });

  it('leaves a Monday item the teacher already edited untouched on a later call', async () => {
    const mondaySlot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 1 });
    await addPlanSlotItem({ slotId: mondaySlot.id, activityName: '戶外教學' });

    await seedDefaultPlanSlots({ planId: plan.id, tiers: ['Ⅴ'], weeks });

    expect((await listPlanSlotItems(mondaySlot.id)).map(i => i.activityName)).toEqual(['戶外教學']);
  });
});
