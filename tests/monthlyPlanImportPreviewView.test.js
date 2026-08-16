import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAllData, addChild, listChildren } from '../src/storage/db.js';
import { listMonthlyCoursePlans, listPlanSlotsForPlan, listPlanSlotItems, listChildItemOverridesForPlan } from '../src/storage/monthlyPlanDb.js';
import { renderMonthlyPlanImportPreviewView } from '../src/ui/monthlyPlanImportPreviewView.js';
import { waitFor } from './helpers.js';

function buildParsed(overrides = {}) {
  return {
    period: '115年06月',
    warnings: [],
    slotsByTier: {
      'Ⅴ': [
        { weekIndex: 1, weekday: 1, items: [{ indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲', indicatorText: '能依形狀或顏色分類' }] },
      ],
    },
    children: [{ name: '趙萬竑', tier: 'Ⅴ', overrides: [{ weekIndex: 1, weekday: 1, itemIndex: 0, notAchieved: true, replaced: false, replacementText: '' }] }],
    ...overrides,
  };
}

describe('renderMonthlyPlanImportPreviewView', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('does not persist anything until confirmed', async () => {
    const container = document.createElement('div');
    renderMonthlyPlanImportPreviewView(container, { parsed: buildParsed(), onCancel: () => {}, onImported: () => {} });
    expect(await listMonthlyCoursePlans()).toEqual([]);
  });

  it('shows warnings and pre-fills the parsed period', async () => {
    const container = document.createElement('div');
    await renderMonthlyPlanImportPreviewView(container, { parsed: buildParsed({ warnings: ['測試警告'] }), onCancel: () => {}, onImported: () => {} });
    expect(container.textContent).toContain('測試警告');
    expect(container.querySelector('[data-field="period-year"]').value).toBe('115');
    expect(container.querySelector('[data-field="period-month"]').value).toBe('6');
  });

  it('auto-selects an existing child on a unique name match, creates the plan/slot/item/override on confirm', async () => {
    const existing = await addChild({ name: '趙萬竑', birthDate: '2024-07-01' });
    const container = document.createElement('div');
    let imported = false;
    await renderMonthlyPlanImportPreviewView(container, { parsed: buildParsed(), onCancel: () => {}, onImported: () => { imported = true; } });

    expect(container.querySelector('[data-child-select="0"]').value).toBe(String(existing.id)); // select values are always strings

    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => imported);

    const plans = await listMonthlyCoursePlans();
    expect(plans).toHaveLength(1);
    expect(plans[0].childIds).toEqual([existing.id]);
    expect(plans[0].childTiers[existing.id]).toBe('Ⅴ');
    expect((await listChildren())).toHaveLength(1); // no duplicate child created

    const [slot] = await listPlanSlotsForPlan(plans[0].id);
    expect(slot).toMatchObject({ tier: 'Ⅴ', weekIndex: 1, weekday: 1 });
    const [item] = await listPlanSlotItems(slot.id);
    expect(item).toMatchObject({ indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲' });

    const [override] = await listChildItemOverridesForPlan(plans[0].id);
    expect(override).toMatchObject({ childId: existing.id, itemId: item.id, notAchieved: true, replaced: false });
  });

  it('requires a manual pick when there is no existing child with that name, "建立新小朋友" creates one', async () => {
    const container = document.createElement('div');
    let imported = false;
    await renderMonthlyPlanImportPreviewView(container, { parsed: buildParsed(), onCancel: () => {}, onImported: () => { imported = true; } });

    expect(container.querySelector('[data-child-select="0"]').value).toBe('__new__');
    container.querySelector('[data-child-new-name="0"]').value = '趙萬竑';
    const birthYear = container.querySelector('[data-child-new-birthDate-year="0"]');
    const birthMonth = container.querySelector('[data-child-new-birthDate-month="0"]');
    const birthDay = container.querySelector('[data-child-new-birthDate-day="0"]');
    birthYear.value = '2024';
    birthMonth.value = '7';
    birthDay.value = '1';

    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => imported);

    const created = await listChildren();
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ name: '趙萬竑', birthDate: '2024-07-01' });
  });

  it('unchecking a child excludes them from the created plan entirely', async () => {
    await addChild({ name: '趙萬竑', birthDate: '2024-07-01' });
    const container = document.createElement('div');
    let imported = false;
    await renderMonthlyPlanImportPreviewView(container, { parsed: buildParsed(), onCancel: () => {}, onImported: () => { imported = true; } });

    container.querySelector('[data-child-include="0"]').checked = false;
    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => imported);

    const plans = await listMonthlyCoursePlans();
    expect(plans[0].childIds).toEqual([]);
  });

  it('calls onCancel without persisting anything', async () => {
    const container = document.createElement('div');
    const onCancel = vi.fn();
    await renderMonthlyPlanImportPreviewView(container, { parsed: buildParsed(), onCancel, onImported: () => {} });
    container.querySelector('[data-action="cancel"]').click();
    expect(onCancel).toHaveBeenCalled();
    expect(await listMonthlyCoursePlans()).toEqual([]);
  });
});
