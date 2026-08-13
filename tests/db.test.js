import { describe, it, expect, beforeEach } from 'vitest';
import {
  addChild, listChildren, getChild, deleteChild, clearAllData,
  addForm, listFormsForChild, getForm, deleteForm, updateForm,
  addEntry, updateEntry, deleteEntry, listEntriesForForm,
} from '../src/storage/db.js';
import { addParentReport, listParentReportsForChild } from '../src/storage/parentReportDb.js';
import {
  addMonthlyCoursePlan, getMonthlyCoursePlan, getOrCreatePlanSlot, addPlanSlotItem,
  setChildItemOverride, listChildItemOverridesForPlan,
} from '../src/storage/monthlyPlanDb.js';
import { runRequest } from '../src/storage/dbCore.js';

describe('children storage', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('adds a child and assigns it an id', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    expect(child.id).toBeTypeOf('number');
    expect(child.name).toBe('陳小安');
    expect(child.birthDate).toBe('2024-11-01');
  });

  it('lists all added children', async () => {
    await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    await addChild({ name: '林小晴', birthDate: '2024-07-19' });

    const children = await listChildren();
    expect(children.map(c => c.name).sort()).toEqual(['林小晴', '陳小安']);
  });

  it('gets a child by id', async () => {
    const created = await addChild({ name: '陳小安', birthDate: '2024-11-01' });

    const found = await getChild(created.id);
    expect(found).toEqual(created);
  });

  it('returns undefined for a missing child id', async () => {
    expect(await getChild(999)).toBeUndefined();
  });

  it('deletes a child and cascades to their forms and entries', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    const otherChild = await addChild({ name: '林小晴', birthDate: '2024-07-19' });
    const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });
    await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '測試' });

    await deleteChild(child.id);

    expect(await getChild(child.id)).toBeUndefined();
    expect(await listFormsForChild(child.id)).toEqual([]);
    expect(await listEntriesForForm(form.id)).toEqual([]);
    // Unrelated data is untouched.
    expect(await getChild(otherChild.id)).toEqual(otherChild);
  });

  it('deleting a child also cascades to their parent reports', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });

    await deleteChild(child.id);

    expect(await listParentReportsForChild(child.id)).toEqual([]);
  });

  it('deleting a child also cascades to monthly course plans they are in, dropping them from childIds/childTiers and clearing their overrides', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    const otherChild = await addChild({ name: '林小晴', birthDate: '2024-07-19' });
    const plan = await addMonthlyCoursePlan({
      period: '115年06月',
      childIds: [child.id, otherChild.id],
      childTiers: { [child.id]: 'Ⅴ', [otherChild.id]: 'Ⅴ' },
    });
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: '拼拼圖' });
    await setChildItemOverride({ planId: plan.id, childId: child.id, itemId: item.id, notAchieved: true, replaced: false });
    await setChildItemOverride({ planId: plan.id, childId: otherChild.id, itemId: item.id, notAchieved: true, replaced: false });

    await deleteChild(child.id);

    const updatedPlan = await getMonthlyCoursePlan(plan.id);
    expect(updatedPlan.childIds).toEqual([otherChild.id]);
    expect(updatedPlan.childTiers).toEqual({ [otherChild.id]: 'Ⅴ' });

    const remainingOverrides = await listChildItemOverridesForPlan(plan.id);
    expect(remainingOverrides).toHaveLength(1);
    expect(remainingOverrides[0].childId).toBe(otherChild.id);
  });
});

describe('forms and entries storage', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('adds a form for a child and lists it back', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });

    expect(form.id).toBeTypeOf('number');
    expect(form.createdAt).toBeTypeOf('string');

    const forms = await listFormsForChild(child.id);
    expect(forms).toEqual([form]);
  });

  it('allows multiple forms for the same child and tier (different periods)', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });
    await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年02月' });

    const forms = await listFormsForChild(child.id);
    expect(forms).toHaveLength(2);
    expect(forms.map(f => f.period).sort()).toEqual(['115年01月', '115年02月']);
  });

  it('gets a form by id', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    const created = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });

    expect(await getForm(created.id)).toEqual(created);
  });

  it('updates a form', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });

    const updated = await updateForm(form.id, { period: '115年01月-115年02月' });
    expect(updated.period).toBe('115年01月-115年02月');
    expect(updated.tier).toBe('Ⅳ');
    expect(updated.childId).toBe(child.id);

    expect(await getForm(form.id)).toEqual(updated);
  });

  it('throws when updating a non-existent form', async () => {
    await expect(updateForm(999, { period: 'x' })).rejects.toThrow('Form 999 not found');
  });

  it('adds, updates, lists and deletes entries for a form', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });

    const entry = await addEntry({
      formId: form.id,
      indicatorCode: 'Ⅳ-1-1',
      date: '2026-01-07',
      status: 'developed',
      note: '可以來回穩定行走',
    });
    expect(entry.id).toBeTypeOf('number');

    let entries = await listEntriesForForm(form.id);
    expect(entries).toEqual([entry]);

    const updated = await updateEntry(entry.id, { note: '可穩定行走至戶外遊戲場' });
    expect(updated.note).toBe('可穩定行走至戶外遊戲場');
    expect(updated.indicatorCode).toBe('Ⅳ-1-1');

    await deleteEntry(entry.id);
    entries = await listEntriesForForm(form.id);
    expect(entries).toEqual([]);
  });

  it('throws when updating a non-existent entry', async () => {
    await expect(updateEntry(999, { note: 'x' })).rejects.toThrow('Entry 999 not found');
  });

  it('deletes a form and cascades to its entries, leaving other forms untouched', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });
    const otherForm = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年02月' });
    await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '測試' });
    const otherEntry = await addEntry({ formId: otherForm.id, indicatorCode: 'Ⅳ-1-1', date: '2026-02-07', status: 'developed', note: '不受影響' });

    await deleteForm(form.id);

    expect(await getForm(form.id)).toBeUndefined();
    expect(await listEntriesForForm(form.id)).toEqual([]);
    expect(await listEntriesForForm(otherForm.id)).toEqual([otherEntry]);
  });

  it('normalizes legacy entries that only have "achieved" (pre-status data) into a status when listed', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });

    // Simulate a record written before this field existed: no `status`, only `achieved`.
    const developedId = await runRequest('entries', 'readwrite', store =>
      store.add({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', achieved: true, note: '舊資料-已達成' })
    );
    const developingId = await runRequest('entries', 'readwrite', store =>
      store.add({ formId: form.id, indicatorCode: 'Ⅳ-1-2', date: '2026-01-08', achieved: false, note: '舊資料-未達成' })
    );

    const entries = await listEntriesForForm(form.id);

    expect(entries.find(e => e.id === developedId).status).toBe('developed');
    expect(entries.find(e => e.id === developingId).status).toBe('developing');
  });
});
