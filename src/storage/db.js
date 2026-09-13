import { DB_NAME, runRequest, addRecord, putRecord, deleteRecord } from './dbCore.js';
import { deleteParentReport, listParentReportsForChild } from './parentReportDb.js';
import { listMonthlyCoursePlans, updateMonthlyCoursePlan, deleteChildItemOverridesForChild } from './monthlyPlanDb.js';

export async function addChild({ name, birthDate, uid, updatedAt }) {
  return addRecord('children', { name, birthDate, uid, updatedAt });
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
  await deleteRecord('children', id);
}

export async function clearAllData() {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

export async function addForm({ childId, tier, period, isNew = false, uid, updatedAt }) {
  const createdAt = new Date().toISOString();
  return addRecord('forms', { childId, tier, period, createdAt, isNew, uid, updatedAt });
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
  return putRecord('forms', { ...existing, ...changes, id });
}

// Cascades: deleting a form also deletes all of its entries.
export async function deleteForm(id) {
  const entries = await listEntriesForForm(id);
  for (const entry of entries) {
    await deleteEntry(entry.id);
  }
  await deleteRecord('forms', id);
}

// activityName is optional — normal entries (against one of this form's own tier's indicators)
// never need it, since their description is always looked up fresh from the indicator. It exists
// for a remark entry whose code doesn't resolve to any indicator at all (see
// aggregateCoursePlan.js), so the original activity label the child's record was under isn't lost
// just because the code couldn't be matched — 發展活動 falls back to it on export.
export async function addEntry({ formId, indicatorCode, date, status, note, activityName, uid, updatedAt, createdAt }) {
  // A dedicated, never-touched-again field so list order stays the same across devices after
  // sync — id is a per-device autoIncrement, and updatedAt moves on every edit, so neither can
  // double as "which order these were added in" (same fix as highlightEntries' createdAt).
  return addRecord('entries', {
    formId, indicatorCode, date, status, note, activityName, uid, updatedAt,
    createdAt: createdAt || new Date().toISOString(),
  });
}

export async function updateEntry(id, changes) {
  const existing = await runRequest('entries', 'readonly', store => store.get(id));
  if (!existing) {
    throw new Error(`Entry ${id} not found`);
  }
  return putRecord('entries', { ...existing, ...changes, id });
}

export async function deleteEntry(id) {
  await deleteRecord('entries', id);
}

// Legacy records written before `status` existed only have a boolean `achieved` flag.
// Normalize them here, at the single read path every consumer (UI, docx export) goes
// through, instead of teaching every caller to understand both shapes.
export async function listEntriesForForm(formId) {
  const entries = await runRequest('entries', 'readonly', store => store.index('by_formId').getAll(formId));
  return entries
    .map(entry => (entry.status ? entry : { ...entry, status: entry.achieved ? 'developed' : 'developing' }))
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}
