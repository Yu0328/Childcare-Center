import { DB_NAME, runRequest } from './dbCore.js';
import { deleteParentReport, listParentReportsForChild } from './parentReportDb.js';

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
// forms' entries) — an orphaned form pointing at a missing childId would otherwise linger.
export async function deleteChild(id) {
  const forms = await listFormsForChild(id);
  for (const form of forms) {
    await deleteForm(form.id);
  }
  const parentReports = await listParentReportsForChild(id);
  for (const report of parentReports) {
    await deleteParentReport(report.id);
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

// Cascades: deleting a form also deletes all of its entries.
export async function deleteForm(id) {
  const entries = await listEntriesForForm(id);
  for (const entry of entries) {
    await deleteEntry(entry.id);
  }
  await runRequest('forms', 'readwrite', store => store.delete(id));
}

export async function addEntry({ formId, indicatorCode, date, achieved, note }) {
  const id = await runRequest('entries', 'readwrite', store =>
    store.add({ formId, indicatorCode, date, achieved, note })
  );
  return { id, formId, indicatorCode, date, achieved, note };
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

export async function listEntriesForForm(formId) {
  return runRequest('entries', 'readonly', store => store.index('by_formId').getAll(formId));
}
