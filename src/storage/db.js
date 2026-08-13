import { DB_NAME, runRequest } from './dbCore.js';
import { deleteParentReport, listParentReportsForChild } from './parentReportDb.js';
import { listMonthlyCoursePlans, updateMonthlyCoursePlan, deleteChildItemOverridesForChild } from './monthlyPlanDb.js';

export async function addChild({ name, birthDate }) {
  const id = await runRequest('children', 'readwrite', store => store.add({ name, birthDate }));
  return { id, name, birthDate };
}

export async function listChildren() {
  return runRequest('children', 'readonly', store => store.getAll());
}

export async function getChild(id) {
  return runRequest('children', 'readonly', store => store.get(id));
}

// Cascades: deleting a child also deletes all of their forms (and, via deleteForm, those
// forms' entries), their parent reports, and — for every monthly course plan that includes
// them — removes them from that plan's childIds/childTiers and deletes their overrides on it.
// Without this last part, a plan would keep referencing a dead childId forever: harmless until
// an export/import backup round-trip serializes that dead reference as `null`/`undefined`,
// which then crashes the editor view's IndexedDB lookups on open (see monthlyPlanEditorView.js
// and backup.js's importMonthlyCoursePlans for the belt-and-suspenders guards on that path too).
export async function deleteChild(id) {
  const forms = await listFormsForChild(id);
  for (const form of forms) {
    await deleteForm(form.id);
  }
  const parentReports = await listParentReportsForChild(id);
  for (const report of parentReports) {
    await deleteParentReport(report.id);
  }
  const plans = await listMonthlyCoursePlans();
  for (const plan of plans) {
    if (!plan.childIds.includes(id)) continue;
    const childIds = plan.childIds.filter(childId => childId !== id);
    const childTiers = { ...plan.childTiers };
    delete childTiers[id];
    await updateMonthlyCoursePlan(plan.id, { childIds, childTiers });
    await deleteChildItemOverridesForChild(plan.id, id);
  }
  await runRequest('children', 'readwrite', store => store.delete(id));
}

export async function clearAllData() {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

export async function addForm({ childId, tier, period }) {
  const createdAt = new Date().toISOString();
  const id = await runRequest('forms', 'readwrite', store => store.add({ childId, tier, period, createdAt }));
  return { id, childId, tier, period, createdAt };
}

export async function listFormsForChild(childId) {
  return runRequest('forms', 'readonly', store => store.index('by_childId').getAll(childId));
}

export async function getForm(id) {
  return runRequest('forms', 'readonly', store => store.get(id));
}

export async function updateForm(id, changes) {
  const existing = await runRequest('forms', 'readonly', store => store.get(id));
  if (!existing) {
    throw new Error(`Form ${id} not found`);
  }
  const updated = { ...existing, ...changes, id };
  await runRequest('forms', 'readwrite', store => store.put(updated));
  return updated;
}

// Cascades: deleting a form also deletes all of its entries.
export async function deleteForm(id) {
  const entries = await listEntriesForForm(id);
  for (const entry of entries) {
    await deleteEntry(entry.id);
  }
  await runRequest('forms', 'readwrite', store => store.delete(id));
}

export async function addEntry({ formId, indicatorCode, date, status, note }) {
  const id = await runRequest('entries', 'readwrite', store =>
    store.add({ formId, indicatorCode, date, status, note })
  );
  return { id, formId, indicatorCode, date, status, note };
}

export async function updateEntry(id, changes) {
  const existing = await runRequest('entries', 'readonly', store => store.get(id));
  if (!existing) {
    throw new Error(`Entry ${id} not found`);
  }
  const updated = { ...existing, ...changes, id };
  await runRequest('entries', 'readwrite', store => store.put(updated));
  return updated;
}

export async function deleteEntry(id) {
  await runRequest('entries', 'readwrite', store => store.delete(id));
}

// Legacy records written before `status` existed only have a boolean `achieved` flag.
// Normalize them here, at the single read path every consumer (UI, docx export) goes
// through, instead of teaching every caller to understand both shapes.
export async function listEntriesForForm(formId) {
  const entries = await runRequest('entries', 'readonly', store => store.index('by_formId').getAll(formId));
  return entries.map(entry => (entry.status ? entry : { ...entry, status: entry.achieved ? 'developed' : 'developing' }));
}
