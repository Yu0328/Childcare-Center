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

  it('shows an unselected placeholder (not a false-looking default tier) when tier detection failed', async () => {
    const container = document.createElement('div');
    const parsed = buildParsed({ children: [{ name: '趙萬竑', tier: null, overrides: [] }] });
    await renderMonthlyPlanImportPreviewView(container, { parsed, onCancel: () => {}, onImported: () => {} });

    const tierSelect = container.querySelector('[data-child-tier="0"]');
    expect(tierSelect.value).toBe('');
    expect(tierSelect.querySelector('option[value=""]').selected).toBe(true);
  });

  it('rejects submit with no tier chosen (detection failed, placeholder left as-is) and persists nothing', async () => {
    const container = document.createElement('div');
    const parsed = buildParsed({ children: [{ name: '趙萬竑', tier: null, overrides: [] }] });
    let imported = false;
    await renderMonthlyPlanImportPreviewView(container, { parsed, onCancel: () => {}, onImported: () => { imported = true; } });

    container.querySelector('[data-child-new-name="0"]').value = '趙萬竑';
    container.querySelector('[data-child-new-birthDate-year="0"]').value = '2024';
    container.querySelector('[data-child-new-birthDate-month="0"]').value = '7';
    container.querySelector('[data-child-new-birthDate-day="0"]').value = '1';

    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => container.querySelector('[data-error]').textContent.length > 0);

    expect(imported).toBe(false);
    expect(container.querySelector('[data-error]').textContent).toContain('選擇月齡階段');
    expect(await listMonthlyCoursePlans()).toEqual([]);
    expect(await listChildren()).toEqual([]);
  });

  it('rejects submit when the (manually corrected) tier has no matching parsed course content, instead of silently creating an empty plan', async () => {
    const container = document.createElement('div');
    // slotsByTier only has content for 'Ⅴ'; the user corrects this child to 'Ⅰ', which has none.
    const parsed = buildParsed({ children: [{ name: '趙萬竑', tier: null, overrides: [] }] });
    let imported = false;
    await renderMonthlyPlanImportPreviewView(container, { parsed, onCancel: () => {}, onImported: () => { imported = true; } });

    container.querySelector('[data-child-new-name="0"]').value = '趙萬竑';
    container.querySelector('[data-child-new-birthDate-year="0"]').value = '2024';
    container.querySelector('[data-child-new-birthDate-month="0"]').value = '7';
    container.querySelector('[data-child-new-birthDate-day="0"]').value = '1';
    container.querySelector('[data-child-tier="0"]').value = 'Ⅰ';

    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => container.querySelector('[data-error]').textContent.length > 0);

    expect(imported).toBe(false);
    expect(container.querySelector('[data-error]').textContent).toContain('找不到');
    expect(await listMonthlyCoursePlans()).toEqual([]);
    expect(await listChildren()).toEqual([]); // no orphan child left behind either
  });

  it('validates every included child before writing any of them, so a later failure leaves no orphan and a retry creates no duplicate', async () => {
    const container = document.createElement('div');
    const parsed = buildParsed({
      children: [
        { name: '甲', tier: 'Ⅴ', overrides: [] },
        { name: '乙', tier: 'Ⅴ', overrides: [] },
      ],
    });
    let imported = false;
    await renderMonthlyPlanImportPreviewView(container, { parsed, onCancel: () => {}, onImported: () => { imported = true; } });

    container.querySelector('[data-child-new-name="0"]').value = '甲';
    container.querySelector('[data-child-new-birthDate-year="0"]').value = '2024';
    container.querySelector('[data-child-new-birthDate-month="0"]').value = '7';
    container.querySelector('[data-child-new-birthDate-day="0"]').value = '1';

    container.querySelector('[data-child-new-name="1"]').value = '乙';
    // birthdate for child 1 left blank on purpose.

    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => container.querySelector('[data-error]').textContent.length > 0);

    expect(imported).toBe(false);
    expect(await listChildren()).toEqual([]); // child "甲" must NOT have been written as an orphan

    container.querySelector('[data-child-new-birthDate-year="1"]').value = '2024';
    container.querySelector('[data-child-new-birthDate-month="1"]').value = '8';
    container.querySelector('[data-child-new-birthDate-day="1"]').value = '1';

    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => imported);

    const created = await listChildren();
    expect(created).toHaveLength(2); // no duplicate of "甲" from the first failed attempt
    expect(created.map(c => c.name).sort()).toEqual(['乙', '甲']);

    const plans = await listMonthlyCoursePlans();
    expect(plans).toHaveLength(1);
    expect(plans[0].childIds).toHaveLength(2);
  });
});
