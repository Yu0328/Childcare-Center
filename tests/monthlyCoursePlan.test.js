import { describe, it, expect, beforeEach, vi } from 'vitest';
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

  it('fills every week\'s Monday and Friday with 大團體活動 and Tuesday with 節氣, for the given tier', async () => {
    await seedDefaultPlanSlots({ planId: plan.id, tiers: ['Ⅴ'], weeks });

    for (const week of weeks) {
      const mondaySlot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: week.weekIndex, weekday: 1 });
      const mondayItems = await listPlanSlotItems(mondaySlot.id);
      expect(mondayItems.map(i => i.activityName)).toEqual(['大團體活動']);

      const tuesdaySlot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: week.weekIndex, weekday: 2 });
      const tuesdayItems = await listPlanSlotItems(tuesdaySlot.id);
      expect(tuesdayItems.map(i => i.activityName)).toEqual(['節氣']);

      if (!week.days.some(d => d.weekday === 5)) continue;
      const fridaySlot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: week.weekIndex, weekday: 5 });
      const fridayItems = await listPlanSlotItems(fridaySlot.id);
      expect(fridayItems.map(i => i.activityName)).toEqual(['大團體活動']);
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

describe('seedDefaultPlanSlots for a centre with its own weekly defaults', () => {
  it('uses 萬丹 defaults: Monday 戶外活動日, Tuesday 節氣 and Friday 團體課, leaving Wed/Thu for 適性', async () => {
    vi.resetModules();
    const { CENTERS } = await import('../src/centers.js');
    vi.doMock('../src/centers.js', () => ({ CENTERS, CENTER: CENTERS.find(c => c.id === 'wandan') }));
    const { seedDefaultPlanSlots: seed } = await import('../src/domain/monthlyCoursePlan.js');
    const db = await import('../src/storage/monthlyPlanDb.js');
    await (await import('../src/storage/db.js')).clearAllData();
    const plan = await db.addMonthlyCoursePlan({ period: '115年06月', childIds: [1], childTiers: { 1: 'Ⅴ' } });

    await seed({ planId: plan.id, tiers: ['Ⅴ'], weeks: buildMonthlyCalendar(2026, 6) });

    const names = async weekday => (await db.listPlanSlotItems(
      (await db.getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday })).id)).map(i => i.activityName);
    expect(await names(1)).toEqual(['戶外活動日']);
    expect(await names(2)).toEqual(['節氣']);
    expect(await names(3)).toEqual([]);
    expect(await names(4)).toEqual([]);
    expect(await names(5)).toEqual(['團體課']);
    vi.doUnmock('../src/centers.js');
  });
});
