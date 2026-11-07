// Bundled by the recorder with esbuild (globalName __seed) and run inside the recorded page, so the
// demo data goes in through the app's own storage code and the app's own 總表 exporter makes the import file.
import { importBackup } from '../../src/storage/backup.js';
import { getIndicator, getIndicatorsForTier } from '../../src/data/indicators.js';
import { generateDocxBlob } from '../../src/export/docxExport.js';
import { BACKUP, CHILDREN, IMPORT_FORM } from './data.mjs';

export async function seed() {
  const data = structuredClone(BACKUP);
  for (const entry of data.coursePlanEntries) {
    const indicator = getIndicator(entry.indicatorCode);
    entry.activityName = indicator.activityName;
    entry.indicatorText = indicator.description;
  }
  await importBackup(JSON.stringify(data));
}

export async function importDocxBase64() {
  const child = CHILDREN.find(c => c.name === IMPORT_FORM.childName);
  const form = { id: 1, childId: child.id, tier: IMPORT_FORM.tier, period: IMPORT_FORM.period };
  const entries = IMPORT_FORM.entries.map(([indicatorCode, date, status, note], i) => ({
    id: i + 1, formId: 1, indicatorCode, date, status, note, activityName: getIndicator(indicatorCode).activityName,
  }));
  const blob = await generateDocxBlob({ child, form, indicators: getIndicatorsForTier(form.tier), entries });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
