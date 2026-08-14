import {
  listChildren, listFormsForChild, listEntriesForForm,
  addChild, addForm, addEntry, clearAllData,
} from './db.js';
import {
  listParentReportsForChild, listCoursePlanEntriesForReport, listCourseOccurrencesForEntry,
  listDevelopmentRecordEntriesForReport, listBehaviorObservationsForReport, listHighlightEntriesForReport,
  addParentReport, addCoursePlanEntry, addCourseOccurrence,
  addDevelopmentRecordEntry, addBehaviorObservation, addHighlightEntry,
} from './parentReportDb.js';
import {
  listMonthlyCoursePlans, listPlanSlotsForPlan, listPlanSlotItems, listChildItemOverridesForPlan,
  addMonthlyCoursePlan, getOrCreatePlanSlot, addPlanSlotItem, setChildItemOverride,
} from './monthlyPlanDb.js';

const BACKUP_VERSION = 3;

// Appends one character at a time rather than spreading bytes into String.fromCharCode: spreading
// even a chunked subarray (this used to chunk at 0x8000) can exceed Safari's call-stack/argument-
// spread limit, which is lower than Chrome's, for a real (non-trivial) photo. One argument per
// call has no such limit on any engine.
async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBlob(base64, type) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function exportBackup() {
  const children = await listChildren();
  const forms = [];
  const entries = [];
  const parentReports = [];
  const coursePlanEntries = [];
  const courseOccurrences = [];
  const developmentRecordEntries = [];
  const behaviorObservations = [];
  const highlightEntries = [];

  for (const child of children) {
    const childForms = await listFormsForChild(child.id);
    forms.push(...childForms);
    for (const form of childForms) {
      entries.push(...(await listEntriesForForm(form.id)));
    }

    const childReports = await listParentReportsForChild(child.id);
    parentReports.push(...childReports);
    for (const report of childReports) {
      const reportEntries = await listCoursePlanEntriesForReport(report.id);
      coursePlanEntries.push(...reportEntries);
      for (const entry of reportEntries) {
        courseOccurrences.push(...(await listCourseOccurrencesForEntry(entry.id)));
      }
      developmentRecordEntries.push(...(await listDevelopmentRecordEntriesForReport(report.id)));
      behaviorObservations.push(...(await listBehaviorObservationsForReport(report.id)));

      const reportHighlights = await listHighlightEntriesForReport(report.id);
      for (const highlight of reportHighlights) {
        const photos = await Promise.all(
          highlight.photos.map(async photo => ({
            base64: await blobToBase64(photo.blob),
            type: photo.blob.type,
            width: photo.width,
            height: photo.height,
          }))
        );
        highlightEntries.push({ ...highlight, photos });
      }
    }
  }

  const monthlyCoursePlans = await listMonthlyCoursePlans();
  const planSlots = [];
  const planSlotItems = [];
  for (const plan of monthlyCoursePlans) {
    const slots = await listPlanSlotsForPlan(plan.id);
    planSlots.push(...slots);
    for (const slot of slots) {
      planSlotItems.push(...(await listPlanSlotItems(slot.id)));
    }
  }
  const childItemOverrides = [];
  for (const plan of monthlyCoursePlans) {
    childItemOverrides.push(...(await listChildItemOverridesForPlan(plan.id)));
  }

  return JSON.stringify(
    {
      version: BACKUP_VERSION,
      children, forms, entries,
      parentReports, coursePlanEntries, courseOccurrences,
      developmentRecordEntries, behaviorObservations, highlightEntries,
      monthlyCoursePlans, planSlots, planSlotItems, childItemOverrides,
    },
    null,
    2
  );
}

async function importV1Or2Children(data) {
  const childIdMap = new Map();
  for (const child of data.children) {
    const created = await addChild({ name: child.name, birthDate: child.birthDate });
    childIdMap.set(child.id, created.id);
  }

  const formIdMap = new Map();
  for (const form of data.forms) {
    const created = await addForm({ childId: childIdMap.get(form.childId), tier: form.tier, period: form.period });
    formIdMap.set(form.id, created.id);
  }

  for (const entry of data.entries) {
    await addEntry({
      formId: formIdMap.get(entry.formId),
      indicatorCode: entry.indicatorCode,
      date: entry.date,
      status: entry.status ?? (entry.achieved ? 'developed' : 'developing'),
      note: entry.note,
    });
  }

  return childIdMap;
}

async function importParentReports(data, childIdMap) {
  const reportIdMap = new Map();
  for (const report of data.parentReports ?? []) {
    const created = await addParentReport({ childId: childIdMap.get(report.childId), tier: report.tier, period: report.period });
    reportIdMap.set(report.id, created.id);
  }

  const entryIdMap = new Map();
  for (const entry of data.coursePlanEntries ?? []) {
    const created = await addCoursePlanEntry({
      reportId: reportIdMap.get(entry.reportId),
      indicatorCode: entry.indicatorCode,
      activityName: entry.activityName,
      indicatorText: entry.indicatorText,
    });
    entryIdMap.set(entry.id, created.id);
  }

  for (const occurrence of data.courseOccurrences ?? []) {
    await addCourseOccurrence({
      entryId: entryIdMap.get(occurrence.entryId),
      date: occurrence.date,
      status: occurrence.status,
      absent: occurrence.absent,
      note: occurrence.note,
    });
  }

  for (const record of data.developmentRecordEntries ?? []) {
    await addDevelopmentRecordEntry({
      reportId: reportIdMap.get(record.reportId),
      domain: record.domain,
      courseEntryIds: record.courseEntryIds.map(id => entryIdMap.get(id)),
      narrative: record.narrative,
    });
  }

  for (const observation of data.behaviorObservations ?? []) {
    await addBehaviorObservation({
      reportId: reportIdMap.get(observation.reportId),
      title: observation.title,
      narrative: observation.narrative,
    });
  }

  for (const highlight of data.highlightEntries ?? []) {
    const photos = highlight.photos.map(photo => ({
      blob: base64ToBlob(photo.base64, photo.type),
      width: photo.width,
      height: photo.height,
    }));
    await addHighlightEntry({ reportId: reportIdMap.get(highlight.reportId), photos, caption: highlight.caption });
  }
}

async function importMonthlyCoursePlans(data, childIdMap) {
  const planIdMap = new Map();
  for (const plan of data.monthlyCoursePlans ?? []) {
    // A childId with no matching entry in childIdMap belongs to a child missing from this
    // backup's `children` (e.g. a dead reference written before deleteChild cascaded to plans —
    // see db.js). Drop it here rather than restoring a null/undefined child reference that would
    // later crash the editor view's per-child IndexedDB lookups.
    const childIds = plan.childIds.map(id => childIdMap.get(id)).filter(id => id !== undefined);
    const childTiers = Object.fromEntries(
      Object.entries(plan.childTiers)
        .map(([oldChildId, tier]) => [childIdMap.get(Number(oldChildId)), tier])
        .filter(([newChildId]) => newChildId !== undefined)
    );
    const created = await addMonthlyCoursePlan({ period: plan.period, childIds, childTiers });
    planIdMap.set(plan.id, created.id);
  }

  const slotIdMap = new Map();
  for (const slot of data.planSlots ?? []) {
    const created = await getOrCreatePlanSlot({
      planId: planIdMap.get(slot.planId), tier: slot.tier, weekIndex: slot.weekIndex, weekday: slot.weekday,
    });
    slotIdMap.set(slot.id, created.id);
  }

  const itemIdMap = new Map();
  for (const item of data.planSlotItems ?? []) {
    const created = await addPlanSlotItem({
      slotId: slotIdMap.get(item.slotId), indicatorCode: item.indicatorCode, activityName: item.activityName, indicatorText: item.indicatorText,
    });
    itemIdMap.set(item.id, created.id);
  }

  for (const override of data.childItemOverrides ?? []) {
    const childId = childIdMap.get(override.childId);
    if (childId === undefined) continue; // same dead-child guard as childIds/childTiers above
    await setChildItemOverride({
      planId: planIdMap.get(override.planId),
      childId,
      itemId: itemIdMap.get(override.itemId),
      notAchieved: override.notAchieved,
      replaced: override.replaced,
      replacementText: override.replacementText,
    });
  }
}

export async function importBackup(json) {
  const data = JSON.parse(json);
  if (data.version !== 1 && data.version !== 2 && data.version !== 3) {
    throw new Error(`Unsupported backup version: ${data.version}`);
  }

  await clearAllData();

  const childIdMap = await importV1Or2Children(data);
  if (data.version === 2 || data.version === 3) {
    await importParentReports(data, childIdMap);
  }
  if (data.version === 3) {
    await importMonthlyCoursePlans(data, childIdMap);
  }
}
