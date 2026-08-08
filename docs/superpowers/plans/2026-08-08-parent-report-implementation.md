# 適性紀錄(家長版) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second document type, 適性紀錄(家長版), alongside the existing 適性總表 (C表): a tabbed editor (課程計畫表／適性發展紀錄表／行為觀察／點滴分享with photos), its own IndexedDB-backed data model, a pixel-faithful docx export, legacy Word import, and backup/restore support — without breaking any existing 適性總表 functionality or existing users' saved data.

**Architecture:** Same single-file browser app as 適性總表: IndexedDB storage (new object stores, DB version bump with backward-compatible upgrade), a new docx export module built with the `docx` library (shared header/font helpers extracted into a common module), a new regex/XML-based legacy `.docx` importer with a mandatory preview-before-save step, and new UI views wired into `app.js` behind a new top-level "選擇要填寫的表" screen.

**Tech Stack:** Vanilla JS ES modules, `docx` (export), `jszip` (export + import), IndexedDB (`fake-indexeddb` in tests), `vitest` + `jsdom`, esbuild bundling (unchanged).

## Global Constraints

- Real children's names/data must never appear in source, tests, or commits. All example/test data uses the fictional children already established in this project: `陳小安` (birthDate `2024-11-01`) and `林小晴` (birthDate `2024-07-19`). Never use any other name.
- The existing IndexedDB database (`c-form-db`, currently version 1) already holds real user data in production. The upgrade to version 2 (adding new object stores) MUST NOT delete, rename, or restructure the existing `children`/`forms`/`entries` stores, and MUST NOT require the user to re-import anything. Write a migration test that opens a v1-shaped database (only the three old stores, with data in them), then opens it again through the v2 code path, and asserts the old data is untouched and the new stores exist and are usable.
- `BACKUP_VERSION` bumps from `1` to `2`. `importBackup()` must keep accepting version-1 backup files produced by the currently-deployed app (children/forms/entries only, no parent-report data) — do not drop support for the old shape.
- All new docx export constants (page margins, column widths, fill colors, font sizes) must be the exact values documented in each task below — they were extracted directly from the real reference sample's OOXML, not guessed. Do not "simplify" or round them.
- Every new UI view follows the existing pattern in this codebase: a `render*View(container, props)` function that sets `container.innerHTML` from a template literal, uses `escapeHtml()` on every interpolated user-supplied value, wires event listeners after setting `innerHTML`, and re-renders the whole view (calls itself again) after any data mutation rather than doing partial DOM patching. Match this exactly — do not introduce a different rendering approach.
- Every new IndexedDB write/delete function follows the existing `runRequest(storeName, mode, fn)` pattern (resolves on `tx.oncomplete`, not `request.onsuccess`) — this is required for `fake-indexeddb` compatibility in tests, confirmed by prior debugging in this codebase.
- Delete operations cascade fully: deleting a `ParentReport` deletes every `CoursePlanEntry` (and its `CourseOccurrence`s), `DevelopmentRecordEntry`, `BehaviorObservationEntry`, and `HighlightEntry` (and its photo Blobs) under it. Deleting a `Child` must cascade to their `ParentReport`s (in addition to the existing cascade to `AssessmentForm`s).
- Run `npm test` after every task and keep the suite green before moving to the next task. Node.js is at `C:\Program Files\nodejs\` and is not on PATH by default — prefix shell commands with `export PATH="/c/Program Files/nodejs:$PATH" &&` (bash) in this environment.

## File Structure

**New storage files:**
- `src/storage/dbCore.js` — extracted `DB_NAME`, `DB_VERSION`, `openDatabase()`, `runRequest()` shared by both storage modules
- `src/storage/parentReportDb.js` — CRUD for `ParentReport`, `CoursePlanEntry`, `CourseOccurrence`, `DevelopmentRecordEntry`, `BehaviorObservationEntry`, `HighlightEntry`

**Modified storage files:**
- `src/storage/db.js` — import `runRequest`/`DB_NAME` from `dbCore.js` instead of defining them locally; `deleteChild` also cascades to `parentReportDb.js`'s `deleteParentReport`
- `src/storage/backup.js` — export/import the six new stores, `BACKUP_VERSION` 1 → 2, backward-compatible with v1 files

**New media file:**
- `src/media/imagePreprocess.js` — `calculateTargetDimensions()` (pure) and `compressImage()` (Canvas-based)

**New export files:**
- `src/export/docxShared.js` — constants/helpers extracted from `docxExport.js` (font, header icon, page size, `toRocDate`, `textParagraph`, etc.)
- `src/export/parentReportDocxExport.js` — `generateParentReportDocxBlob()`

**Modified export file:**
- `src/export/docxExport.js` — import shared pieces from `docxShared.js` instead of defining them locally (no behavior change)

**New import files:**
- `src/import/parentReportDocxImport.js` — legacy `.docx` parser for the three text sections + photo extraction
- `src/ui/parentReportImportPreviewView.js` — preview-and-confirm UI

**New UI files:**
- `src/ui/reportTypeSelectView.js` — top-level "選擇要填寫的表" screen
- `src/ui/parentReportListView.js` — list/add/delete `ParentReport`s for a child
- `src/ui/parentReportEditorView.js` — tab shell (4 tabs) + export button
- `src/ui/courseplanTabView.js`
- `src/ui/developmentRecordTabView.js`
- `src/ui/behaviorObservationTabView.js`
- `src/ui/highlightsTabView.js`

**Modified UI files:**
- `src/ui/childListView.js` — add optional `onBack` prop (renders a back button only if provided; existing callers/tests unaffected)
- `src/app.js` — add `showReportTypeSelect()` as the new entry point; thread report type through routing

**Modified styling:**
- `src/styles.css` — tab component, photo upload grid, strikethrough style, type-select screen

**New test files** (one per new source file above, same relative path under `tests/`), plus extensions to `tests/db.test.js`, `tests/backup.test.js`, `tests/childListView.test.js`, `tests/app.test.js`, `tests/docxExport.test.js` (import-path only).

---

### Task 1: Extract `dbCore.js`, bump DB_VERSION, add the six new object stores

**Files:**
- Create: `src/storage/dbCore.js`
- Modify: `src/storage/db.js`
- Test: `tests/dbCore.test.js`

**Interfaces:**
- Produces: `openDatabase(): Promise<IDBDatabase>`, `runRequest(storeName, mode, fn): Promise<any>`, `DB_NAME: string` — all named exports of `dbCore.js`, used by both `db.js` and the new `parentReportDb.js` (Task 2).

- [ ] **Step 1: Write the failing migration test**

Create `tests/dbCore.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { DB_NAME } from '../src/storage/dbCore.js';

function deleteDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

function openV1WithOldStoresOnly() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('children', { keyPath: 'id', autoIncrement: true });
      const forms = db.createObjectStore('forms', { keyPath: 'id', autoIncrement: true });
      forms.createIndex('by_childId', 'childId');
      const entries = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
      entries.createIndex('by_formId', 'formId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

describe('dbCore migration from a pre-existing version-1 database', () => {
  beforeEach(deleteDb);

  it('preserves existing v1 data and adds the new v2 stores', async () => {
    // Simulate a real user's existing v1 database, seeded with one child, before this
    // codebase's own dbCore.js has ever opened it.
    const v1db = await openV1WithOldStoresOnly();
    await new Promise((resolve, reject) => {
      const tx = v1db.transaction('children', 'readwrite');
      tx.objectStore('children').add({ name: '陳小安', birthDate: '2024-11-01' });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    v1db.close();

    // Now open through this codebase's real dbCore, which requests DB_VERSION (2).
    const { openDatabase } = await import('../src/storage/dbCore.js');
    const db = await openDatabase();

    expect([...db.objectStoreNames]).toEqual(
      expect.arrayContaining(['children', 'forms', 'entries', 'parentReports', 'coursePlanEntries', 'courseOccurrences', 'developmentRecordEntries', 'behaviorObservations', 'highlightEntries'])
    );

    const existingChildren = await new Promise((resolve, reject) => {
      const tx = db.transaction('children', 'readonly');
      const request = tx.objectStore('children').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(existingChildren).toEqual([{ id: 1, name: '陳小安', birthDate: '2024-11-01' }]);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/dbCore.test.js`
Expected: FAIL — `src/storage/dbCore.js` does not exist yet.

- [ ] **Step 3: Create `dbCore.js` by moving the shared plumbing out of `db.js`**

Create `src/storage/dbCore.js`:

```js
export const DB_NAME = 'c-form-db';
export const DB_VERSION = 2;

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('children')) {
        db.createObjectStore('children', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('forms')) {
        const forms = db.createObjectStore('forms', { keyPath: 'id', autoIncrement: true });
        forms.createIndex('by_childId', 'childId');
      }
      if (!db.objectStoreNames.contains('entries')) {
        const entries = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
        entries.createIndex('by_formId', 'formId');
      }
      if (!db.objectStoreNames.contains('parentReports')) {
        const parentReports = db.createObjectStore('parentReports', { keyPath: 'id', autoIncrement: true });
        parentReports.createIndex('by_childId', 'childId');
      }
      if (!db.objectStoreNames.contains('coursePlanEntries')) {
        const coursePlanEntries = db.createObjectStore('coursePlanEntries', { keyPath: 'id', autoIncrement: true });
        coursePlanEntries.createIndex('by_reportId', 'reportId');
      }
      if (!db.objectStoreNames.contains('courseOccurrences')) {
        const courseOccurrences = db.createObjectStore('courseOccurrences', { keyPath: 'id', autoIncrement: true });
        courseOccurrences.createIndex('by_entryId', 'entryId');
      }
      if (!db.objectStoreNames.contains('developmentRecordEntries')) {
        const developmentRecordEntries = db.createObjectStore('developmentRecordEntries', { keyPath: 'id', autoIncrement: true });
        developmentRecordEntries.createIndex('by_reportId', 'reportId');
      }
      if (!db.objectStoreNames.contains('behaviorObservations')) {
        const behaviorObservations = db.createObjectStore('behaviorObservations', { keyPath: 'id', autoIncrement: true });
        behaviorObservations.createIndex('by_reportId', 'reportId');
      }
      if (!db.objectStoreNames.contains('highlightEntries')) {
        const highlightEntries = db.createObjectStore('highlightEntries', { keyPath: 'id', autoIncrement: true });
        highlightEntries.createIndex('by_reportId', 'reportId');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function runRequest(storeName, mode, fn) {
  return openDatabase().then(
    db =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = fn(store);
        let result;
        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}
```

- [ ] **Step 4: Update `db.js` to import the shared plumbing instead of defining it**

In `src/storage/db.js`, replace the top of the file (the `DB_NAME`/`DB_VERSION`/`openDatabase`/`runRequest` block, i.e. everything before `export async function addChild`) with:

```js
import { DB_NAME, runRequest } from './dbCore.js';
```

Leave every other function in `db.js` (`addChild`, `listChildren`, `getChild`, `deleteChild`, `clearAllData`, `addForm`, `listFormsForChild`, `getForm`, `deleteForm`, `addEntry`, `updateEntry`, `deleteEntry`, `listEntriesForForm`) exactly as-is — they already call `runRequest(...)`, which now resolves via the import instead of a local definition. `clearAllData()` already uses `indexedDB.deleteDatabase(DB_NAME)`; it now gets `DB_NAME` from the import too.

- [ ] **Step 5: Run test to verify it passes**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/dbCore.test.js`
Expected: PASS

- [ ] **Step 6: Run the full suite to confirm the refactor didn't break existing storage tests**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run`
Expected: all existing tests still PASS (this step only moved code, `db.js`'s public API is unchanged)

- [ ] **Step 7: Commit**

```bash
git add src/storage/dbCore.js src/storage/db.js tests/dbCore.test.js
git commit -m "Extract shared IndexedDB plumbing into dbCore.js, bump DB_VERSION to 2"
```

---

### Task 2: `ParentReport` CRUD + cascade delete, wired into `deleteChild`

**Files:**
- Create: `src/storage/parentReportDb.js`
- Modify: `src/storage/db.js`
- Test: `tests/parentReportDb.test.js` (this task covers only the `ParentReport`-level functions; child-entity CRUD is Tasks 3–4, which extend the same file/test)

**Interfaces:**
- Consumes: `runRequest` from `./dbCore.js` (Task 1)
- Produces (for Tasks 3, 4, and later UI tasks): `addParentReport({childId, tier, period}): Promise<ParentReport>`, `listParentReportsForChild(childId): Promise<ParentReport[]>`, `getParentReport(id): Promise<ParentReport|undefined>`, `deleteParentReport(id): Promise<void>` — a `ParentReport` is `{id, childId, tier, period, createdAt}`.

- [ ] **Step 1: Write the failing test**

Create `tests/parentReportDb.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import { addParentReport, listParentReportsForChild, getParentReport, deleteParentReport } from '../src/storage/parentReportDb.js';

describe('parentReportDb: ParentReport', () => {
  let child;

  beforeEach(async () => {
    await clearAllData();
    child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
  });

  it('adds a parent report for a child and lists it back', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });

    expect(report.id).toBeTypeOf('number');
    expect(report.createdAt).toBeTypeOf('string');
    expect(await listParentReportsForChild(child.id)).toEqual([report]);
  });

  it('allows multiple reports for the same child and tier (different periods)', async () => {
    await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年05月' });
    await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });

    const reports = await listParentReportsForChild(child.id);
    expect(reports).toHaveLength(2);
    expect(reports.map(r => r.period).sort()).toEqual(['115年05月', '115年06月']);
  });

  it('gets a parent report by id', async () => {
    const created = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
    expect(await getParentReport(created.id)).toEqual(created);
  });

  it('deletes a parent report', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
    await deleteParentReport(report.id);
    expect(await getParentReport(report.id)).toBeUndefined();
    expect(await listParentReportsForChild(child.id)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportDb.test.js`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Create `parentReportDb.js` with the `ParentReport` functions**

Create `src/storage/parentReportDb.js`:

```js
import { runRequest } from './dbCore.js';

export async function addParentReport({ childId, tier, period }) {
  const createdAt = new Date().toISOString();
  const id = await runRequest('parentReports', 'readwrite', store => store.add({ childId, tier, period, createdAt }));
  return { id, childId, tier, period, createdAt };
}

export async function listParentReportsForChild(childId) {
  return runRequest('parentReports', 'readonly', store => store.index('by_childId').getAll(childId));
}

export async function getParentReport(id) {
  return runRequest('parentReports', 'readonly', store => store.get(id));
}

// Cascades: deleting a report also deletes every CoursePlanEntry (+ its CourseOccurrences),
// DevelopmentRecordEntry, BehaviorObservationEntry, and HighlightEntry (+ photo Blobs) under it.
// The child-entity delete functions themselves are added in Tasks 3-4; this function is completed
// incrementally there (see the "Extend deleteParentReport" step in Task 4).
export async function deleteParentReport(id) {
  await runRequest('parentReports', 'readwrite', store => store.delete(id));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportDb.test.js`
Expected: PASS

- [ ] **Step 5: Wire `deleteParentReport` into `deleteChild`'s cascade**

In `src/storage/db.js`, add the import and update `deleteChild`:

```js
import { deleteParentReport, listParentReportsForChild } from './parentReportDb.js';
```

```js
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
```

- [ ] **Step 6: Write the failing cascade test in `tests/db.test.js`**

Add to the `describe('children storage', ...)` block in `tests/db.test.js` (needs `addParentReport, listParentReportsForChild` imported from `../src/storage/parentReportDb.js` at the top of the file):

```js
it('deleting a child also cascades to their parent reports', async () => {
  const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
  const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });

  await deleteChild(child.id);

  expect(await listParentReportsForChild(child.id)).toEqual([]);
});
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/db.test.js tests/parentReportDb.test.js`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/storage/parentReportDb.js src/storage/db.js tests/parentReportDb.test.js tests/db.test.js
git commit -m "Add ParentReport storage CRUD, cascade into deleteChild"
```

---

### Task 3: `CoursePlanEntry` + `CourseOccurrence` CRUD (課程計畫表 storage)

**Files:**
- Modify: `src/storage/parentReportDb.js`
- Test: `tests/parentReportDb.test.js`

**Interfaces:**
- Produces: `addCoursePlanEntry({reportId, indicatorCode, activityName}): Promise<CoursePlanEntry>`, `listCoursePlanEntriesForReport(reportId): Promise<CoursePlanEntry[]>`, `updateCoursePlanEntry(id, changes): Promise<CoursePlanEntry>`, `deleteCoursePlanEntry(id): Promise<void>` (cascades to its occurrences); `addCourseOccurrence({entryId, date, status, absent, note}): Promise<CourseOccurrence>`, `listCourseOccurrencesForEntry(entryId): Promise<CourseOccurrence[]>`, `updateCourseOccurrence(id, changes): Promise<CourseOccurrence>`, `deleteCourseOccurrence(id): Promise<void>`. `status` is the string `'developed'` or `'developing'`; `absent` is boolean.

- [ ] **Step 1: Write the failing tests**

Append to `tests/parentReportDb.test.js` (add `addCoursePlanEntry, listCoursePlanEntriesForReport, updateCoursePlanEntry, deleteCoursePlanEntry, addCourseOccurrence, listCourseOccurrencesForEntry, updateCourseOccurrence, deleteCourseOccurrence` to the existing import line):

```js
describe('parentReportDb: CoursePlanEntry and CourseOccurrence', () => {
  let child, report;

  beforeEach(async () => {
    await clearAllData();
    child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
  });

  it('adds a course plan entry and lists it back', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });

    expect(entry.id).toBeTypeOf('number');
    expect(await listCoursePlanEntriesForReport(report.id)).toEqual([entry]);
  });

  it('updates a course plan entry activity name', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });
    const updated = await updateCoursePlanEntry(entry.id, { activityName: '塗鴉高手' });
    expect(updated.activityName).toBe('塗鴉高手');
    expect(updated.indicatorCode).toBe('Ⅴ-1-6');
  });

  it('adds, updates and lists course occurrences for an entry', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });

    const occurrence = await addCourseOccurrence({
      entryId: entry.id, date: '2026-06-11', status: 'developed', absent: false, note: '小安能拿著海綿印章在水畫布上畫畫',
    });
    expect(occurrence.id).toBeTypeOf('number');
    expect(await listCourseOccurrencesForEntry(entry.id)).toEqual([occurrence]);

    const updated = await updateCourseOccurrence(occurrence.id, { status: 'developing' });
    expect(updated.status).toBe('developing');
    expect(updated.date).toBe('2026-06-11');
  });

  it('deletes a course occurrence', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });
    const occurrence = await addCourseOccurrence({ entryId: entry.id, date: '2026-06-11', status: 'developed', absent: false, note: 'x' });

    await deleteCourseOccurrence(occurrence.id);

    expect(await listCourseOccurrencesForEntry(entry.id)).toEqual([]);
  });

  it('deleting a course plan entry cascades to its occurrences', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });
    const otherEntry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-4-2', activityName: '照顧小娃娃' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-06-11', status: 'developed', absent: false, note: 'x' });
    const otherOccurrence = await addCourseOccurrence({ entryId: otherEntry.id, date: '2026-06-24', status: 'developed', absent: false, note: '不受影響' });

    await deleteCoursePlanEntry(entry.id);

    expect(await listCoursePlanEntriesForReport(report.id)).toEqual([otherEntry]);
    expect(await listCourseOccurrencesForEntry(entry.id)).toEqual([]);
    expect(await listCourseOccurrencesForEntry(otherEntry.id)).toEqual([otherOccurrence]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportDb.test.js`
Expected: FAIL — functions not exported yet.

- [ ] **Step 3: Append the functions to `parentReportDb.js`**

```js
export async function addCoursePlanEntry({ reportId, indicatorCode, activityName }) {
  const id = await runRequest('coursePlanEntries', 'readwrite', store => store.add({ reportId, indicatorCode, activityName }));
  return { id, reportId, indicatorCode, activityName };
}

export async function listCoursePlanEntriesForReport(reportId) {
  return runRequest('coursePlanEntries', 'readonly', store => store.index('by_reportId').getAll(reportId));
}

export async function updateCoursePlanEntry(id, changes) {
  const existing = await runRequest('coursePlanEntries', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`CoursePlanEntry ${id} not found`);
  const updated = { ...existing, ...changes, id };
  await runRequest('coursePlanEntries', 'readwrite', store => store.put(updated));
  return updated;
}

// Cascades: deleting an entry also deletes every CourseOccurrence under it.
export async function deleteCoursePlanEntry(id) {
  const occurrences = await listCourseOccurrencesForEntry(id);
  for (const occurrence of occurrences) {
    await deleteCourseOccurrence(occurrence.id);
  }
  await runRequest('coursePlanEntries', 'readwrite', store => store.delete(id));
}

export async function addCourseOccurrence({ entryId, date, status, absent, note }) {
  const id = await runRequest('courseOccurrences', 'readwrite', store => store.add({ entryId, date, status, absent, note }));
  return { id, entryId, date, status, absent, note };
}

export async function listCourseOccurrencesForEntry(entryId) {
  return runRequest('courseOccurrences', 'readonly', store => store.index('by_entryId').getAll(entryId));
}

export async function updateCourseOccurrence(id, changes) {
  const existing = await runRequest('courseOccurrences', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`CourseOccurrence ${id} not found`);
  const updated = { ...existing, ...changes, id };
  await runRequest('courseOccurrences', 'readwrite', store => store.put(updated));
  return updated;
}

export async function deleteCourseOccurrence(id) {
  await runRequest('courseOccurrences', 'readwrite', store => store.delete(id));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportDb.test.js`
Expected: PASS

- [ ] **Step 5: Extend `deleteParentReport` to cascade into course plan entries**

Update `deleteParentReport` in `parentReportDb.js` (function ordering in the file means `listCoursePlanEntriesForReport`/`deleteCoursePlanEntry` must already be defined above it, or rely on hoisting since these are all `export async function` declarations — hoisting works regardless of order, matching the existing pattern in `db.js`):

```js
export async function deleteParentReport(id) {
  const coursePlanEntries = await listCoursePlanEntriesForReport(id);
  for (const entry of coursePlanEntries) {
    await deleteCoursePlanEntry(entry.id);
  }
  await runRequest('parentReports', 'readwrite', store => store.delete(id));
}
```

Add a test to the `ParentReport` describe block in `tests/parentReportDb.test.js`:

```js
it('deleting a parent report cascades to its course plan entries and occurrences', async () => {
  const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
  const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });
  await addCourseOccurrence({ entryId: entry.id, date: '2026-06-11', status: 'developed', absent: false, note: 'x' });

  await deleteParentReport(report.id);

  expect(await listCoursePlanEntriesForReport(report.id)).toEqual([]);
  expect(await listCourseOccurrencesForEntry(entry.id)).toEqual([]);
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportDb.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/storage/parentReportDb.js tests/parentReportDb.test.js
git commit -m "Add CoursePlanEntry/CourseOccurrence storage CRUD with cascade deletes"
```

---

### Task 4: `DevelopmentRecordEntry`, `BehaviorObservationEntry`, `HighlightEntry` CRUD

**Files:**
- Modify: `src/storage/parentReportDb.js`
- Test: `tests/parentReportDb.test.js`

**Interfaces:**
- Produces: `addDevelopmentRecordEntry({reportId, domain, courseEntryIds, narrative}): Promise<DevelopmentRecordEntry>`, `listDevelopmentRecordEntriesForReport(reportId)`, `updateDevelopmentRecordEntry(id, changes)`, `deleteDevelopmentRecordEntry(id)`; `addBehaviorObservation({reportId, title, narrative})`, `listBehaviorObservationsForReport(reportId)`, `updateBehaviorObservation(id, changes)`, `deleteBehaviorObservation(id)`; `addHighlightEntry({reportId, photos, caption})`, `listHighlightEntriesForReport(reportId)`, `updateHighlightEntry(id, changes)`, `deleteHighlightEntry(id)`. `courseEntryIds` is an array of `CoursePlanEntry` ids. `photos` is an array (1–3 items) of `{blob, width, height}` (see Task 5).

- [ ] **Step 1: Write the failing tests**

Append to `tests/parentReportDb.test.js` (extend the import line with the eleven new names):

```js
describe('parentReportDb: DevelopmentRecordEntry, BehaviorObservationEntry, HighlightEntry', () => {
  let child, report, entry;

  beforeEach(async () => {
    await clearAllData();
    child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
    report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
    entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });
  });

  it('adds, lists, and updates a development record entry', async () => {
    const record = await addDevelopmentRecordEntry({
      reportId: report.id, domain: 1, courseEntryIds: [entry.id], narrative: '小安在畫布上盡情塗鴉',
    });
    expect(await listDevelopmentRecordEntriesForReport(report.id)).toEqual([record]);

    const updated = await updateDevelopmentRecordEntry(record.id, { narrative: '修改後的敘述' });
    expect(updated.narrative).toBe('修改後的敘述');
  });

  it('deletes a development record entry', async () => {
    const record = await addDevelopmentRecordEntry({ reportId: report.id, domain: 1, courseEntryIds: [entry.id], narrative: 'x' });
    await deleteDevelopmentRecordEntry(record.id);
    expect(await listDevelopmentRecordEntriesForReport(report.id)).toEqual([]);
  });

  it('adds, lists, updates and deletes a behavior observation', async () => {
    const observation = await addBehaviorObservation({ reportId: report.id, title: '我會好好說！', narrative: '本月觀察發現...' });
    expect(await listBehaviorObservationsForReport(report.id)).toEqual([observation]);

    const updated = await updateBehaviorObservation(observation.id, { title: '新標題' });
    expect(updated.title).toBe('新標題');

    await deleteBehaviorObservation(observation.id);
    expect(await listBehaviorObservationsForReport(report.id)).toEqual([]);
  });

  it('adds, lists, updates and deletes a highlight entry', async () => {
    const photo = { blob: new Blob(['x'], { type: 'image/jpeg' }), width: 100, height: 80 };
    const highlight = await addHighlightEntry({ reportId: report.id, photos: [photo], caption: '我最喜歡騎車車了！' });
    expect(await listHighlightEntriesForReport(report.id)).toEqual([highlight]);

    const updated = await updateHighlightEntry(highlight.id, { caption: '新的說明' });
    expect(updated.caption).toBe('新的說明');

    await deleteHighlightEntry(highlight.id);
    expect(await listHighlightEntriesForReport(report.id)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportDb.test.js`
Expected: FAIL — functions not exported yet.

- [ ] **Step 3: Append the functions to `parentReportDb.js`**

```js
export async function addDevelopmentRecordEntry({ reportId, domain, courseEntryIds, narrative }) {
  const id = await runRequest('developmentRecordEntries', 'readwrite', store =>
    store.add({ reportId, domain, courseEntryIds, narrative })
  );
  return { id, reportId, domain, courseEntryIds, narrative };
}

export async function listDevelopmentRecordEntriesForReport(reportId) {
  return runRequest('developmentRecordEntries', 'readonly', store => store.index('by_reportId').getAll(reportId));
}

export async function updateDevelopmentRecordEntry(id, changes) {
  const existing = await runRequest('developmentRecordEntries', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`DevelopmentRecordEntry ${id} not found`);
  const updated = { ...existing, ...changes, id };
  await runRequest('developmentRecordEntries', 'readwrite', store => store.put(updated));
  return updated;
}

export async function deleteDevelopmentRecordEntry(id) {
  await runRequest('developmentRecordEntries', 'readwrite', store => store.delete(id));
}

export async function addBehaviorObservation({ reportId, title, narrative }) {
  const id = await runRequest('behaviorObservations', 'readwrite', store => store.add({ reportId, title, narrative }));
  return { id, reportId, title, narrative };
}

export async function listBehaviorObservationsForReport(reportId) {
  return runRequest('behaviorObservations', 'readonly', store => store.index('by_reportId').getAll(reportId));
}

export async function updateBehaviorObservation(id, changes) {
  const existing = await runRequest('behaviorObservations', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`BehaviorObservation ${id} not found`);
  const updated = { ...existing, ...changes, id };
  await runRequest('behaviorObservations', 'readwrite', store => store.put(updated));
  return updated;
}

export async function deleteBehaviorObservation(id) {
  await runRequest('behaviorObservations', 'readwrite', store => store.delete(id));
}

export async function addHighlightEntry({ reportId, photos, caption }) {
  const id = await runRequest('highlightEntries', 'readwrite', store => store.add({ reportId, photos, caption }));
  return { id, reportId, photos, caption };
}

export async function listHighlightEntriesForReport(reportId) {
  return runRequest('highlightEntries', 'readonly', store => store.index('by_reportId').getAll(reportId));
}

export async function updateHighlightEntry(id, changes) {
  const existing = await runRequest('highlightEntries', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`HighlightEntry ${id} not found`);
  const updated = { ...existing, ...changes, id };
  await runRequest('highlightEntries', 'readwrite', store => store.put(updated));
  return updated;
}

export async function deleteHighlightEntry(id) {
  await runRequest('highlightEntries', 'readwrite', store => store.delete(id));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportDb.test.js`
Expected: PASS

- [ ] **Step 5: Finish `deleteParentReport`'s cascade to cover all five child entities**

Update `deleteParentReport` in `parentReportDb.js`:

```js
export async function deleteParentReport(id) {
  const coursePlanEntries = await listCoursePlanEntriesForReport(id);
  for (const entry of coursePlanEntries) {
    await deleteCoursePlanEntry(entry.id);
  }
  const developmentRecordEntries = await listDevelopmentRecordEntriesForReport(id);
  for (const record of developmentRecordEntries) {
    await deleteDevelopmentRecordEntry(record.id);
  }
  const behaviorObservations = await listBehaviorObservationsForReport(id);
  for (const observation of behaviorObservations) {
    await deleteBehaviorObservation(observation.id);
  }
  const highlightEntries = await listHighlightEntriesForReport(id);
  for (const highlight of highlightEntries) {
    await deleteHighlightEntry(highlight.id);
  }
  await runRequest('parentReports', 'readwrite', store => store.delete(id));
}
```

Add a test to the `ParentReport` describe block confirming the full cascade:

```js
it('deleting a parent report cascades to development records, behavior observations, and highlights', async () => {
  const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
  const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });
  const record = await addDevelopmentRecordEntry({ reportId: report.id, domain: 1, courseEntryIds: [entry.id], narrative: 'x' });
  const observation = await addBehaviorObservation({ reportId: report.id, title: 'x', narrative: 'y' });
  const highlight = await addHighlightEntry({
    reportId: report.id, photos: [{ blob: new Blob(['x']), width: 1, height: 1 }], caption: 'x',
  });

  await deleteParentReport(report.id);

  expect(await listDevelopmentRecordEntriesForReport(report.id)).toEqual([]);
  expect(await listBehaviorObservationsForReport(report.id)).toEqual([]);
  expect(await listHighlightEntriesForReport(report.id)).toEqual([]);
});
```

- [ ] **Step 6: Run the full parentReportDb test file**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportDb.test.js`
Expected: PASS (all describe blocks)

- [ ] **Step 7: Commit**

```bash
git add src/storage/parentReportDb.js tests/parentReportDb.test.js
git commit -m "Add DevelopmentRecordEntry/BehaviorObservation/HighlightEntry CRUD, complete ParentReport cascade"
```

---

### Task 5: Photo compression (`src/media/imagePreprocess.js`)

**Files:**
- Create: `src/media/imagePreprocess.js`
- Test: `tests/imagePreprocess.test.js`

**Interfaces:**
- Produces: `calculateTargetDimensions(width, height, maxEdge): {width, height}` (pure, fully unit-testable), `compressImage(file, {maxEdge = 1600, quality = 0.8} = {}): Promise<{blob, width, height}>` (Canvas-based — not runnable under `jsdom`, see Step 4). Consumed by `highlightsTabView.js` (Task 15).

**Note on why `compressImage` itself isn't unit tested:** `jsdom` does not implement a working 2D canvas context (`getContext('2d')` returns `null`) without the native `canvas` npm package, which this project deliberately avoids as a dependency (native/compiled, install friction on Windows, not needed for the shipped browser bundle). `calculateTargetDimensions` is extracted as a pure function specifically so the sizing logic is still unit-tested; `compressImage`'s actual Canvas drawing is verified manually in a real browser during Task 15 (the same Puppeteer-driven-real-Edge methodology already used elsewhere in this project), not via `vitest`.

- [ ] **Step 1: Write the failing test for the pure sizing function**

Create `tests/imagePreprocess.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { calculateTargetDimensions } from '../src/media/imagePreprocess.js';

describe('calculateTargetDimensions', () => {
  it('leaves an image untouched if already within maxEdge', () => {
    expect(calculateTargetDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('scales down a landscape image so the longer edge equals maxEdge, preserving aspect ratio', () => {
    expect(calculateTargetDimensions(3200, 2400, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it('scales down a portrait image so the longer edge equals maxEdge, preserving aspect ratio', () => {
    expect(calculateTargetDimensions(2400, 3200, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('never upscales a smaller image', () => {
    expect(calculateTargetDimensions(400, 300, 1600)).toEqual({ width: 400, height: 300 });
  });

  it('rounds to whole pixels', () => {
    expect(calculateTargetDimensions(3000, 1999, 1600)).toEqual({ width: 1600, height: 1066 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/imagePreprocess.test.js`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Create `imagePreprocess.js`**

```js
export function calculateTargetDimensions(width, height, maxEdge) {
  const longerEdge = Math.max(width, height);
  if (longerEdge <= maxEdge) return { width, height };

  const scale = maxEdge / longerEdge;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// Draws `file` onto an offscreen canvas at a reduced size/quality and returns the compressed
// result plus its final pixel dimensions (needed later to size the image correctly in the docx
// export, since photos arrive in whatever aspect ratio the phone camera used).
export async function compressImage(file, { maxEdge = 1600, quality = 0.8 } = {}) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('無法讀取這張照片'));
      img.src = objectUrl;
    });

    const { width, height } = calculateTargetDimensions(image.naturalWidth, image.naturalHeight, maxEdge);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/imagePreprocess.test.js`
Expected: PASS (only `calculateTargetDimensions` is exercised here; `compressImage` is verified manually in Task 15)

- [ ] **Step 5: Commit**

```bash
git add src/media/imagePreprocess.js tests/imagePreprocess.test.js
git commit -m "Add photo compression helper for 點滴分享 uploads"
```

---

### Task 6: Extract `docxShared.js` from `docxExport.js` (no behavior change)

**Files:**
- Create: `src/export/docxShared.js`
- Modify: `src/export/docxExport.js`
- Test: existing `tests/docxExport.test.js` and `tests/docxExport.acceptance.test.js` must still pass unmodified — they are this task's regression test.

**Interfaces:**
- Produces (for Task 7–8's `parentReportDocxExport.js`): `FONT`, `runFont()`, `textParagraph(text, opts)`, `emptyParagraph()`, `PAGE_SIZE`, `HEADER_ICON_EMU`, `EMU_PER_PIXEL`, `HEADER_ICON_BASE64`, `headerIconRunAt(offsetEmu)` (generalized from the current `headerIconRun()` — see Step 3), `toRocDate(isoDate)`.

- [ ] **Step 1: Create `docxShared.js` with the pieces every docx export needs**

Create `src/export/docxShared.js`:

```js
import {
  HorizontalPositionRelativeFrom,
  ImageRun,
  Paragraph,
  TextRun,
  TextWrappingSide,
  TextWrappingType,
  VerticalPositionRelativeFrom,
} from 'docx';

// Standard Taiwanese official-document font, matching every original form sample.
export const FONT = '標楷體';

// Default run size in half-points (24 = 12pt), matching every original form sample's <w:docDefaults>.
export const DEFAULT_TEXT_SIZE = 24;

// Page size in twips, A4 — shared by every exported document type. Page *margins* differ per
// document type (see each export module) and are NOT shared here.
export const PAGE_SIZE = { width: 11906, height: 16838 };

// The institution badge icon size, in EMU (copied from the 陳小安C表-2.docx sample's <wp:extent>).
export const HEADER_ICON_EMU = { width: 439420, height: 448310 };
export const EMU_PER_PIXEL = 9525; // docx's ImageRun transformation takes pixels and multiplies by this.

// word/media/image1.png extracted from the real C表 sample: a 122x124 PNG badge shown beside every
// header title in this app's exported documents. Inlined as base64 so the built single-file app
// stays self-contained.
// The value below is a placeholder for THIS PLAN DOCUMENT ONLY, to avoid repeating a multi-KB
// base64 string twice in this file. Do not type this placeholder into the real source file —
// see Step 2, which copies the real value verbatim from the existing docxExport.js.
export const HEADER_ICON_BASE64 = 'REPLACE_ME_SEE_STEP_2';

function runFont() {
  return { ascii: FONT, eastAsia: FONT, hAnsi: FONT, cs: FONT };
}

export function textParagraph(text, { bold = false, size = DEFAULT_TEXT_SIZE, alignment } = {}) {
  return new Paragraph({
    ...(alignment ? { alignment } : {}),
    children: [
      new TextRun({
        text: String(text ?? ''),
        font: runFont(),
        size,
        ...(bold ? { bold: true } : {}),
      }),
    ],
  });
}

export function emptyParagraph() {
  return new Paragraph({ children: [] });
}

// A floating header icon at an arbitrary offset — used with a document-type-specific offset so
// the title can stay centered on the full page width regardless of that document's own margins.
export function headerIconRunAt(offsetEmu) {
  return new ImageRun({
    type: 'png',
    data: HEADER_ICON_BASE64,
    altText: { name: 'image1.png', title: 'image1.png', description: '機構標誌' },
    transformation: {
      width: HEADER_ICON_EMU.width / EMU_PER_PIXEL,
      height: HEADER_ICON_EMU.height / EMU_PER_PIXEL,
    },
    floating: {
      allowOverlap: true,
      layoutInCell: true,
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.COLUMN, offset: offsetEmu.horizontal },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: offsetEmu.vertical },
      wrap: { type: TextWrappingType.SQUARE, side: TextWrappingSide.BOTH_SIDES },
    },
  });
}

// 2024-11-01 -> 113/11/01
export function toRocDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate ?? ''));
  if (!match) return String(isoDate ?? '');
  return `${Number(match[1]) - 1911}/${match[2]}/${match[3]}`;
}
```

- [ ] **Step 2: Copy the real base64 string verbatim**

Open `src/export/docxExport.js`, find the `HEADER_ICON_BASE64` constant (a single very long base64 string literal, starts with `'iVBORw0KGgo...'`), and copy that exact string as the value of `HEADER_ICON_BASE64` in the new `docxShared.js`, replacing the `'REPLACE_ME_SEE_STEP_2'` placeholder from Step 1 entirely. Copy it with a file operation (or editor find able to select the full literal) rather than retyping — it is long and must match byte-for-byte.

- [ ] **Step 3: Update `docxExport.js` to import the shared pieces instead of defining them**

In `src/export/docxExport.js`:
- Remove the now-duplicated definitions: `FONT`, `DEFAULT_TEXT_SIZE`, `PAGE_SIZE`, `HEADER_ICON_EMU`, `EMU_PER_PIXEL`, `HEADER_ICON_BASE64`, `runFont()`, `textParagraph()`, `emptyParagraph()`, `toRocDate()`.
- Add: `import { FONT, DEFAULT_TEXT_SIZE, PAGE_SIZE, HEADER_ICON_EMU, EMU_PER_PIXEL, textParagraph, emptyParagraph, headerIconRunAt, toRocDate } from './docxShared.js';`
- Replace the existing `headerIconRun()` function (which built the C表-specific floating offset) with a call to the shared `headerIconRunAt(HEADER_ICON_OFFSET_EMU)` at its one call site inside `pageHeader()` — keep `HEADER_ICON_OFFSET_EMU` itself defined locally in `docxExport.js` (it depends on this document's own margins, so it is NOT part of the shared module). Delete the now-unused local `headerIconRun` function.
- Every other constant/function in `docxExport.js` (`INSTITUTION_NAME`, `COLUMN_WIDTHS`, `TABLE_WIDTH_DXA`, `TABLE_CELL_MARGIN_DXA`, `PAGE_MARGIN`, `HEADER_TITLE_SIZE`, `TABLE_HEADER_ROW_HEIGHTS`, signature line constants, `buildIndicatorRowGroups`, `buildIndicatorRows`, `bodyRow`, `headerRows`, `pageHeader`, `generateDocxBlob`, `downloadDocx`, etc.) stays exactly as-is — this task only moves the generic pieces, it does not change any C表-specific behavior or output.

- [ ] **Step 4: Run the existing docx export tests to confirm no behavior changed**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/docxExport.test.js tests/docxExport.acceptance.test.js`
Expected: PASS, unmodified — this is the regression check for the refactor.

- [ ] **Step 5: Run the full suite**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/export/docxShared.js src/export/docxExport.js
git commit -m "Extract shared docx export helpers into docxShared.js"
```

---

### Task 7: 課程計畫表 table in `parentReportDocxExport.js`

**Files:**
- Create: `src/export/parentReportDocxExport.js`
- Test: `tests/parentReportDocxExport.test.js`

**Interfaces:**
- Consumes: `getIndicator(code)` from `../data/indicators.js` (for domain/description lookup), `TIERS` from same, shared helpers from `./docxShared.js`.
- Produces (for later steps in this task, and Tasks 8–9): `buildCoursePlanRowGroups(entries, occurrencesByEntryId)` (pure, testable — mirrors `buildIndicatorRowGroups` in `docxExport.js`), `buildCoursePlanTable(entries, occurrencesByEntryId)` (returns a `docx` `Table`).

All constants below were extracted directly from the real reference sample's OOXML (`<w:tblGrid>`, `<w:shd w:fill=...>`, `<w:pgMar>`) — do not alter them.

- [ ] **Step 1: Write the failing test for the pure grouping function**

Create `tests/parentReportDocxExport.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildCoursePlanRowGroups } from '../src/export/parentReportDocxExport.js';

const entries = [
  { id: 1, reportId: 1, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' },
  { id: 2, reportId: 1, indicatorCode: 'Ⅴ-4-6', activityName: '我愛塗鴉' }, // same domain (認知探索/身體動作 differ — see below), different indicator
  { id: 3, reportId: 1, indicatorCode: 'Ⅴ-2-2', activityName: '香蕉鬆餅' },
];

describe('buildCoursePlanRowGroups', () => {
  it('flags the first entry of each domain, grouping by the indicator code prefix domain digit', () => {
    // Ⅴ-1-6 -> domain 1 (身體動作), Ⅴ-4-6 -> domain 4 (認知探索), Ⅴ-2-2 -> domain 2 (社會情緒):
    // three different domains, so every entry starts a new domain group.
    const groups = buildCoursePlanRowGroups(entries, {});
    expect(groups.map(g => g.isFirstEntryOfDomain)).toEqual([true, true, true]);
  });

  it('does not flag a second entry in the same domain as starting a new group', () => {
    const sameDomainEntries = [
      { id: 1, reportId: 1, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' },
      { id: 2, reportId: 1, indicatorCode: 'Ⅴ-1-4', activityName: '踢球球' },
    ];
    const groups = buildCoursePlanRowGroups(sameDomainEntries, {});
    expect(groups.map(g => g.isFirstEntryOfDomain)).toEqual([true, false]);
  });

  it('emits one blank row for an entry with no occurrences', () => {
    const groups = buildCoursePlanRowGroups([entries[0]], {});
    expect(groups[0].rows).toEqual([{ date: '', status: null, absent: false, note: '' }]);
  });

  it('emits one row per occurrence, preserving insertion order', () => {
    const occurrencesByEntryId = {
      1: [
        { date: '2026-06-11', status: 'developed', absent: false, note: '小安能拿著海綿印章畫畫' },
        { date: '2026-06-18', status: 'developing', absent: false, note: '練習中' },
      ],
    };
    const groups = buildCoursePlanRowGroups([entries[0]], occurrencesByEntryId);
    expect(groups[0].rows).toEqual([
      { date: '2026-06-11', status: 'developed', absent: false, note: '小安能拿著海綿印章畫畫' },
      { date: '2026-06-18', status: 'developing', absent: false, note: '練習中' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportDocxExport.test.js`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Create `parentReportDocxExport.js` with constants and the pure grouping function**

Create `src/export/parentReportDocxExport.js`:

```js
import {
  AlignmentType, Document, Header, HeightRule, HorizontalPositionRelativeFrom, Packer, Paragraph,
  ShadingType, Table, TableCell, TableRow, TableLayoutType, TextRun, TextWrappingSide,
  TextWrappingType, VerticalAlign, VerticalMergeType, VerticalPositionRelativeFrom, WidthType,
} from 'docx';
import { TIERS, getIndicator } from '../data/indicators.js';
import {
  FONT, DEFAULT_TEXT_SIZE, PAGE_SIZE, HEADER_ICON_EMU, EMU_PER_PIXEL,
  textParagraph, emptyParagraph, headerIconRunAt, toRocDate,
} from './docxShared.js';
import { calculateAgeInMonths } from '../domain/ageTier.js';

// This document type ("每月課程計畫表" / "每月嬰幼兒適性發展紀錄表") is issued under a different
// institution name than 適性總表's C表 sample — copied verbatim from the real reference PDF header.
const INSTITUTION_NAME = '屏東縣內埔鄉育英公設民營托嬰中心';

// Page margins in twips, copied from the real reference sample's <w:pgMar> — narrower and uniform
// on all four sides, unlike 適性總表's C表 margins. Do not reuse docxExport.js's PAGE_MARGIN.
const PAGE_MARGIN = { top: 720, right: 720, bottom: 720, left: 720, header: 851, footer: 992 };

// Title size in half-points: 36 half-points = 18pt (適性總表 uses 34 = 17pt — different, verified
// against the real sample, do not "fix" to match).
const TITLE_SIZE = 36;

// 課程計畫表 column widths in DXA, copied from the real sample's <w:tblGrid>: 發展領域｜指標｜
// 活動名稱/能力指標｜課程實施日期｜說明.
const COURSE_PLAN_COLUMN_WIDTHS = [1489, 1122, 2966, 1570, 3616];
const COURSE_PLAN_TABLE_WIDTH_DXA = COURSE_PLAN_COLUMN_WIDTHS.reduce((sum, w) => sum + w, 0);
const TABLE_CELL_MARGIN_DXA = 115;

// Domain cell shading fills, read directly from the real sample's <w:shd w:fill="...">, keyed by
// the same domain id (1-5) used in src/data/indicators.js. Do not invent different colors — these
// are the actual template's colors, not a UI aesthetic choice.
const DOMAIN_FILL_COLORS = { 1: 'FBE4D5', 2: 'FFE1FF', 3: 'FFF2CC', 4: 'BDD6EE', 5: '9CC2E5' };

// "19-24個月" (as stored in TIERS[].label) -> "(19~24 個月)", matching the real sample's title
// formatting exactly (tilde instead of hyphen, a space before 個月, wrapped in parentheses).
function parentReportTierLabel(tierCode) {
  const tier = TIERS.find(t => t.code === tierCode);
  if (!tier) return '';
  return `(${tier.label.replace(/(\d+)-(\d+)個月/, '$1~$2 個月')})`;
}

// Mirrors docxExport.js's buildIndicatorRowGroups: groups CoursePlanEntries so the 發展領域 column
// can merge across every entry that shares a domain, and the 指標/活動名稱 columns can merge across
// every occurrence row of one entry. Domain is looked up via the entry's own indicatorCode (not
// stored redundantly on the entry) so it always reflects the current indicator reference data.
export function buildCoursePlanRowGroups(entries, occurrencesByEntryId) {
  let previousDomain = null;

  return entries.map(entry => {
    const indicator = getIndicator(entry.indicatorCode);
    const domain = indicator ? indicator.domain : null;
    const isFirstEntryOfDomain = domain !== previousDomain;
    previousDomain = domain;

    const occurrences = occurrencesByEntryId[entry.id] || [];
    const rows =
      occurrences.length === 0
        ? [{ date: '', status: null, absent: false, note: '' }]
        : occurrences.map(o => ({ date: o.date, status: o.status, absent: o.absent, note: o.note }));

    return { entry, indicator, domain, rows, isFirstEntryOfDomain };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportDocxExport.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/export/parentReportDocxExport.js tests/parentReportDocxExport.test.js
git commit -m "Add parentReportDocxExport.js scaffolding and course-plan row grouping"
```

---

### Task 8: Build the 課程計畫表 docx `Table` (merges, ○/△ symbols, strikethrough)

**Files:**
- Modify: `src/export/parentReportDocxExport.js`
- Test: `tests/parentReportDocxExport.test.js`

**Interfaces:**
- Produces: `buildCoursePlanTable(entries, occurrencesByEntryId): Table`

- [ ] **Step 1: Write the failing acceptance-style tests**

Append to `tests/parentReportDocxExport.test.js` (add `buildCoursePlanTable` to the import, plus `Packer` and `JSZip` — see helper below):

```js
import { Document, Packer } from 'docx';
import JSZip from 'jszip';

async function tableToXml(table) {
  const doc = new Document({ sections: [{ children: [table] }] });
  const blob = await Packer.toBlob(doc);
  const zip = await JSZip.loadAsync(blob);
  return zip.file('word/document.xml').async('text');
}

describe('buildCoursePlanTable', () => {
  const entries = [
    { id: 1, reportId: 1, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' },
  ];

  it('renders the indicator code, activity name, and indicator description', async () => {
    const xml = await tableToXml(buildCoursePlanTable(entries, {}));
    expect(xml).toContain('Ⅴ-1-6');
    expect(xml).toContain('我愛畫畫');
    expect(xml).toContain('能拿筆塗鴉'); // Ⅴ-1-6's official description from indicators.js
  });

  it('writes an achieved occurrence as MM/DD○, a developing one as MM/DD△', async () => {
    const occurrencesByEntryId = {
      1: [
        { date: '2026-06-11', status: 'developed', absent: false, note: 'a' },
        { date: '2026-06-18', status: 'developing', absent: false, note: 'b' },
      ],
    };
    const xml = await tableToXml(buildCoursePlanTable(entries, occurrencesByEntryId));
    expect(xml).toContain('06/11○');
    expect(xml).toContain('06/18△');
  });

  it('marks an absent occurrence with strikethrough and no ○/△ symbol', async () => {
    const occurrencesByEntryId = {
      1: [{ date: '2026-06-10', status: 'developed', absent: true, note: '請假' }],
    };
    const xml = await tableToXml(buildCoursePlanTable(entries, occurrencesByEntryId));
    expect(xml).toContain('06/10');
    expect(xml).not.toContain('06/10○');
    expect(xml).not.toContain('06/10△');
    expect(xml).toMatch(/<w:strike\s*\/>[\s\S]{0,400}06\/10/);
    expect(xml).toMatch(/<w:strike\s*\/>[\s\S]{0,400}請假/);
  });

  it('shades the domain cell with that domain\'s fill color', async () => {
    const xml = await tableToXml(buildCoursePlanTable(entries, {}));
    expect(xml).toContain('w:fill="FBE4D5"'); // Ⅴ-1-6 -> domain 1 身體動作
  });

  it('merges the 發展領域 cell across every entry of the same domain', async () => {
    const sameDomainEntries = [
      { id: 1, reportId: 1, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' },
      { id: 2, reportId: 1, indicatorCode: 'Ⅴ-1-4', activityName: '踢球球' },
    ];
    const xml = await tableToXml(buildCoursePlanTable(sameDomainEntries, {}));
    expect(xml).toContain('w:val="restart"');
    expect((xml.match(/<w:vMerge/g) || []).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportDocxExport.test.js`
Expected: FAIL — `buildCoursePlanTable` not exported yet.

- [ ] **Step 3: Append the table-building code to `parentReportDocxExport.js`**

```js
const CENTERED = { alignment: AlignmentType.CENTER };

function cellWidth(index) {
  return { size: COURSE_PLAN_COLUMN_WIDTHS[index], type: WidthType.DXA };
}

function coursePlanHeaderRow() {
  const labels = ['發展領域', '指標', '活動名稱/能力指標', '課程實施日期【已發展○】\n【發展中△】', '說明'];
  return new TableRow({
    children: labels.map((label, index) =>
      new TableCell({
        width: cellWidth(index),
        verticalAlign: VerticalAlign.CENTER,
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'D9D9D9' },
        children: label.split('\n').map(line => textParagraph(line, { bold: true, ...CENTERED })),
      })
    ),
  });
}

function mergedCell(index, children, isFirstRowOfMerge, extra = {}) {
  return new TableCell({
    width: cellWidth(index),
    verticalAlign: VerticalAlign.CENTER,
    verticalMerge: isFirstRowOfMerge ? VerticalMergeType.RESTART : VerticalMergeType.CONTINUE,
    children: isFirstRowOfMerge ? children : [emptyParagraph()],
    ...extra,
  });
}

// achieved/"developing" occurrences print a plain "MM/DD" + status glyph; an absent occurrence
// instead prints the same "MM/DD" (no glyph) with a strikethrough run, per the real sample.
function occurrenceDateRun(row) {
  if (!row.date) return new TextRun({ text: '', font: { ascii: FONT, eastAsia: FONT, hAnsi: FONT, cs: FONT }, size: DEFAULT_TEXT_SIZE });
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(row.date);
  const formatted = match ? `${match[2]}/${match[3]}` : row.date;
  const glyph = row.absent ? '' : row.status === 'developed' ? '○' : row.status === 'developing' ? '△' : '';
  return new TextRun({
    text: `${formatted}${glyph}`,
    font: { ascii: FONT, eastAsia: FONT, hAnsi: FONT, cs: FONT },
    size: DEFAULT_TEXT_SIZE,
    ...(row.absent ? { strike: true } : {}),
  });
}

function occurrenceNoteRun(row) {
  return new TextRun({
    text: String(row.note ?? ''),
    font: { ascii: FONT, eastAsia: FONT, hAnsi: FONT, cs: FONT },
    size: DEFAULT_TEXT_SIZE,
    ...(row.absent ? { strike: true } : {}),
  });
}

function coursePlanBodyRow(group, row, { isFirstRowOfDomain, isFirstRowOfEntry }) {
  const domainName = group.indicator ? group.indicator.domainName : '';
  const description = group.indicator ? group.indicator.description : '';

  return new TableRow({
    children: [
      mergedCell(0, [textParagraph(domainName, { bold: true, ...CENTERED })], isFirstRowOfDomain, {
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: DOMAIN_FILL_COLORS[group.domain] || 'FFFFFF' },
      }),
      mergedCell(1, [textParagraph(group.entry.indicatorCode, CENTERED)], isFirstRowOfEntry),
      mergedCell(2, [
        textParagraph(`【${group.entry.activityName}】`),
        textParagraph(description),
      ], isFirstRowOfEntry),
      new TableCell({
        width: cellWidth(3),
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [occurrenceDateRun(row)] })],
      }),
      new TableCell({
        width: cellWidth(4),
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ children: [occurrenceNoteRun(row)] })],
      }),
    ],
  });
}

export function buildCoursePlanTable(entries, occurrencesByEntryId) {
  const groups = buildCoursePlanRowGroups(entries, occurrencesByEntryId);

  const bodyRows = groups.flatMap((group, groupIndex) =>
    group.rows.map((row, rowIndex) =>
      coursePlanBodyRow(group, row, {
        isFirstRowOfDomain: group.isFirstEntryOfDomain && rowIndex === 0,
        isFirstRowOfEntry: rowIndex === 0,
      })
    )
  );

  return new Table({
    width: { size: COURSE_PLAN_TABLE_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: COURSE_PLAN_COLUMN_WIDTHS,
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.CENTER,
    margins: { left: TABLE_CELL_MARGIN_DXA, right: TABLE_CELL_MARGIN_DXA, marginUnitType: WidthType.DXA },
    rows: [coursePlanHeaderRow(), ...bodyRows],
  });
}
```

Note: `mergedCell`'s `extra` parameter (used here to pass `shading` for the domain cell) applies that `extra` object on every call regardless of `isFirstRowOfMerge` — that is correct and required, since Word needs the `w:shd` element present on every physically-merged cell in a vertical merge, not only the "restart" cell, for the fill color to render consistently down the whole merged span.

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportDocxExport.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/export/parentReportDocxExport.js tests/parentReportDocxExport.test.js
git commit -m "Build 課程計畫表 docx table with domain shading and absent strikethrough"
```

---

### Task 9: 適性發展紀錄表 ＋ 行為觀察 docx table

**Files:**
- Modify: `src/export/parentReportDocxExport.js`
- Test: `tests/parentReportDocxExport.test.js`

**Interfaces:**
- Consumes: `CoursePlanEntry[]` (to resolve `courseEntryIds` on each `DevelopmentRecordEntry` to an indicator code + description), `getIndicator` from `../data/indicators.js`.
- Produces: `groupEntriesByDomainInFirstAppearanceOrder(entries)` (pure, testable — groups any array of `{domain, ...}` objects), `buildDevelopmentRecordTable(developmentRecordEntries, behaviorObservations, coursePlanEntries): Table`.

Implemented as a **single full-width column** table (not a copy of the reference sample's irregular 6-column grid — see the design note in Step 3), with alternating shaded-header / plain-content row pairs. This reproduces the sample's visual structure exactly (a shaded domain bar, then a bordered content block) without copying inconsistencies from the reference sample's manually-edited table grid.

- [ ] **Step 1: Write the failing tests**

Append to `tests/parentReportDocxExport.test.js` (add `groupEntriesByDomainInFirstAppearanceOrder`, `buildDevelopmentRecordTable` to the import):

```js
describe('groupEntriesByDomainInFirstAppearanceOrder', () => {
  it('groups entries by domain, in the order each domain first appears', () => {
    const entries = [
      { id: 1, domain: 2 }, { id: 2, domain: 1 }, { id: 3, domain: 2 }, { id: 4, domain: 1 },
    ];
    const groups = groupEntriesByDomainInFirstAppearanceOrder(entries);
    expect(groups.map(g => g.domain)).toEqual([2, 1]);
    expect(groups[0].entries.map(e => e.id)).toEqual([1, 3]);
    expect(groups[1].entries.map(e => e.id)).toEqual([2, 4]);
  });

  it('omits domains with no entries entirely (no empty group)', () => {
    const groups = groupEntriesByDomainInFirstAppearanceOrder([{ id: 1, domain: 3 }]);
    expect(groups).toEqual([{ domain: 3, entries: [{ id: 1, domain: 3 }] }]);
  });
});

describe('buildDevelopmentRecordTable', () => {
  const coursePlanEntries = [
    { id: 1, reportId: 1, indicatorCode: 'Ⅴ-1-4', activityName: '踢球球' },
  ];

  it('renders a shaded domain header, the referenced indicator+description list, and the narrative', async () => {
    const developmentRecordEntries = [
      { id: 1, reportId: 1, domain: 1, courseEntryIds: [1], narrative: '小安能輕輕地踢球' },
    ];
    const xml = await tableToXml(buildDevelopmentRecordTable(developmentRecordEntries, [], coursePlanEntries));

    expect(xml).toContain('身體動作');
    expect(xml).toContain('w:fill="FBE4D5"');
    expect(xml).toContain('Ⅴ-1-4');
    expect(xml).toContain('能踢球'); // Ⅴ-1-4's official description
    expect(xml).toContain('小安能輕輕地踢球');
  });

  it('appends behavior observations as their own header ("行為觀察－{title}") + narrative block', async () => {
    const behaviorObservations = [{ id: 1, reportId: 1, title: '我會好好說！', narrative: '本月觀察發現...' }];
    const xml = await tableToXml(buildDevelopmentRecordTable([], behaviorObservations, coursePlanEntries));

    expect(xml).toContain('行為觀察－我會好好說！');
    expect(xml).toContain('本月觀察發現');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportDocxExport.test.js`
Expected: FAIL — functions not exported yet.

- [ ] **Step 3: Append the grouping helper and table builder to `parentReportDocxExport.js`**

```js
export function groupEntriesByDomainInFirstAppearanceOrder(entries) {
  const order = [];
  const byDomain = new Map();
  for (const entry of entries) {
    if (!byDomain.has(entry.domain)) {
      byDomain.set(entry.domain, []);
      order.push(entry.domain);
    }
    byDomain.get(entry.domain).push(entry);
  }
  return order.map(domain => ({ domain, entries: byDomain.get(domain) }));
}

function fullWidthCell(children, fill) {
  return new TableCell({
    width: { size: COURSE_PLAN_TABLE_WIDTH_DXA, type: WidthType.DXA },
    ...(fill ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill } } : {}),
    children,
  });
}

function domainHeaderRow(label, fill) {
  return new TableRow({ children: [fullWidthCell([textParagraph(label, { bold: true, ...CENTERED })], fill)] });
}

// First-line indent (each paragraph's first line indented, matching the essay-style prose in the
// real sample) — 480 twips ≈ two 標楷體 full-width characters at 12pt.
function narrativeParagraph(text) {
  return new Paragraph({
    indent: { firstLine: 480 },
    children: [new TextRun({ text: String(text ?? ''), font: { ascii: FONT, eastAsia: FONT, hAnsi: FONT, cs: FONT }, size: DEFAULT_TEXT_SIZE })],
  });
}

function referencedIndicatorLines(courseEntryIds, coursePlanEntriesById) {
  return courseEntryIds
    .map(id => coursePlanEntriesById.get(id))
    .filter(Boolean)
    .map(entry => {
      const indicator = getIndicator(entry.indicatorCode);
      return textParagraph(`${entry.indicatorCode}　${indicator ? indicator.description : ''}`);
    });
}

export function buildDevelopmentRecordTable(developmentRecordEntries, behaviorObservations, coursePlanEntries) {
  const coursePlanEntriesById = new Map(coursePlanEntries.map(e => [e.id, e]));
  const domainGroups = groupEntriesByDomainInFirstAppearanceOrder(developmentRecordEntries);

  const rows = domainGroups.flatMap(({ domain, entries }) => {
    const domainName = entries[0] && getIndicator(coursePlanEntriesById.get(entries[0].courseEntryIds[0])?.indicatorCode)?.domainName;
    return [
      domainHeaderRow(domainName || '', DOMAIN_FILL_COLORS[domain] || 'FFFFFF'),
      new TableRow({
        children: [
          fullWidthCell(
            entries.flatMap(entry => [
              ...referencedIndicatorLines(entry.courseEntryIds, coursePlanEntriesById),
              narrativeParagraph(entry.narrative),
            ])
          ),
        ],
      }),
    ];
  });

  const behaviorRows = behaviorObservations.flatMap(observation => [
    domainHeaderRow(`行為觀察－${observation.title}`, 'D9D9D9'),
    new TableRow({ children: [fullWidthCell([narrativeParagraph(observation.narrative)])] }),
  ]);

  return new Table({
    width: { size: COURSE_PLAN_TABLE_WIDTH_DXA, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.CENTER,
    margins: { left: TABLE_CELL_MARGIN_DXA, right: TABLE_CELL_MARGIN_DXA, marginUnitType: WidthType.DXA },
    rows: [...rows, ...behaviorRows],
  });
}
```

Note on `domainName` lookup above: `DevelopmentRecordEntry` stores a numeric `domain` (1–5), not the domain's display name, so the header text is resolved by looking up any one of that group's referenced `CoursePlanEntry`s and reading `domainName` off its indicator. This assumes every `DevelopmentRecordEntry` references at least one `CoursePlanEntry` (true by construction — Task 14's UI only lets a teacher select from entries that already exist) but guard with `?.` as shown so a malformed/empty record degrades to a blank header rather than throwing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportDocxExport.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/export/parentReportDocxExport.js tests/parentReportDocxExport.test.js
git commit -m "Build 適性發展紀錄表 + 行為觀察 docx table"
```

---

### Task 10: 點滴分享 photo table, page header, signatures, and final `generateParentReportDocxBlob` assembly

**Files:**
- Modify: `src/export/parentReportDocxExport.js`
- Test: `tests/parentReportDocxExport.test.js`, `tests/parentReportDocxExport.acceptance.test.js` (new)

**Interfaces:**
- Produces: `buildHighlightsTable(highlightEntries): Promise<Table>` (async — resolves each photo `Blob` to bytes), `generateParentReportDocxBlob({child, report, coursePlanEntries, courseOccurrencesByEntryId, developmentRecordEntries, behaviorObservations, highlightEntries}): Promise<Blob>`, `downloadParentReportDocx(blob, filename)` (identical to `docxExport.js`'s `downloadDocx`, duplicated locally to keep this module's public surface self-contained — same three-line implementation, not worth sharing for something this small).

- [ ] **Step 1: Write the failing tests**

Append to `tests/parentReportDocxExport.test.js` (add `buildHighlightsTable`, `generateParentReportDocxBlob` to the import):

```js
describe('buildHighlightsTable', () => {
  it('renders 1 to 3 photos per entry side by side, plus a caption row', async () => {
    const entries = [
      { id: 1, reportId: 1, photos: [{ blob: new Blob(['a']), width: 100, height: 80 }], caption: '我最喜歡騎車車了！' },
    ];
    const table = await buildHighlightsTable(entries);
    const xml = await tableToXml(table);
    expect(xml).toContain('我最喜歡騎車車了！');
    expect(xml).toContain('<w:drawing>');
  });

  it('shades the section header with the 點滴分享 fill color', async () => {
    const table = await buildHighlightsTable([]);
    const xml = await tableToXml(table);
    expect(xml).toContain('點滴分享');
    expect(xml).toContain('w:fill="F7CAAC"');
  });
});
```

Create `tests/parentReportDocxExport.acceptance.test.js`:

```js
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { generateParentReportDocxBlob } from '../src/export/parentReportDocxExport.js';

const child = { name: '陳小安', birthDate: '2024-06-20' };
const report = { tier: 'Ⅴ', period: '115年06月' };

async function exportParts(overrides = {}) {
  const blob = await generateParentReportDocxBlob({
    child, report,
    coursePlanEntries: [], courseOccurrencesByEntryId: {},
    developmentRecordEntries: [], behaviorObservations: [], highlightEntries: [],
    ...overrides,
  });
  const zip = await JSZip.loadAsync(blob);
  const documentXml = await zip.file('word/document.xml').async('text');
  const headerFiles = zip.file(/word\/header\d*\.xml/);
  const headerXml = headerFiles.length > 0 ? await headerFiles[0].async('text') : '';
  return { documentXml, headerXml };
}

describe('generateParentReportDocxBlob acceptance', () => {
  it('titles the header with the institution name, "每月課程計畫表", and the tilde-formatted tier label', async () => {
    const { headerXml } = await exportParts();
    expect(headerXml).toContain('屏東縣內埔鄉育英公設民營托嬰中心每月課程計畫表');
    expect(headerXml).toContain('(19~24 個月)');
  });

  it('prints child name, ROC birth date, actual age, and record period in the header', async () => {
    const { headerXml } = await exportParts();
    expect(headerXml).toContain('陳小安');
    expect(headerXml).toContain('113/06/20');
    expect(headerXml).toContain('115年06月');
  });

  it('uses 標楷體 throughout', async () => {
    const { documentXml, headerXml } = await exportParts();
    expect(documentXml).toContain('標楷體');
    expect(headerXml).toContain('標楷體');
  });

  it('includes signature lines for 家長 and 托育人員／主任', async () => {
    const { documentXml } = await exportParts();
    expect(documentXml).toContain('家長簽名');
    expect(documentXml).toContain('托育人員');
    expect(documentXml).toContain('主任簽名');
  });

  it('includes all four section titles when data is present in every section', async () => {
    const coursePlanEntries = [{ id: 1, reportId: 1, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' }];
    const { documentXml } = await exportParts({
      coursePlanEntries,
      courseOccurrencesByEntryId: { 1: [{ date: '2026-06-11', status: 'developed', absent: false, note: 'x' }] },
      developmentRecordEntries: [{ id: 1, reportId: 1, domain: 1, courseEntryIds: [1], narrative: 'y' }],
      behaviorObservations: [{ id: 1, reportId: 1, title: '我會好好說！', narrative: 'z' }],
      highlightEntries: [{ id: 1, reportId: 1, photos: [{ blob: new Blob(['a']), width: 10, height: 10 }], caption: '開心！' }],
    });
    expect(documentXml).toContain('我愛畫畫');
    expect(documentXml).toContain('行為觀察－我會好好說！');
    expect(documentXml).toContain('點滴分享');
    expect(documentXml).toContain('開心！');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportDocxExport.test.js tests/parentReportDocxExport.acceptance.test.js`
Expected: FAIL — functions not exported yet.

- [ ] **Step 3: Append the highlights table, page header, signatures, and final assembly**

```js
const HIGHLIGHT_HEADER_FILL = 'F7CAAC';
const HIGHLIGHT_COLUMN_WIDTH = Math.floor(COURSE_PLAN_TABLE_WIDTH_DXA / 3);
const HIGHLIGHT_COLUMN_WIDTHS = [
  HIGHLIGHT_COLUMN_WIDTH,
  HIGHLIGHT_COLUMN_WIDTH,
  COURSE_PLAN_TABLE_WIDTH_DXA - HIGHLIGHT_COLUMN_WIDTH * 2,
];
const DXA_PER_PIXEL = 1440 / 96; // 1 inch = 1440 twips = 96 CSS/OOXML reference pixels

async function highlightPhotoCell(photo) {
  if (!photo) {
    return new TableCell({ width: { size: HIGHLIGHT_COLUMN_WIDTHS[0], type: WidthType.DXA }, children: [emptyParagraph()] });
  }
  const data = await photo.blob.arrayBuffer();
  const displayWidthPx = HIGHLIGHT_COLUMN_WIDTHS[0] / DXA_PER_PIXEL;
  const displayHeightPx = photo.width ? displayWidthPx * (photo.height / photo.width) : displayWidthPx;

  return new TableCell({
    width: { size: HIGHLIGHT_COLUMN_WIDTHS[0], type: WidthType.DXA },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new (await import('docx')).ImageRun({
            type: 'jpg',
            data,
            transformation: { width: displayWidthPx, height: displayHeightPx },
          }),
        ],
      }),
    ],
  });
}

async function highlightEntryRows(entry) {
  const photoCells = await Promise.all([0, 1, 2].map(i => highlightPhotoCell(entry.photos[i])));
  return [
    new TableRow({ children: photoCells }),
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 3,
          width: { size: COURSE_PLAN_TABLE_WIDTH_DXA, type: WidthType.DXA },
          children: [textParagraph(entry.caption, { bold: true, ...CENTERED })],
        }),
      ],
    }),
  ];
}

export async function buildHighlightsTable(highlightEntries) {
  const headerRow = new TableRow({
    children: [
      new TableCell({
        columnSpan: 3,
        width: { size: COURSE_PLAN_TABLE_WIDTH_DXA, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: HIGHLIGHT_HEADER_FILL },
        children: [textParagraph('點滴分享', { bold: true, ...CENTERED })],
      }),
    ],
  });

  const entryRowGroups = await Promise.all(highlightEntries.map(highlightEntryRows));

  return new Table({
    width: { size: COURSE_PLAN_TABLE_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: HIGHLIGHT_COLUMN_WIDTHS,
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.CENTER,
    margins: { left: TABLE_CELL_MARGIN_DXA, right: TABLE_CELL_MARGIN_DXA, marginUnitType: WidthType.DXA },
    rows: [headerRow, ...entryRowGroups.flat()],
  });
}

// Offset far enough left that the icon never overlaps the title line, matching docxExport.js's
// approach — recomputed here because this document type's own margins (PAGE_MARGIN above) differ.
const HEADER_ICON_OFFSET_EMU = { horizontal: -(HEADER_ICON_EMU.width + 40000), vertical: 8890 };

function pageHeader({ child, report }) {
  const tierLabel = parentReportTierLabel(report.tier);
  const referenceDate = /^\d{1,3}年\d{1,2}月$/.test(report.period)
    ? (() => {
        const [, y, m] = /^(\d{1,3})年(\d{1,2})月$/.exec(report.period);
        return `${Number(y) + 1911}-${String(Number(m)).padStart(2, '0')}-01`;
      })()
    : null;
  const actualAgeText =
    referenceDate && child.birthDate ? `${calculateAgeInMonths(child.birthDate, referenceDate)}個月` : '';

  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          headerIconRunAt(HEADER_ICON_OFFSET_EMU),
          new TextRun({
            text: `${INSTITUTION_NAME}每月課程計畫表${tierLabel}`,
            font: { ascii: FONT, eastAsia: FONT, hAnsi: FONT, cs: FONT },
            bold: true,
            size: TITLE_SIZE,
          }),
        ],
      }),
      textParagraph(
        `幼兒姓名：${child.name} 出生年月日：${toRocDate(child.birthDate)} 實際月齡：${actualAgeText}　紀錄時間：${report.period}`,
        { bold: true, ...CENTERED }
      ),
    ],
  });
}

function signatureParagraphs() {
  return [
    textParagraph('家長簽名：', { bold: true }),
    textParagraph('托育人員：　　　　　主任簽名：', { bold: true }),
    emptyParagraph(),
  ];
}

export async function generateParentReportDocxBlob({
  child, report, coursePlanEntries, courseOccurrencesByEntryId,
  developmentRecordEntries, behaviorObservations, highlightEntries,
}) {
  const coursePlanTable = buildCoursePlanTable(coursePlanEntries, courseOccurrencesByEntryId);
  const developmentRecordTable = buildDevelopmentRecordTable(developmentRecordEntries, behaviorObservations, coursePlanEntries);
  const highlightsTable = await buildHighlightsTable(highlightEntries);

  const doc = new Document({
    sections: [
      {
        properties: { page: { size: PAGE_SIZE, margin: PAGE_MARGIN } },
        headers: { default: pageHeader({ child, report }) },
        children: [
          coursePlanTable, emptyParagraph(),
          developmentRecordTable, emptyParagraph(),
          highlightsTable,
          ...signatureParagraphs(),
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}

export function downloadParentReportDocx(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

The dynamic `await import('docx')` inside `highlightPhotoCell` is deliberate, not an oversight — `ImageRun` needs the same runtime `data` shape (`ArrayBuffer`) that Task 6's `docxShared.js` header icon uses a base64 *string* for; rather than adding a second static import path for one call site, resolve the same already-imported module. If this reads awkwardly during implementation, an equally correct alternative is adding `ImageRun` to this file's top-level `import { ... } from 'docx'` list (it is not currently imported at the top of `parentReportDocxExport.js` — add it there instead and delete the dynamic import; either works, but prefer the static top-level import for consistency with the rest of the file).

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportDocxExport.test.js tests/parentReportDocxExport.acceptance.test.js`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/export/parentReportDocxExport.js tests/parentReportDocxExport.test.js tests/parentReportDocxExport.acceptance.test.js
git commit -m "Add 點滴分享 photo table and complete generateParentReportDocxBlob assembly"
```

---

### Task 11: Top-level report-type selector + navigation restructuring

**Files:**
- Create: `src/ui/reportTypeSelectView.js`
- Modify: `src/ui/childListView.js` (add optional `onBack`)
- Modify: `src/app.js`
- Test: `tests/reportTypeSelectView.test.js`, extend `tests/childListView.test.js`, extend `tests/app.test.js`

**Interfaces:**
- Produces: `renderReportTypeSelectView(container, {onSelectType}): Promise<void>` where `onSelectType` is called with the string `'assessment'` or `'parent-report'`.
- Modifies: `renderChildListView(container, {onSelectChild, confirmDelete, onBack})` — `onBack`, like `confirmDelete`, is optional; when omitted no back button renders (existing tests that don't pass it keep working unmodified).

- [ ] **Step 1: Write the failing test for the new view**

Create `tests/reportTypeSelectView.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { renderReportTypeSelectView } from '../src/ui/reportTypeSelectView.js';

describe('renderReportTypeSelectView', () => {
  it('calls onSelectType with "assessment" when 適性總表 is clicked', async () => {
    const container = document.createElement('div');
    let selected = null;
    await renderReportTypeSelectView(container, { onSelectType: type => { selected = type; } });

    container.querySelector('[data-type="assessment"]').click();
    expect(selected).toBe('assessment');
  });

  it('calls onSelectType with "parent-report" when 適性紀錄(家長版) is clicked', async () => {
    const container = document.createElement('div');
    let selected = null;
    await renderReportTypeSelectView(container, { onSelectType: type => { selected = type; } });

    container.querySelector('[data-type="parent-report"]').click();
    expect(selected).toBe('parent-report');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/reportTypeSelectView.test.js`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Create `reportTypeSelectView.js`**

```js
export async function renderReportTypeSelectView(container, { onSelectType }) {
  container.innerHTML = `
    <div class="page-header">
      <h2 class="page-header__title">選擇要填寫的表</h2>
    </div>
    <div class="type-select">
      <button type="button" class="btn btn--primary type-select__option" data-type="assessment">適性總表</button>
      <button type="button" class="btn btn--primary type-select__option" data-type="parent-report">適性紀錄(家長版)</button>
    </div>
  `;

  container.querySelector('[data-type="assessment"]').addEventListener('click', () => onSelectType('assessment'));
  container.querySelector('[data-type="parent-report"]').addEventListener('click', () => onSelectType('parent-report'));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/reportTypeSelectView.test.js`
Expected: PASS

- [ ] **Step 5: Add the optional back button to `childListView.js`**

In `src/ui/childListView.js`, change the function signature:

```js
export async function renderChildListView(
  container,
  { onSelectChild, confirmDelete = message => (typeof confirm === 'function' ? confirm(message) : false), onBack }
) {
```

In the template, change the page-header block from:

```html
<div class="page-header">
  <h2 class="page-header__title">幼兒列表</h2>
</div>
```

to:

```html
<div class="page-header">
  ${onBack ? '<button type="button" class="btn btn--ghost" data-action="back">← 返回選擇表單</button>' : ''}
  <h2 class="page-header__title">幼兒列表</h2>
</div>
```

After the existing event-wiring code (near the other `container.querySelector('[data-action="..."]')` calls), add:

```js
if (onBack) {
  container.querySelector('[data-action="back"]').addEventListener('click', onBack);
}
```

Every recursive re-render call inside this file (`await renderChildListView(container, { onSelectChild, confirmDelete })`, in the add-child success path, the delete-click handler, and the two import-preview callbacks) must also pass `onBack` through, e.g. `await renderChildListView(container, { onSelectChild, confirmDelete, onBack });` — otherwise the back button silently disappears after any of those re-renders.

- [ ] **Step 6: Write the failing test for the back button**

Add to `tests/childListView.test.js`:

```js
it('renders no back button when onBack is not provided (existing top-level usage)', async () => {
  const container = document.createElement('div');
  await renderChildListView(container, { onSelectChild: () => {} });
  expect(container.querySelector('[data-action="back"]')).toBeNull();
});

it('calls onBack when the back button is clicked, when onBack is provided', async () => {
  const container = document.createElement('div');
  let backCalled = false;
  await renderChildListView(container, { onSelectChild: () => {}, onBack: () => { backCalled = true; } });

  container.querySelector('[data-action="back"]').click();
  expect(backCalled).toBe(true);
});
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/childListView.test.js`
Expected: PASS (including every pre-existing test in this file, unmodified)

- [ ] **Step 8: Rewire `app.js`'s routing around the new type-select entry point**

Replace the body of `mountApp` in `src/app.js`:

```js
import { renderReportTypeSelectView } from './ui/reportTypeSelectView.js';
```

```js
export function mountApp(container) {
  function showRenderError() { /* unchanged */ }

  function showReportTypeSelect() {
    renderReportTypeSelectView(container, { onSelectType: type => showChildList(type) }).catch(showRenderError);
  }

  function showChildList(reportType) {
    renderChildListView(container, {
      onSelectChild: child => (reportType === 'parent-report' ? showParentReportList(child) : showFormList(child)),
      onBack: showReportTypeSelect,
    }).catch(showRenderError);
  }

  function showFormList(child) {
    renderFormListView(container, {
      child,
      onSelectForm: form => showFormEditor(child, form),
      onBack: () => showChildList('assessment'),
    }).catch(showRenderError);
  }

  function showFormEditor(child, form) {
    renderFormEditorView(container, { child, form, onBack: () => showFormList(child) }).catch(showRenderError);
  }

  // showParentReportList / showParentReportEditor are added in Task 12 once
  // parentReportListView.js exists; this task leaves showChildList calling them by name so the
  // wiring is already correct once that file lands. Until Task 12 lands, temporarily stub them so
  // the app still runs end-to-end for manual testing:
  function showParentReportList(child) {
    showChildList('parent-report'); // placeholder — replaced in Task 12, Step 5
  }

  if (isUnlocked()) {
    showReportTypeSelect();
  } else {
    renderPasswordGate(container, { onUnlock: showReportTypeSelect });
  }
}
```

- [ ] **Step 9: Update `tests/app.test.js` for the new entry screen**

The existing test `'starts on the child list'` must become `'starts on the report type select screen'`, and the navigation test must click through the new type-select screen first. Replace:

```js
it('starts on the child list', async () => {
  const container = document.createElement('div');
  mountApp(container);
  await waitFor(() => container.textContent.includes('幼兒列表'));

  expect(container.textContent).toContain('幼兒列表');
});
```

with:

```js
it('starts on the report type select screen, then reaches the child list after choosing 適性總表', async () => {
  const container = document.createElement('div');
  mountApp(container);
  await waitFor(() => container.textContent.includes('選擇要填寫的表'));
  expect(container.textContent).toContain('選擇要填寫的表');

  container.querySelector('[data-type="assessment"]').click();
  await waitFor(() => container.textContent.includes('幼兒列表'));
  expect(container.textContent).toContain('幼兒列表');
});
```

And at the start of the `'navigates child list -> form list -> form editor -> back -> back'` test, insert a click through the type screen before the existing `container.querySelector(\`[data-child-id="${child.id}"]\`)` wait:

```js
await waitFor(() => container.textContent.includes('選擇要填寫的表'));
container.querySelector('[data-type="assessment"]').click();
```

Also extend the final assertion: after the test's last `container.querySelector('[data-action="back"]').click()` (which now returns to the child list, not all the way to the type screen — there is one more back-hop now), add one more back-click + wait to confirm the type-select screen is reachable:

```js
container.querySelector('[data-action="back"]').click();
await waitFor(() => container.textContent.includes('選擇要填寫的表'));
expect(container.textContent).toContain('選擇要填寫的表');
```

- [ ] **Step 10: Run the full suite**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run`
Expected: all tests PASS

- [ ] **Step 11: Commit**

```bash
git add src/ui/reportTypeSelectView.js src/ui/childListView.js src/app.js tests/reportTypeSelectView.test.js tests/childListView.test.js tests/app.test.js
git commit -m "Add top-level 適性總表/適性紀錄 type selector, restructure app.js routing"
```

---

### Task 12: `parentReportListView.js` (list／新增／刪除 適性紀錄) and wiring into `app.js`

**Files:**
- Create: `src/ui/parentReportListView.js`
- Modify: `src/app.js`
- Test: `tests/parentReportListView.test.js`, extend `tests/app.test.js`

**Interfaces:**
- Consumes: `addParentReport, listParentReportsForChild, deleteParentReport` from `../storage/parentReportDb.js`; `suggestTier` from `../domain/ageTier.js`; `TIERS` from `../data/indicators.js`; `currentRocYear, periodSelectsHtml` from `./periodFields.js`; `escapeHtml`.
- Produces: `renderParentReportListView(container, {child, onSelectReport, onBack, confirmDelete}): Promise<void>` — mirrors `formListView.js`'s shape exactly (list card-list of reports with a red-X delete badge per Task 12's card styling being identical to the pattern already shipped in `formListView.js`/`childListView.js`, an add-form below).

- [ ] **Step 1: Write the failing tests**

Create `tests/parentReportListView.test.js` (mirrors `tests/formListView.test.js` structure closely):

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import { addParentReport } from '../src/storage/parentReportDb.js';
import { renderParentReportListView } from '../src/ui/parentReportListView.js';
import { waitFor } from './helpers.js';

describe('renderParentReportListView', () => {
  let child;

  beforeEach(async () => {
    await clearAllData();
    child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
  });

  it('renders existing parent reports for the child', async () => {
    await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });

    const container = document.createElement('div');
    await renderParentReportListView(container, { child, onSelectReport: () => {}, onBack: () => {} });

    expect(container.textContent).toContain('Ⅴ');
    expect(container.textContent).toContain('115年06月');
  });

  it('adds a new parent report via the form and re-renders the list', async () => {
    const container = document.createElement('div');
    await renderParentReportListView(container, { child, onSelectReport: () => {}, onBack: () => {} });

    container.querySelector('[data-field="tier"]').value = 'Ⅴ';
    container.querySelector('[data-field="period-year"]').value = '115';
    container.querySelector('[data-field="period-month"]').value = '6';
    container.querySelector('[data-action="add-report"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => container.textContent.includes('115年06月'));
    expect(container.textContent).toContain('115年06月');
  });

  it('calls onSelectReport with the clicked report', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });

    const container = document.createElement('div');
    let selected = null;
    await renderParentReportListView(container, { child, onSelectReport: r => { selected = r; }, onBack: () => {} });

    container.querySelector(`[data-report-id="${report.id}"]`).click();
    expect(selected).toEqual(report);
  });

  it('deletes a parent report after confirmation and re-renders the list without it', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });

    const container = document.createElement('div');
    await renderParentReportListView(container, { child, onSelectReport: () => {}, onBack: () => {}, confirmDelete: () => true });

    container.querySelector(`[data-delete-report="${report.id}"]`).click();

    await waitFor(() => !container.textContent.includes('115年06月'));
    expect(container.textContent).not.toContain('115年06月');
  });

  it('keeps the report when deletion is not confirmed', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });

    const container = document.createElement('div');
    await renderParentReportListView(container, { child, onSelectReport: () => {}, onBack: () => {}, confirmDelete: () => false });

    container.querySelector(`[data-delete-report="${report.id}"]`).click();
    expect(container.textContent).toContain('115年06月');
  });

  it('calls onBack when the back button is clicked', async () => {
    const container = document.createElement('div');
    let backCalled = false;
    await renderParentReportListView(container, { child, onSelectReport: () => {}, onBack: () => { backCalled = true; } });

    container.querySelector('[data-action="back"]').click();
    expect(backCalled).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportListView.test.js`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Create `parentReportListView.js`**

This mirrors `src/ui/formListView.js` (already extended with a delete badge in the current codebase) closely — same card-list markup, same red-X delete button pattern (`.card-list__row` / `.card-list__delete`, from the earlier 刪除按鈕 work), same add-form-with-period-selects pattern:

```js
import { addParentReport, listParentReportsForChild, deleteParentReport } from '../storage/parentReportDb.js';
import { suggestTier } from '../domain/ageTier.js';
import { TIERS } from '../data/indicators.js';
import { escapeHtml } from './escapeHtml.js';
import { currentRocYear, periodSelectsHtml } from './periodFields.js';

export async function renderParentReportListView(
  container,
  { child, onSelectReport, onBack, confirmDelete = message => (typeof confirm === 'function' ? confirm(message) : false) }
) {
  const reports = await listParentReportsForChild(child.id);
  const today = new Date().toISOString().slice(0, 10);
  const suggested = suggestTier(child.birthDate, today);
  const defaultYear = currentRocYear();
  const defaultMonth = new Date().getMonth() + 1;

  container.innerHTML = `
    <div class="page-header">
      <button type="button" class="btn btn--ghost" data-action="back">← 返回幼兒列表</button>
      <h2 class="page-header__title">${escapeHtml(child.name)} 的適性紀錄(家長版)</h2>
    </div>
    <ul class="card-list">
      ${reports
        .map(
          report =>
            `<li class="card-list__row">
              <button type="button" class="card-list__item" data-report-id="${escapeHtml(report.id)}">
                <span class="card-list__name">${escapeHtml(report.tier)} 階段</span>
                <span class="card-list__meta">${escapeHtml(report.period)}</span>
              </button>
              <button type="button" class="card-list__delete" data-delete-report="${escapeHtml(report.id)}" aria-label="刪除${escapeHtml(report.tier)} ${escapeHtml(report.period)}">×</button>
            </li>`
        )
        .join('')}
    </ul>
    <p class="field-error" data-error="delete"></p>
    <form class="panel-form" data-action="add-report">
      <h3 class="panel-form__title">新增適性紀錄</h3>
      <label class="panel-form__field">
        月齡階段
        <select data-field="tier">
          ${TIERS.map(t => `<option value="${t.code}" ${t.code === suggested ? 'selected' : ''}>${t.code}（${t.label}）</option>`).join('')}
        </select>
      </label>
      <label class="panel-form__field">
        紀錄年月
        ${periodSelectsHtml({
          yearFieldName: 'period-year',
          monthFieldName: 'period-month',
          selectedYear: defaultYear,
          selectedMonth: defaultMonth,
        })}
      </label>
      <button type="submit" class="btn btn--primary">新增</button>
    </form>
  `;

  container.querySelector('[data-action="back"]').addEventListener('click', onBack);

  for (const report of reports) {
    container.querySelector(`[data-report-id="${report.id}"]`).addEventListener('click', () => onSelectReport(report));
  }

  for (const report of reports) {
    container.querySelector(`[data-delete-report="${report.id}"]`).addEventListener('click', async () => {
      if (!confirmDelete(`確定要刪除「${report.tier} ${report.period}」這份適性紀錄嗎？此操作無法復原。`)) return;
      try {
        await deleteParentReport(report.id);
        await renderParentReportListView(container, { child, onSelectReport, onBack, confirmDelete });
      } catch (err) {
        container.querySelector('[data-error="delete"]').textContent = '刪除失敗，請再試一次';
      }
    });
  }

  container.querySelector('[data-action="add-report"]').addEventListener('submit', async event => {
    event.preventDefault();
    const tier = container.querySelector('[data-field="tier"]').value;
    const year = container.querySelector('[data-field="period-year"]').value;
    const month = container.querySelector('[data-field="period-month"]').value.padStart(2, '0');
    const period = `${year}年${month}月`;
    try {
      await addParentReport({ childId: child.id, tier, period });
      await renderParentReportListView(container, { child, onSelectReport, onBack, confirmDelete });
    } catch (err) {
      const form = container.querySelector('[data-action="add-report"]');
      let errorEl = form.querySelector('[data-error]');
      if (!errorEl) {
        errorEl = document.createElement('p');
        errorEl.dataset.error = '';
        errorEl.className = 'field-error';
        form.insertAdjacentElement('afterbegin', errorEl);
      }
      errorEl.textContent = '新增失敗，請再試一次';
    }
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportListView.test.js`
Expected: PASS

- [ ] **Step 5: Replace the Task 11 placeholder in `app.js`**

In `src/app.js`, add the import:

```js
import { renderParentReportListView } from './ui/parentReportListView.js';
```

Replace the placeholder `showParentReportList` from Task 11, Step 8 with the real implementation, and add `showParentReportEditor` as a placeholder in turn (completed in Task 13):

```js
function showParentReportList(child) {
  renderParentReportListView(container, {
    child,
    onSelectReport: report => showParentReportEditor(child, report),
    onBack: () => showChildList('parent-report'),
  }).catch(showRenderError);
}

// Completed in Task 13 once parentReportEditorView.js exists.
function showParentReportEditor(child, report) {
  showParentReportList(child); // placeholder — replaced in Task 13
}
```

- [ ] **Step 6: Run the full suite**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run`
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/ui/parentReportListView.js src/app.js tests/parentReportListView.test.js
git commit -m "Add parentReportListView with delete, wire into app.js"
```

---

### Task 13: `parentReportEditorView.js` tab shell + Word export button

**Files:**
- Create: `src/ui/parentReportEditorView.js`
- Modify: `src/app.js`
- Test: `tests/parentReportEditorView.test.js`

**Interfaces:**
- Consumes (this task only needs their existence, not their content — Tasks 14–17 build them): `renderCoursePlanTab`, `renderDevelopmentRecordTab`, `renderBehaviorObservationTab`, `renderHighlightsTab`, each `(panelEl, {report, onChange}) => Promise<void>`. **This task creates minimal stub versions of all four** (just enough to satisfy the import and render a placeholder), which Tasks 14–17 then flesh out one at a time — this keeps this task's own tests from depending on unwritten code.
- Produces: `renderParentReportEditorView(container, {child, report, onBack, activeTab}): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/parentReportEditorView.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import { addParentReport } from '../src/storage/parentReportDb.js';
import { renderParentReportEditorView } from '../src/ui/parentReportEditorView.js';
import { waitFor } from './helpers.js';

describe('renderParentReportEditorView', () => {
  let child, report;

  beforeEach(async () => {
    await clearAllData();
    child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
  });

  it('shows the child name, tier, and period in the header', async () => {
    const container = document.createElement('div');
    await renderParentReportEditorView(container, { child, report, onBack: () => {} });
    expect(container.textContent).toContain('陳小安');
    expect(container.textContent).toContain('Ⅴ');
    expect(container.textContent).toContain('115年06月');
  });

  it('defaults to the 課程計畫表 tab', async () => {
    const container = document.createElement('div');
    await renderParentReportEditorView(container, { child, report, onBack: () => {} });
    expect(container.querySelector('[data-tab="coursePlan"]').classList.contains('tabs__button--active')).toBe(true);
  });

  it('switches tabs when a tab button is clicked', async () => {
    const container = document.createElement('div');
    await renderParentReportEditorView(container, { child, report, onBack: () => {} });

    container.querySelector('[data-tab="highlights"]').click();
    await waitFor(() => container.querySelector('[data-tab="highlights"]').classList.contains('tabs__button--active'));

    expect(container.querySelector('[data-tab="highlights"]').classList.contains('tabs__button--active')).toBe(true);
    expect(container.querySelector('[data-tab="coursePlan"]').classList.contains('tabs__button--active')).toBe(false);
  });

  it('calls onBack when the back button is clicked', async () => {
    const container = document.createElement('div');
    let backCalled = false;
    await renderParentReportEditorView(container, { child, report, onBack: () => { backCalled = true; } });

    container.querySelector('[data-action="back"]').click();
    expect(backCalled).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportEditorView.test.js`
Expected: FAIL — module and its tab-view dependencies don't exist yet.

- [ ] **Step 3: Create minimal stub tab views**

Create `src/ui/courseplanTabView.js`, `src/ui/developmentRecordTabView.js`, `src/ui/behaviorObservationTabView.js`, `src/ui/highlightsTabView.js`, each with this same minimal shape for now (using 課程計畫表 as the example — replace the function name and placeholder text per file: `renderCoursePlanTab`/"課程計畫表", `renderDevelopmentRecordTab`/"適性發展紀錄表", `renderBehaviorObservationTab`/"行為觀察", `renderHighlightsTab`/"點滴分享"):

```js
export async function renderCoursePlanTab(container, { report, onChange }) {
  container.innerHTML = `<p>課程計畫表（Task 14 建置中）</p>`;
}
```

- [ ] **Step 4: Create `parentReportEditorView.js`**

```js
import { escapeHtml } from './escapeHtml.js';
import { generateParentReportDocxBlob, downloadParentReportDocx } from '../export/parentReportDocxExport.js';
import { listCoursePlanEntriesForReport, listCourseOccurrencesForEntry, listDevelopmentRecordEntriesForReport, listBehaviorObservationsForReport, listHighlightEntriesForReport } from '../storage/parentReportDb.js';
import { renderCoursePlanTab } from './courseplanTabView.js';
import { renderDevelopmentRecordTab } from './developmentRecordTabView.js';
import { renderBehaviorObservationTab } from './behaviorObservationTabView.js';
import { renderHighlightsTab } from './highlightsTabView.js';

const TABS = [
  { key: 'coursePlan', label: '課程計畫表', render: renderCoursePlanTab },
  { key: 'developmentRecord', label: '適性發展紀錄表', render: renderDevelopmentRecordTab },
  { key: 'behaviorObservation', label: '行為觀察', render: renderBehaviorObservationTab },
  { key: 'highlights', label: '點滴分享', render: renderHighlightsTab },
];

async function exportReport(child, report) {
  const coursePlanEntries = await listCoursePlanEntriesForReport(report.id);
  const courseOccurrencesByEntryId = {};
  for (const entry of coursePlanEntries) {
    courseOccurrencesByEntryId[entry.id] = await listCourseOccurrencesForEntry(entry.id);
  }
  const developmentRecordEntries = await listDevelopmentRecordEntriesForReport(report.id);
  const behaviorObservations = await listBehaviorObservationsForReport(report.id);
  const highlightEntries = await listHighlightEntriesForReport(report.id);

  return generateParentReportDocxBlob({
    child, report, coursePlanEntries, courseOccurrencesByEntryId,
    developmentRecordEntries, behaviorObservations, highlightEntries,
  });
}

export async function renderParentReportEditorView(container, { child, report, onBack, activeTab = 'coursePlan' }) {
  container.innerHTML = `
    <div class="page-header page-header--editor">
      <button type="button" class="btn btn--ghost" data-action="back">← 返回適性紀錄列表</button>
      <h2 class="page-header__title">${escapeHtml(child.name)}　${escapeHtml(report.tier)} 階段　${escapeHtml(report.period)}</h2>
      <button type="button" class="btn btn--primary" data-action="export">匯出 Word</button>
    </div>
    <p class="field-error field-error--center" data-error="export"></p>
    <div class="tabs" role="tablist">
      ${TABS.map(
        tab =>
          `<button type="button" class="tabs__button${tab.key === activeTab ? ' tabs__button--active' : ''}" data-tab="${tab.key}" role="tab">${tab.label}</button>`
      ).join('')}
    </div>
    <div class="tabs__panel" data-tab-panel></div>
  `;

  container.querySelector('[data-action="back"]').addEventListener('click', onBack);

  container.querySelector('[data-action="export"]').addEventListener('click', async () => {
    const errorEl = container.querySelector('[data-error="export"]');
    try {
      const blob = await exportReport(child, report);
      downloadParentReportDocx(blob, `${child.name}-適性紀錄-${report.period}.docx`);
      if (errorEl) errorEl.textContent = '';
    } catch (err) {
      if (errorEl) errorEl.textContent = '匯出失敗，請再試一次';
    }
  });

  for (const tab of TABS) {
    container.querySelector(`[data-tab="${tab.key}"]`).addEventListener('click', () => {
      renderParentReportEditorView(container, { child, report, onBack, activeTab: tab.key });
    });
  }

  const activeTabConfig = TABS.find(tab => tab.key === activeTab);
  const panel = container.querySelector('[data-tab-panel]');
  const onChange = () => renderParentReportEditorView(container, { child, report, onBack, activeTab });
  await activeTabConfig.render(panel, { report, onChange });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportEditorView.test.js`
Expected: PASS

- [ ] **Step 6: Replace the Task 12 placeholder in `app.js`**

```js
import { renderParentReportEditorView } from './ui/parentReportEditorView.js';
```

```js
function showParentReportEditor(child, report) {
  renderParentReportEditorView(container, { child, report, onBack: () => showParentReportList(child) }).catch(showRenderError);
}
```

- [ ] **Step 7: Run the full suite**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run`
Expected: all tests PASS (the four tab views are still stubs — this is expected and fixed in Tasks 14–17)

- [ ] **Step 8: Commit**

```bash
git add src/ui/parentReportEditorView.js src/ui/courseplanTabView.js src/ui/developmentRecordTabView.js src/ui/behaviorObservationTabView.js src/ui/highlightsTabView.js src/app.js tests/parentReportEditorView.test.js
git commit -m "Add parentReportEditorView tab shell with Word export, stub the four tab views"
```

---

### Task 14: `courseplanTabView.js` — 課程計畫表 tab (real implementation)

**Files:**
- Modify: `src/ui/courseplanTabView.js` (replace the Task 13 stub)
- Test: `tests/courseplanTabView.test.js`

**Interfaces:**
- Consumes: `getIndicatorsForTier` from `../data/indicators.js`; `addCoursePlanEntry, listCoursePlanEntriesForReport, deleteCoursePlanEntry, addCourseOccurrence, listCourseOccurrencesForEntry, deleteCourseOccurrence` from `../storage/parentReportDb.js`.
- Produces: `renderCoursePlanTab(container, {report, onChange}): Promise<void>` — `onChange` is called after every successful add/delete so the parent shell (Task 13) re-renders and any cross-tab data (Task 15 reads these entries) stays fresh.

- [ ] **Step 1: Write the failing tests**

Create `tests/courseplanTabView.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import { addParentReport, addCoursePlanEntry, addCourseOccurrence } from '../src/storage/parentReportDb.js';
import { renderCoursePlanTab } from '../src/ui/courseplanTabView.js';
import { waitFor } from './helpers.js';

describe('renderCoursePlanTab', () => {
  let report;

  beforeEach(async () => {
    await clearAllData();
    const child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
  });

  it('adds a new course plan entry via the form', async () => {
    const container = document.createElement('div');
    let changed = false;
    await renderCoursePlanTab(container, { report, onChange: () => { changed = true; } });

    container.querySelector('[data-field="indicatorCode"]').value = 'Ⅴ-1-6';
    container.querySelector('[data-field="activityName"]').value = '我愛畫畫';
    container.querySelector('[data-action="add-entry"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => changed);
  });

  it('renders an existing entry grouped under its domain, with its indicator description', async () => {
    await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });

    const container = document.createElement('div');
    await renderCoursePlanTab(container, { report, onChange: () => {} });

    expect(container.textContent).toContain('身體動作');
    expect(container.textContent).toContain('我愛畫畫');
    expect(container.textContent).toContain('能拿筆塗鴉');
  });

  it('adds an occurrence to an existing entry', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });

    const container = document.createElement('div');
    let changed = false;
    await renderCoursePlanTab(container, { report, onChange: () => { changed = true; } });

    container.querySelector(`[data-add-occurrence-for="${entry.id}"]`).click();
    container.querySelector(`[data-occurrence-field="date"][data-entry-id="${entry.id}"]`).value = '2026-06-11';
    container.querySelector(`[data-occurrence-field="status"][data-entry-id="${entry.id}"][value="developed"]`).checked = true;
    container.querySelector(`[data-occurrence-field="note"][data-entry-id="${entry.id}"]`).value = '小安能拿著海綿印章畫畫';
    container.querySelector(`[data-occurrence-save-for="${entry.id}"]`).click();

    await waitFor(() => changed);
  });

  it('marking absent disables the status choice', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });

    const container = document.createElement('div');
    await renderCoursePlanTab(container, { report, onChange: () => {} });

    container.querySelector(`[data-add-occurrence-for="${entry.id}"]`).click();
    const absentCheckbox = container.querySelector(`[data-occurrence-field="absent"][data-entry-id="${entry.id}"]`);
    absentCheckbox.checked = true;
    absentCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    const statusRadios = container.querySelectorAll(`[data-occurrence-field="status"][data-entry-id="${entry.id}"]`);
    for (const radio of statusRadios) expect(radio.disabled).toBe(true);
  });

  it('deletes a course plan entry', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });

    const container = document.createElement('div');
    let changed = false;
    await renderCoursePlanTab(container, { report, onChange: () => { changed = true; } });

    container.querySelector(`[data-delete-entry="${entry.id}"]`).click();
    await waitFor(() => changed);
  });

  it('deletes an occurrence', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });
    const occurrence = await addCourseOccurrence({ entryId: entry.id, date: '2026-06-11', status: 'developed', absent: false, note: 'x' });

    const container = document.createElement('div');
    let changed = false;
    await renderCoursePlanTab(container, { report, onChange: () => { changed = true; } });

    container.querySelector(`[data-delete-occurrence="${occurrence.id}"]`).click();
    await waitFor(() => changed);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/courseplanTabView.test.js`
Expected: FAIL — still the Task 13 stub.

- [ ] **Step 3: Replace the stub with the real implementation**

Replace the entire contents of `src/ui/courseplanTabView.js`:

```js
import { getIndicatorsForTier, getIndicator } from '../data/indicators.js';
import {
  addCoursePlanEntry, listCoursePlanEntriesForReport, deleteCoursePlanEntry,
  addCourseOccurrence, listCourseOccurrencesForEntry, deleteCourseOccurrence,
} from '../storage/parentReportDb.js';
import { escapeHtml } from './escapeHtml.js';

function occurrenceRow(occurrence) {
  const statusLabel = occurrence.absent ? '請假' : occurrence.status === 'developed' ? '已發展○' : '發展中△';
  return `
    <li class="entry-row${occurrence.absent ? ' entry-row--absent' : ''}">
      <div class="entry-row__top">
        <span class="entry-row__date">${escapeHtml(occurrence.date)}　${statusLabel}</span>
        <button type="button" class="btn btn--outline btn--small" data-delete-occurrence="${escapeHtml(occurrence.id)}">刪除</button>
      </div>
      <p class="entry-row__note">${escapeHtml(occurrence.note)}</p>
    </li>
  `;
}

function entryCard(entry, indicator, occurrences) {
  return `
    <div class="indicator-block" data-course-entry="${escapeHtml(entry.id)}">
      <h4 class="indicator-block__title">
        <span class="indicator-block__code">${escapeHtml(entry.indicatorCode)}</span>
        【${escapeHtml(entry.activityName)}】${escapeHtml(indicator ? indicator.description : '')}
        <button type="button" class="btn btn--outline btn--small" data-delete-entry="${escapeHtml(entry.id)}">刪除項目</button>
      </h4>
      <ul class="entry-list">${occurrences.map(occurrenceRow).join('')}</ul>
      <button type="button" class="btn btn--outline btn--small" data-add-occurrence-for="${escapeHtml(entry.id)}">＋ 新增實施紀錄</button>
      <div class="entry-form" data-occurrence-form-for="${escapeHtml(entry.id)}" hidden>
        <label class="entry-form__field">日期 <input type="date" data-occurrence-field="date" data-entry-id="${escapeHtml(entry.id)}"></label>
        <label class="entry-form__radio">
          <input type="radio" name="status-${escapeHtml(entry.id)}" data-occurrence-field="status" data-entry-id="${escapeHtml(entry.id)}" value="developed" checked> 已發展○
        </label>
        <label class="entry-form__radio">
          <input type="radio" name="status-${escapeHtml(entry.id)}" data-occurrence-field="status" data-entry-id="${escapeHtml(entry.id)}" value="developing"> 發展中△
        </label>
        <label class="entry-form__checkbox">
          <input type="checkbox" data-occurrence-field="absent" data-entry-id="${escapeHtml(entry.id)}"> 請假／未執行（劃掉日期與說明）
        </label>
        <input type="text" class="entry-form__note" data-occurrence-field="note" data-entry-id="${escapeHtml(entry.id)}" placeholder="說明">
        <button type="button" class="btn btn--primary btn--small" data-occurrence-save-for="${escapeHtml(entry.id)}">儲存</button>
        <p class="field-error" data-error></p>
      </div>
    </div>
  `;
}

function indicatorOptionsHtml(tier) {
  const indicators = getIndicatorsForTier(tier);
  const byDomain = new Map();
  for (const indicator of indicators) {
    if (!byDomain.has(indicator.domainName)) byDomain.set(indicator.domainName, []);
    byDomain.get(indicator.domainName).push(indicator);
  }
  return [...byDomain.entries()]
    .map(
      ([domainName, group]) =>
        `<optgroup label="${escapeHtml(domainName)}">
          ${group.map(i => `<option value="${escapeHtml(i.code)}">${escapeHtml(i.code)} ${escapeHtml(i.description)}</option>`).join('')}
        </optgroup>`
    )
    .join('');
}

export async function renderCoursePlanTab(container, { report, onChange }) {
  const entries = await listCoursePlanEntriesForReport(report.id);
  const occurrencesByEntryId = {};
  for (const entry of entries) {
    occurrencesByEntryId[entry.id] = await listCourseOccurrencesForEntry(entry.id);
  }

  const byDomain = new Map();
  for (const entry of entries) {
    const indicator = getIndicator(entry.indicatorCode);
    const domainName = indicator ? indicator.domainName : '未知領域';
    if (!byDomain.has(domainName)) byDomain.set(domainName, []);
    byDomain.get(domainName).push({ entry, indicator });
  }

  container.innerHTML = `
    <div class="domain-grid">
      ${[...byDomain.entries()]
        .map(
          ([domainName, group]) => `
            <section class="domain-card" data-domain="${escapeHtml(group[0].indicator ? group[0].indicator.domain : '')}">
              <h3 class="domain-card__title">${escapeHtml(domainName)}</h3>
              <div class="domain-card__body">
                ${group.map(({ entry, indicator }) => entryCard(entry, indicator, occurrencesByEntryId[entry.id] || [])).join('')}
              </div>
            </section>
          `
        )
        .join('')}
    </div>
    <form class="panel-form" data-action="add-entry">
      <h3 class="panel-form__title">新增課程計畫項目</h3>
      <label class="panel-form__field">
        指標
        <select data-field="indicatorCode">${indicatorOptionsHtml(report.tier)}</select>
      </label>
      <label class="panel-form__field">活動名稱 <input data-field="activityName" required></label>
      <button type="submit" class="btn btn--primary">新增</button>
      <p class="field-error" data-error></p>
    </form>
  `;

  container.querySelector('[data-action="add-entry"]').addEventListener('submit', async event => {
    event.preventDefault();
    const indicatorCode = container.querySelector('[data-field="indicatorCode"]').value;
    const activityName = container.querySelector('[data-field="activityName"]').value;
    try {
      await addCoursePlanEntry({ reportId: report.id, indicatorCode, activityName });
      onChange();
    } catch (err) {
      container.querySelector('[data-action="add-entry"] [data-error]').textContent = '新增失敗，請再試一次';
    }
  });

  for (const entry of entries) {
    container.querySelector(`[data-delete-entry="${entry.id}"]`).addEventListener('click', async () => {
      try {
        await deleteCoursePlanEntry(entry.id);
        onChange();
      } catch (err) {
        container.querySelector(`[data-course-entry="${entry.id}"]`).appendChild(
          Object.assign(document.createElement('p'), { className: 'field-error', textContent: '刪除失敗，請再試一次' })
        );
      }
    });

    container.querySelector(`[data-add-occurrence-for="${entry.id}"]`).addEventListener('click', () => {
      container.querySelector(`[data-occurrence-form-for="${entry.id}"]`).hidden = false;
    });

    container.querySelector(`[data-occurrence-field="absent"][data-entry-id="${entry.id}"]`).addEventListener('change', event => {
      const disabled = event.target.checked;
      container.querySelectorAll(`[data-occurrence-field="status"][data-entry-id="${entry.id}"]`).forEach(radio => {
        radio.disabled = disabled;
      });
    });

    container.querySelector(`[data-occurrence-save-for="${entry.id}"]`).addEventListener('click', async () => {
      const date = container.querySelector(`[data-occurrence-field="date"][data-entry-id="${entry.id}"]`).value;
      const absent = container.querySelector(`[data-occurrence-field="absent"][data-entry-id="${entry.id}"]`).checked;
      const statusInput = container.querySelector(`[data-occurrence-field="status"][data-entry-id="${entry.id}"]:checked`);
      const status = statusInput ? statusInput.value : 'developed';
      const note = container.querySelector(`[data-occurrence-field="note"][data-entry-id="${entry.id}"]`).value;
      try {
        await addCourseOccurrence({ entryId: entry.id, date, status, absent, note });
        onChange();
      } catch (err) {
        container.querySelector(`[data-occurrence-form-for="${entry.id}"] [data-error]`).textContent = '新增失敗，請再試一次';
      }
    });

    for (const occurrence of occurrencesByEntryId[entry.id] || []) {
      container.querySelector(`[data-delete-occurrence="${occurrence.id}"]`).addEventListener('click', async () => {
        try {
          await deleteCourseOccurrence(occurrence.id);
          onChange();
        } catch (err) {
          // Non-fatal: entry stays visible; the teacher can retry the delete.
        }
      });
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/courseplanTabView.test.js`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui/courseplanTabView.js tests/courseplanTabView.test.js
git commit -m "Implement 課程計畫表 tab: indicator/activity entries with occurrences and absent toggle"
```

---

### Task 15: `developmentRecordTabView.js` — 適性發展紀錄表 tab (real implementation)

**Files:**
- Modify: `src/ui/developmentRecordTabView.js` (replace the Task 13 stub)
- Test: `tests/developmentRecordTabView.test.js`

**Interfaces:**
- Consumes: `DOMAINS` from `../data/indicators.js` (the 5 domain id/name pairs, for the domain picker), `getIndicator`; `listCoursePlanEntriesForReport` from `../storage/parentReportDb.js` (to build the domain-filtered checkbox list — only entries already filled in on the 課程計畫表 tab are selectable, per the confirmed design); `addDevelopmentRecordEntry, listDevelopmentRecordEntriesForReport, deleteDevelopmentRecordEntry`.
- Produces: `renderDevelopmentRecordTab(container, {report, onChange, selectedDomain}): Promise<void>` — `selectedDomain` is an internal-only prop (defaults to the first domain id, `1`) used when this view re-renders itself after the teacher changes the "新增段落" domain picker; Task 13 never passes it.

- [ ] **Step 1: Write the failing tests**

Create `tests/developmentRecordTabView.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import { addParentReport, addCoursePlanEntry, addDevelopmentRecordEntry } from '../src/storage/parentReportDb.js';
import { renderDevelopmentRecordTab } from '../src/ui/developmentRecordTabView.js';
import { waitFor } from './helpers.js';

describe('renderDevelopmentRecordTab', () => {
  let report, entry;

  beforeEach(async () => {
    await clearAllData();
    const child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
    entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' }); // domain 1
  });

  it('only lists course plan entries belonging to the currently selected domain as checkboxes', async () => {
    await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-2-2', activityName: '香蕉鬆餅' }); // domain 2

    const container = document.createElement('div');
    await renderDevelopmentRecordTab(container, { report, onChange: () => {}, selectedDomain: 1 });

    expect(container.querySelector(`[data-course-entry-checkbox="${entry.id}"]`)).not.toBeNull();
    expect(container.textContent).not.toContain('香蕉鬆餅');
  });

  it('re-renders with the checkbox list filtered to the newly selected domain when the domain picker changes', async () => {
    const other = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-2-2', activityName: '香蕉鬆餅' });

    const container = document.createElement('div');
    await renderDevelopmentRecordTab(container, { report, onChange: () => {}, selectedDomain: 1 });

    container.querySelector('[data-field="domain"]').value = '2';
    container.querySelector('[data-field="domain"]').dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => container.querySelector(`[data-course-entry-checkbox="${other.id}"]`) !== null);
    expect(container.textContent).toContain('香蕉鬆餅');
  });

  it('adds a development record entry referencing the checked course plan entries', async () => {
    const container = document.createElement('div');
    let changed = false;
    await renderDevelopmentRecordTab(container, { report, onChange: () => { changed = true; }, selectedDomain: 1 });

    container.querySelector(`[data-course-entry-checkbox="${entry.id}"]`).checked = true;
    container.querySelector('[data-field="narrative"]').value = '小安能拿著海綿印章在水畫布上畫畫';
    container.querySelector('[data-action="add-record"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => changed);
  });

  it('renders existing entries with their referenced indicator lines and narrative', async () => {
    await addDevelopmentRecordEntry({ reportId: report.id, domain: 1, courseEntryIds: [entry.id], narrative: '小安能輕鬆畫畫' });

    const container = document.createElement('div');
    await renderDevelopmentRecordTab(container, { report, onChange: () => {} });

    expect(container.textContent).toContain('身體動作');
    expect(container.textContent).toContain('Ⅴ-1-6');
    expect(container.textContent).toContain('小安能輕鬆畫畫');
  });

  it('deletes a development record entry', async () => {
    const record = await addDevelopmentRecordEntry({ reportId: report.id, domain: 1, courseEntryIds: [entry.id], narrative: 'x' });

    const container = document.createElement('div');
    let changed = false;
    await renderDevelopmentRecordTab(container, { report, onChange: () => { changed = true; } });

    container.querySelector(`[data-delete-record="${record.id}"]`).click();
    await waitFor(() => changed);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/developmentRecordTabView.test.js`
Expected: FAIL — still the Task 13 stub.

- [ ] **Step 3: Replace the stub with the real implementation**

Replace the entire contents of `src/ui/developmentRecordTabView.js`:

```js
import { DOMAINS, getIndicator } from '../data/indicators.js';
import {
  listCoursePlanEntriesForReport, addDevelopmentRecordEntry,
  listDevelopmentRecordEntriesForReport, deleteDevelopmentRecordEntry,
} from '../storage/parentReportDb.js';
import { escapeHtml } from './escapeHtml.js';

function existingRecordCard(record, coursePlanEntriesById) {
  const lines = record.courseEntryIds
    .map(id => coursePlanEntriesById.get(id))
    .filter(Boolean)
    .map(entry => {
      const indicator = getIndicator(entry.indicatorCode);
      return `<li>${escapeHtml(entry.indicatorCode)}　${escapeHtml(indicator ? indicator.description : '')}</li>`;
    })
    .join('');

  return `
    <div class="indicator-block">
      <ul class="entry-list">${lines}</ul>
      <p class="entry-row__note">${escapeHtml(record.narrative)}</p>
      <button type="button" class="btn btn--outline btn--small" data-delete-record="${escapeHtml(record.id)}">刪除段落</button>
    </div>
  `;
}

export async function renderDevelopmentRecordTab(container, { report, onChange, selectedDomain = DOMAINS[0].id }) {
  const allEntries = await listCoursePlanEntriesForReport(report.id);
  const records = await listDevelopmentRecordEntriesForReport(report.id);
  const coursePlanEntriesById = new Map(allEntries.map(e => [e.id, e]));

  const byDomain = new Map();
  for (const record of records) {
    if (!byDomain.has(record.domain)) byDomain.set(record.domain, []);
    byDomain.get(record.domain).push(record);
  }

  const domainEntries = allEntries.filter(entry => {
    const indicator = getIndicator(entry.indicatorCode);
    return indicator && indicator.domain === Number(selectedDomain);
  });

  container.innerHTML = `
    <div class="domain-grid">
      ${DOMAINS.filter(d => byDomain.has(d.id))
        .map(
          domain => `
            <section class="domain-card" data-domain="${domain.id}">
              <h3 class="domain-card__title">${escapeHtml(domain.name)}</h3>
              <div class="domain-card__body">
                ${byDomain.get(domain.id).map(record => existingRecordCard(record, coursePlanEntriesById)).join('')}
              </div>
            </section>
          `
        )
        .join('')}
    </div>
    <form class="panel-form" data-action="add-record">
      <h3 class="panel-form__title">新增段落</h3>
      <label class="panel-form__field">
        領域
        <select data-field="domain">
          ${DOMAINS.map(d => `<option value="${d.id}" ${d.id === Number(selectedDomain) ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}
        </select>
      </label>
      <fieldset class="panel-form__field">
        <legend>已在課程計畫表填寫的項目（勾選要引用的項目）</legend>
        ${
          domainEntries.length === 0
            ? '<p>這個領域尚未在課程計畫表填寫任何項目</p>'
            : domainEntries
                .map(
                  entry => `
                  <label class="panel-form__checkbox-row">
                    <input type="checkbox" data-course-entry-checkbox="${escapeHtml(entry.id)}">
                    ${escapeHtml(entry.indicatorCode)} 【${escapeHtml(entry.activityName)}】
                  </label>
                `
                )
                .join('')
        }
      </fieldset>
      <label class="panel-form__field">敘述 <textarea data-field="narrative" required></textarea></label>
      <button type="submit" class="btn btn--primary">新增</button>
      <p class="field-error" data-error></p>
    </form>
  `;

  container.querySelector('[data-field="domain"]').addEventListener('change', event => {
    renderDevelopmentRecordTab(container, { report, onChange, selectedDomain: Number(event.target.value) });
  });

  container.querySelector('[data-action="add-record"]').addEventListener('submit', async event => {
    event.preventDefault();
    const domain = Number(container.querySelector('[data-field="domain"]').value);
    const narrative = container.querySelector('[data-field="narrative"]').value;
    const courseEntryIds = domainEntries
      .filter(entry => container.querySelector(`[data-course-entry-checkbox="${entry.id}"]`).checked)
      .map(entry => entry.id);
    try {
      await addDevelopmentRecordEntry({ reportId: report.id, domain, courseEntryIds, narrative });
      onChange();
    } catch (err) {
      container.querySelector('[data-action="add-record"] [data-error]').textContent = '新增失敗，請再試一次';
    }
  });

  for (const record of records) {
    container.querySelector(`[data-delete-record="${record.id}"]`).addEventListener('click', async () => {
      try {
        await deleteDevelopmentRecordEntry(record.id);
        onChange();
      } catch (err) {
        // Non-fatal: entry stays visible; the teacher can retry the delete.
      }
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/developmentRecordTabView.test.js`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui/developmentRecordTabView.js tests/developmentRecordTabView.test.js
git commit -m "Implement 適性發展紀錄表 tab: domain-filtered entry selection and narrative paragraphs"
```

---

### Task 16: `behaviorObservationTabView.js` — 行為觀察 tab (real implementation)

**Files:**
- Modify: `src/ui/behaviorObservationTabView.js` (replace the Task 13 stub)
- Test: `tests/behaviorObservationTabView.test.js`

**Interfaces:**
- Consumes: `addBehaviorObservation, listBehaviorObservationsForReport, deleteBehaviorObservation` from `../storage/parentReportDb.js`.
- Produces: `renderBehaviorObservationTab(container, {report, onChange}): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/behaviorObservationTabView.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import { addParentReport, addBehaviorObservation } from '../src/storage/parentReportDb.js';
import { renderBehaviorObservationTab } from '../src/ui/behaviorObservationTabView.js';
import { waitFor } from './helpers.js';

describe('renderBehaviorObservationTab', () => {
  let report;

  beforeEach(async () => {
    await clearAllData();
    const child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
  });

  it('renders existing observations', async () => {
    await addBehaviorObservation({ reportId: report.id, title: '我會好好說！', narrative: '本月觀察發現...' });

    const container = document.createElement('div');
    await renderBehaviorObservationTab(container, { report, onChange: () => {} });

    expect(container.textContent).toContain('我會好好說！');
    expect(container.textContent).toContain('本月觀察發現');
  });

  it('adds a new observation via the form', async () => {
    const container = document.createElement('div');
    let changed = false;
    await renderBehaviorObservationTab(container, { report, onChange: () => { changed = true; } });

    container.querySelector('[data-field="title"]').value = '我會好好說！';
    container.querySelector('[data-field="narrative"]').value = '本月觀察發現...';
    container.querySelector('[data-action="add-observation"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => changed);
  });

  it('deletes an observation', async () => {
    const observation = await addBehaviorObservation({ reportId: report.id, title: 'x', narrative: 'y' });

    const container = document.createElement('div');
    let changed = false;
    await renderBehaviorObservationTab(container, { report, onChange: () => { changed = true; } });

    container.querySelector(`[data-delete-observation="${observation.id}"]`).click();
    await waitFor(() => changed);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/behaviorObservationTabView.test.js`
Expected: FAIL — still the Task 13 stub.

- [ ] **Step 3: Replace the stub with the real implementation**

Replace the entire contents of `src/ui/behaviorObservationTabView.js`:

```js
import { addBehaviorObservation, listBehaviorObservationsForReport, deleteBehaviorObservation } from '../storage/parentReportDb.js';
import { escapeHtml } from './escapeHtml.js';

function observationCard(observation) {
  return `
    <div class="indicator-block">
      <h4 class="indicator-block__title">行為觀察－${escapeHtml(observation.title)}</h4>
      <p class="entry-row__note">${escapeHtml(observation.narrative)}</p>
      <button type="button" class="btn btn--outline btn--small" data-delete-observation="${escapeHtml(observation.id)}">刪除</button>
    </div>
  `;
}

export async function renderBehaviorObservationTab(container, { report, onChange }) {
  const observations = await listBehaviorObservationsForReport(report.id);

  container.innerHTML = `
    <div class="entry-list-wrap">${observations.map(observationCard).join('')}</div>
    <form class="panel-form" data-action="add-observation">
      <h3 class="panel-form__title">新增行為觀察</h3>
      <label class="panel-form__field">標題 <input data-field="title" required></label>
      <label class="panel-form__field">敘述 <textarea data-field="narrative" required></textarea></label>
      <button type="submit" class="btn btn--primary">新增</button>
      <p class="field-error" data-error></p>
    </form>
  `;

  container.querySelector('[data-action="add-observation"]').addEventListener('submit', async event => {
    event.preventDefault();
    const title = container.querySelector('[data-field="title"]').value;
    const narrative = container.querySelector('[data-field="narrative"]').value;
    try {
      await addBehaviorObservation({ reportId: report.id, title, narrative });
      onChange();
    } catch (err) {
      container.querySelector('[data-action="add-observation"] [data-error]').textContent = '新增失敗，請再試一次';
    }
  });

  for (const observation of observations) {
    container.querySelector(`[data-delete-observation="${observation.id}"]`).addEventListener('click', async () => {
      try {
        await deleteBehaviorObservation(observation.id);
        onChange();
      } catch (err) {
        // Non-fatal: entry stays visible; the teacher can retry the delete.
      }
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/behaviorObservationTabView.test.js`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui/behaviorObservationTabView.js tests/behaviorObservationTabView.test.js
git commit -m "Implement 行為觀察 tab"
```

---

### Task 17: `highlightsTabView.js` — 點滴分享 tab (photo upload, real implementation)

**Files:**
- Modify: `src/ui/highlightsTabView.js` (replace the Task 13 stub)
- Test: `tests/highlightsTabView.test.js`

**Interfaces:**
- Consumes: `compressImage` from `../media/imagePreprocess.js`; `addHighlightEntry, listHighlightEntriesForReport, deleteHighlightEntry` from `../storage/parentReportDb.js`.
- Produces: `renderHighlightsTab(container, {report, onChange}): Promise<void>`.

**Deliberate exception to the "always re-render the whole view" convention:** while a photo is being selected and compressed for one of the three upload slots, only that slot's thumbnail preview is patched in place (not a full `renderHighlightsTab` re-render) — the two other slots' already-chosen-but-not-yet-saved photos live in an in-memory array closed over by this render call, and a full re-render would have no way to reconstruct that in-flight state from the DOM alone. Only after the whole form is submitted does this view call `onChange()` and let the parent re-render normally.

**Test-environment note:** `jsdom` does not implement `URL.createObjectURL`, and `compressImage` depends on `Image`/`Canvas`, neither available in `jsdom` (see Task 5). Tests here mock both `imagePreprocess.js`'s `compressImage` (via `vi.spyOn`, mirroring the existing `dbModule.addChild` mocking pattern already used in `tests/childListView.test.js`) and stub `URL.createObjectURL`/`URL.revokeObjectURL` with `vi.stubGlobal`. The real Canvas-based compression and the real thumbnail rendering are verified manually in a real browser (Step 6), the same Puppeteer-driven-real-Edge methodology already used elsewhere in this project.

- [ ] **Step 1: Write the failing tests**

Create `tests/highlightsTabView.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import { addParentReport, addHighlightEntry } from '../src/storage/parentReportDb.js';
import { renderHighlightsTab } from '../src/ui/highlightsTabView.js';
import { waitFor } from './helpers.js';

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change'));
}

describe('renderHighlightsTab', () => {
  let report;

  beforeEach(async () => {
    await clearAllData();
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() });
    const child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders existing highlight entries with their caption', async () => {
    await addHighlightEntry({
      reportId: report.id, photos: [{ blob: new Blob(['a']), width: 10, height: 10 }], caption: '我最喜歡騎車車了！',
    });

    const container = document.createElement('div');
    await renderHighlightsTab(container, { report, onChange: () => {} });

    expect(container.textContent).toContain('我最喜歡騎車車了！');
  });

  it('compresses a selected photo and shows a preview in that slot', async () => {
    const imagePreprocess = await import('../src/media/imagePreprocess.js');
    vi.spyOn(imagePreprocess, 'compressImage').mockResolvedValue({ blob: new Blob(['x']), width: 100, height: 80 });

    const container = document.createElement('div');
    await renderHighlightsTab(container, { report, onChange: () => {} });

    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    selectFile(container.querySelector('[data-photo-slot="0"]'), file);

    await waitFor(() => container.querySelector('[data-preview-slot="0"] img') !== null);
    expect(container.querySelector('[data-preview-slot="0"] img')).not.toBeNull();
  });

  it('adds a highlight entry with 1-3 compressed photos and a caption', async () => {
    const imagePreprocess = await import('../src/media/imagePreprocess.js');
    vi.spyOn(imagePreprocess, 'compressImage').mockResolvedValue({ blob: new Blob(['x']), width: 100, height: 80 });

    const container = document.createElement('div');
    let changed = false;
    await renderHighlightsTab(container, { report, onChange: () => { changed = true; } });

    selectFile(container.querySelector('[data-photo-slot="0"]'), new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
    await waitFor(() => container.querySelector('[data-preview-slot="0"] img') !== null);

    container.querySelector('[data-field="caption"]').value = '我最喜歡騎車車了！';
    container.querySelector('[data-action="add-highlight"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => changed);
  });

  it('rejects submission with zero photos', async () => {
    const container = document.createElement('div');
    let changed = false;
    await renderHighlightsTab(container, { report, onChange: () => { changed = true; } });

    container.querySelector('[data-field="caption"]').value = '沒有照片';
    container.querySelector('[data-action="add-highlight"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => container.textContent.includes('請至少上傳一張照片'));
    expect(changed).toBe(false);
  });

  it('deletes a highlight entry', async () => {
    const entry = await addHighlightEntry({
      reportId: report.id, photos: [{ blob: new Blob(['a']), width: 10, height: 10 }], caption: 'x',
    });

    const container = document.createElement('div');
    let changed = false;
    await renderHighlightsTab(container, { report, onChange: () => { changed = true; } });

    container.querySelector(`[data-delete-highlight="${entry.id}"]`).click();
    await waitFor(() => changed);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/highlightsTabView.test.js`
Expected: FAIL — still the Task 13 stub.

- [ ] **Step 3: Replace the stub with the real implementation**

Replace the entire contents of `src/ui/highlightsTabView.js`:

```js
import { compressImage } from '../media/imagePreprocess.js';
import { addHighlightEntry, listHighlightEntriesForReport, deleteHighlightEntry } from '../storage/parentReportDb.js';
import { escapeHtml } from './escapeHtml.js';

function existingEntryCard(entry) {
  const thumbs = [0, 1, 2]
    .map(i => entry.photos[i])
    .map(photo =>
      photo
        ? `<img class="highlight-thumb" src="${URL.createObjectURL(photo.blob)}" alt="">`
        : '<span class="highlight-thumb highlight-thumb--empty"></span>'
    )
    .join('');
  return `
    <div class="indicator-block">
      <div class="highlight-thumbs">${thumbs}</div>
      <p class="entry-row__note">${escapeHtml(entry.caption)}</p>
      <button type="button" class="btn btn--outline btn--small" data-delete-highlight="${escapeHtml(entry.id)}">刪除</button>
    </div>
  `;
}

export async function renderHighlightsTab(container, { report, onChange }) {
  const entries = await listHighlightEntriesForReport(report.id);
  const pendingPhotos = [null, null, null]; // in-memory only, see Task 17's design note

  container.innerHTML = `
    <div class="entry-list-wrap">${entries.map(existingEntryCard).join('')}</div>
    <form class="panel-form" data-action="add-highlight">
      <h3 class="panel-form__title">新增點滴分享</h3>
      <div class="highlight-upload-grid">
        ${[0, 1, 2]
          .map(
            i => `
              <label class="highlight-upload-slot">
                照片 ${i + 1}
                <input type="file" accept="image/*" data-photo-slot="${i}">
                <span class="highlight-upload-slot__preview" data-preview-slot="${i}"></span>
              </label>
            `
          )
          .join('')}
      </div>
      <label class="panel-form__field">描述 <textarea data-field="caption" required></textarea></label>
      <button type="submit" class="btn btn--primary">新增</button>
      <p class="field-error" data-error></p>
    </form>
  `;

  for (const i of [0, 1, 2]) {
    container.querySelector(`[data-photo-slot="${i}"]`).addEventListener('change', async event => {
      const file = event.target.files[0];
      if (!file) return;
      const previewEl = container.querySelector(`[data-preview-slot="${i}"]`);
      try {
        const compressed = await compressImage(file);
        pendingPhotos[i] = compressed;
        previewEl.innerHTML = `<img class="highlight-thumb" src="${URL.createObjectURL(compressed.blob)}" alt="">`;
      } catch (err) {
        previewEl.textContent = '照片讀取失敗';
      }
    });
  }

  container.querySelector('[data-action="add-highlight"]').addEventListener('submit', async event => {
    event.preventDefault();
    const errorEl = container.querySelector('[data-action="add-highlight"] [data-error]');
    const caption = container.querySelector('[data-field="caption"]').value;
    const photos = pendingPhotos.filter(Boolean);
    if (photos.length === 0) {
      errorEl.textContent = '請至少上傳一張照片';
      return;
    }
    try {
      await addHighlightEntry({ reportId: report.id, photos, caption });
      onChange();
    } catch (err) {
      errorEl.textContent = '新增失敗，請再試一次';
    }
  });

  for (const entry of entries) {
    container.querySelector(`[data-delete-highlight="${entry.id}"]`).addEventListener('click', async () => {
      try {
        await deleteHighlightEntry(entry.id);
        onChange();
      } catch (err) {
        // Non-fatal: entry stays visible; the teacher can retry the delete.
      }
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/highlightsTabView.test.js`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run`
Expected: all tests PASS

- [ ] **Step 6: Manually verify real photo compression + upload in a real browser**

Run `npm run build`, open `dist/TableC.html` in a real browser (or use the project's established Puppeteer-driven-real-Edge script pattern), unlock, navigate to 適性紀錄(家長版) → a report → 點滴分享 tab, and upload a real photo file to each of the three slots. Confirm: a thumbnail preview appears for each slot after a brief delay (compression happening), the compressed file is visibly smaller than the original (check via browser dev tools' Network/Application storage, or simply that a multi-MB phone photo doesn't visibly stall the page), and after submitting, the entry appears in the list with all three thumbnails and the caption.

- [ ] **Step 7: Commit**

```bash
git add src/ui/highlightsTabView.js tests/highlightsTabView.test.js
git commit -m "Implement 點滴分享 tab with compressed photo upload (1-3 slots)"
```

---

### Task 18: Extend `backup.js` for the new stores (BACKUP_VERSION 1 → 2, backward-compatible)

**Files:**
- Modify: `src/storage/backup.js`
- Test: `tests/backup.test.js`

**Interfaces:**
- Modifies: `exportBackup(): Promise<string>` — now includes `parentReports`, `coursePlanEntries`, `courseOccurrences`, `developmentRecordEntries`, `behaviorObservations`, `highlightEntries` (photos base64-encoded) alongside the existing `children`/`forms`/`entries`, under `version: 2`.
- Modifies: `importBackup(json): Promise<void>` — accepts both `version: 1` (old shape, children/forms/entries only) and `version: 2` (full shape); rejects anything else with `Unsupported backup version: N`, unchanged from today's behavior for the reject case.

- [ ] **Step 1: Write the failing tests**

Read the existing `tests/backup.test.js` first to match its current style exactly, then add:

```js
import {
  addParentReport, addCoursePlanEntry, addCourseOccurrence,
  addDevelopmentRecordEntry, addBehaviorObservation, addHighlightEntry,
  listParentReportsForChild, listCoursePlanEntriesForReport, listCourseOccurrencesForEntry,
  listDevelopmentRecordEntriesForReport, listBehaviorObservationsForReport, listHighlightEntriesForReport,
} from '../src/storage/parentReportDb.js';
```

```js
it('round-trips a parent report with course plan entries, occurrences, and a photo through export/import', async () => {
  const child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
  const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
  const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' });
  await addCourseOccurrence({ entryId: entry.id, date: '2026-06-11', status: 'developed', absent: false, note: '小安能拿著海綿印章畫畫' });
  await addDevelopmentRecordEntry({ reportId: report.id, domain: 1, courseEntryIds: [entry.id], narrative: '小安能輕鬆畫畫' });
  await addBehaviorObservation({ reportId: report.id, title: '我會好好說！', narrative: 'x' });
  const photoBytes = new Uint8Array([1, 2, 3, 4]);
  await addHighlightEntry({
    reportId: report.id,
    photos: [{ blob: new Blob([photoBytes], { type: 'image/jpeg' }), width: 100, height: 80 }],
    caption: '我最喜歡騎車車了！',
  });

  const json = await exportBackup();
  await clearAllData();
  await importBackup(json);

  const [restoredChild] = await listChildren();
  const [restoredReport] = await listParentReportsForChild(restoredChild.id);
  expect(restoredReport.tier).toBe('Ⅴ');

  const [restoredEntry] = await listCoursePlanEntriesForReport(restoredReport.id);
  expect(restoredEntry.activityName).toBe('我愛畫畫');

  const [restoredOccurrence] = await listCourseOccurrencesForEntry(restoredEntry.id);
  expect(restoredOccurrence.note).toBe('小安能拿著海綿印章畫畫');

  const [restoredRecord] = await listDevelopmentRecordEntriesForReport(restoredReport.id);
  expect(restoredRecord.courseEntryIds).toEqual([restoredEntry.id]); // remapped id, not the original

  const [restoredObservation] = await listBehaviorObservationsForReport(restoredReport.id);
  expect(restoredObservation.title).toBe('我會好好說！');

  const [restoredHighlight] = await listHighlightEntriesForReport(restoredReport.id);
  expect(restoredHighlight.caption).toBe('我最喜歡騎車車了！');
  const restoredBytes = new Uint8Array(await restoredHighlight.photos[0].blob.arrayBuffer());
  expect([...restoredBytes]).toEqual([1, 2, 3, 4]);
  expect(restoredHighlight.photos[0].width).toBe(100);
});

it('still imports a version-1 backup file (no parent-report data) without error', async () => {
  const child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
  const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });
  await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', achieved: true, note: 'x' });

  // Simulate an old backup file: hand-build the exact v1 JSON shape, since exportBackup() now
  // always writes v2 — this is what a real user's pre-existing backup file looks like.
  const v1Json = JSON.stringify({
    version: 1,
    children: [{ id: child.id, name: child.name, birthDate: child.birthDate }],
    forms: [{ id: form.id, childId: child.id, tier: form.tier, period: form.period, createdAt: form.createdAt }],
    entries: [{ id: 1, formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', achieved: true, note: 'x' }],
  });

  await clearAllData();
  await importBackup(v1Json); // must not throw

  const [restoredChild] = await listChildren();
  expect(restoredChild.name).toBe('陳小安');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/backup.test.js`
Expected: FAIL — `exportBackup`/`importBackup` don't handle the new stores yet.

- [ ] **Step 3: Rewrite `backup.js`**

Replace the entire contents of `src/storage/backup.js`:

```js
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

const BACKUP_VERSION = 2;

// Chunked to avoid call-stack overflows from spreading a huge byte array into String.fromCharCode.
async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
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

  return JSON.stringify(
    {
      version: BACKUP_VERSION,
      children, forms, entries,
      parentReports, coursePlanEntries, courseOccurrences,
      developmentRecordEntries, behaviorObservations, highlightEntries,
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
      achieved: entry.achieved,
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

export async function importBackup(json) {
  const data = JSON.parse(json);
  if (data.version !== 1 && data.version !== 2) {
    throw new Error(`Unsupported backup version: ${data.version}`);
  }

  await clearAllData();

  const childIdMap = await importV1Or2Children(data);
  if (data.version === 2) {
    await importParentReports(data, childIdMap);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/backup.test.js`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/storage/backup.js tests/backup.test.js
git commit -m "Extend backup export/import to cover parent reports and photos, bump to version 2 with v1 backward compat"
```

---

### Task 19: Legacy Word import — 課程計畫表 table parsing

**Files:**
- Create: `src/import/parentReportDocxImport.js`
- Test: `tests/parentReportDocxImport.test.js`

**Interfaces:**
- Consumes: `getIndicator` from `../data/indicators.js`; the same regex-based `<w:tr>`/`<w:tc>`/`<w:t>` extraction technique already proven in `src/import/docxImport.js`.
- Produces (this task): `parseCoursePlanTable(documentXml): {entries: [{indicatorCode, activityName}], occurrencesByEntryIndex: {[index]: [{date, status, absent, note}]}}` (pure, testable on a hand-built XML fragment — no file I/O). Consumed by Task 20's `parseParentReportDocxImport`.

- [ ] **Step 1: Write the failing test with a hand-built XML fixture**

Create `tests/parentReportDocxImport.test.js`. The fixture mirrors the real sample's row shape (发展領域｜指標｜活動名稱/能力指標｜課程實施日期｜說明), including a vMerge-continued domain cell and a vMerge-continued indicator/activity cell for a second occurrence, and one struck-through (absent) occurrence:

```js
import { describe, it, expect } from 'vitest';
import { parseCoursePlanTable } from '../src/import/parentReportDocxImport.js';

const FIXTURE_XML = `
<w:tbl>
<w:tr><w:tc><w:p><w:r><w:t>發展領域</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>指標</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>活動名稱/能力指標</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>課程實施日期</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>說明</w:t></w:r></w:p></w:tc></w:tr>
<w:tr>
  <w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>身體動作</w:t></w:r></w:p></w:tc>
  <w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>Ⅴ-1-6</w:t></w:r></w:p></w:tc>
  <w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>【我愛畫畫】</w:t></w:r></w:p><w:p><w:r><w:t>能拿筆塗鴉</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>06/11○</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>小安能拿著海綿印章畫畫</w:t></w:r></w:p></w:tc>
</w:tr>
<w:tr>
  <w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc>
  <w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc>
  <w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc>
  <w:tc><w:p><w:r><w:rPr><w:strike/></w:rPr><w:t>06/10</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:rPr><w:strike/></w:rPr><w:t>請假</w:t></w:r></w:p></w:tc>
</w:tr>
</w:tbl>
`;

describe('parseCoursePlanTable', () => {
  it('parses the entry (indicator code + activity name)', () => {
    const { entries } = parseCoursePlanTable(FIXTURE_XML);
    expect(entries).toEqual([{ indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫' }]);
  });

  it('parses an achieved occurrence with the date and note', () => {
    const { occurrencesByEntryIndex } = parseCoursePlanTable(FIXTURE_XML);
    expect(occurrencesByEntryIndex[0][0]).toEqual({
      date: '06-11', status: 'developed', absent: false, note: '小安能拿著海綿印章畫畫',
    });
  });

  it('parses a struck-through row as absent, with no status glyph required', () => {
    const { occurrencesByEntryIndex } = parseCoursePlanTable(FIXTURE_XML);
    expect(occurrencesByEntryIndex[0][1]).toEqual({ date: '06-10', status: null, absent: true, note: '請假' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportDocxImport.test.js`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Create `parentReportDocxImport.js` with `parseCoursePlanTable`**

```js
function cellsForRow(rowXml) {
  return [...rowXml.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map(match => match[1]);
}

function rowsOf(tableXml) {
  return [...tableXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(match => match[0]);
}

function paragraphsOf(cellXml) {
  return [...cellXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map(match => match[0]);
}

function textOf(fragmentXml) {
  return [...fragmentXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('').trim();
}

function isVMergeContinue(cellXml) {
  return /<w:vMerge\s*\/>/.test(cellXml) || /<w:vMerge(?!\s+w:val)/.test(cellXml);
}

// A cell counts as struck-through if ANY of its runs carries <w:strike/> — the export always
// strikes the whole cell's text as one run, but this stays lenient about run-splitting.
function isStruck(cellXml) {
  return /<w:strike\s*\/>/.test(cellXml);
}

// "06/11" -> "06-11" (kept without a year — see Task 20's note on why year inference is deferred
// to the preview step, exactly like docxImport.js's existing 適性總表 importer).
function normalizeMonthDay(raw) {
  const match = /^(\d{1,2})\/(\d{1,2})/.exec(raw);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

export function parseCoursePlanTable(documentXml) {
  const bodyRows = rowsOf(documentXml).slice(1); // row 0 is the fixed header
  const entries = [];
  const occurrencesByEntryIndex = {};

  let currentEntryIndex = -1;

  for (const rowXml of bodyRows) {
    const cells = cellsForRow(rowXml);
    if (cells.length < 5) continue;

    const [domainCell, codeCell, activityCell, dateCell, noteCell] = cells;

    if (!isVMergeContinue(codeCell)) {
      const indicatorCode = textOf(codeCell);
      const activityParagraphs = paragraphsOf(activityCell);
      const activityNameRaw = activityParagraphs[0] ? textOf(activityParagraphs[0]) : '';
      const activityName = activityNameRaw.replace(/^【|】$/g, '');
      entries.push({ indicatorCode, activityName });
      currentEntryIndex += 1;
      occurrencesByEntryIndex[currentEntryIndex] = [];
    }

    if (currentEntryIndex < 0) continue; // malformed row before any entry started

    const dateText = textOf(dateCell);
    const date = normalizeMonthDay(dateText);
    if (!date) continue; // an unfilled placeholder row

    const absent = isStruck(dateCell);
    const status = absent ? null : dateText.includes('○') ? 'developed' : dateText.includes('△') ? 'developing' : null;

    occurrencesByEntryIndex[currentEntryIndex].push({ date, status, absent, note: textOf(noteCell) });
  }

  return { entries, occurrencesByEntryIndex };
}
```

Note: `occurrencesByEntryIndex` is keyed by array *index* into `entries`, not by any real id (there is no id yet at parse time — ids only exist after Task 20's preview step actually calls `addCoursePlanEntry`). This mirrors the existing `docxImport.js` convention of returning positional, storage-agnostic data for the caller to persist.

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportDocxImport.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/import/parentReportDocxImport.js tests/parentReportDocxImport.test.js
git commit -m "Parse legacy 課程計畫表 tables: entries, occurrences, absent strikethrough"
```

---

### Task 20: Legacy Word import — header info, 適性發展紀錄表／行為觀察 blocks

**Files:**
- Modify: `src/import/parentReportDocxImport.js`
- Test: `tests/parentReportDocxImport.test.js`

**Interfaces:**
- Consumes: `DOMAINS` from `../data/indicators.js` (to recognize a block's header text as a domain name).
- Produces: `parseHeaderInfo(headerText): {name, birthDate, period}` (reuses the exact same regex shapes as `docxImport.js`'s `parseHeaderInfo`/`rocDateToIso`, duplicated here rather than imported — see the note after Step 3 for why), `parseRecordBlocks(documentXml): [{label, rawText}]` (every shaded-header + content row-pair in the *second* table, in document order, completely unclassified — classification into domain vs. behavior-observation happens in Task 21's assembly step, using data this function doesn't have access to).

- [ ] **Step 1: Write the failing tests**

Append to `tests/parentReportDocxImport.test.js`:

```js
describe('parseHeaderInfo', () => {
  it('extracts name, ROC birth date converted to ISO, and record period', () => {
    const headerText = '屏東縣內埔鄉育英公設民營托嬰中心每月課程計畫表(19~24 個月) 幼兒姓名：陳小安 出生年月日：113.06.20 實際月齡：22 個月 紀錄時間：115 年 06 月';
    expect(parseHeaderInfo(headerText)).toEqual({ name: '陳小安', birthDate: '2024-06-20', period: '115年06月' });
  });
});

describe('parseRecordBlocks', () => {
  const SECOND_TABLE_XML = `
    <w:tbl>
    <w:tr><w:tc><w:tcPr><w:gridSpan w:val="6"/></w:tcPr><w:p><w:r><w:t>身體動作</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:tcPr><w:gridSpan w:val="6"/></w:tcPr><w:p><w:r><w:t>V-1-6 能拿筆塗鴉</w:t></w:r></w:p><w:p><w:r><w:t>小安能輕鬆畫畫</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:tcPr><w:gridSpan w:val="6"/></w:tcPr><w:p><w:r><w:t>行為觀察－我會好好說！</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:tcPr><w:gridSpan w:val="6"/></w:tcPr><w:p><w:r><w:t>本月觀察發現...</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
  `;

  it('pairs each shaded header row with its following content row, in order', () => {
    const blocks = parseRecordBlocks(SECOND_TABLE_XML);
    expect(blocks).toEqual([
      { label: '身體動作', rawText: 'V-1-6 能拿筆塗鴉\n小安能輕鬆畫畫' },
      { label: '行為觀察－我會好好說！', rawText: '本月觀察發現...' },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportDocxImport.test.js`
Expected: FAIL — functions not exported yet.

- [ ] **Step 3: Append `parseHeaderInfo` and `parseRecordBlocks` to `parentReportDocxImport.js`**

```js
// ROC "113.06.20" -> "2024-06-20" (note the dot separators here, unlike 適性總表's slash-separated
// 出生日期 — copied from the real reference sample's own header phrasing, do not "fix" to match
// docxImport.js's slash format).
function rocDotDateToIso(rocDate) {
  const match = /^(\d{1,3})\.(\d{1,2})\.(\d{1,2})$/.exec(rocDate.trim());
  if (!match) return null;
  const [, rocYear, month, day] = match;
  return `${Number(rocYear) + 1911}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function parseHeaderInfo(headerText) {
  const nameMatch = /幼兒姓名[：:]\s*([^\s　出]+)/.exec(headerText);
  const birthMatch = /出生年月日[：:]\s*(\d{1,3}\.\d{1,2}\.\d{1,2})/.exec(headerText);
  const periodMatch = /紀錄時間[：:]\s*(\d{1,3})\s*年\s*(\d{1,2})\s*月/.exec(headerText);

  return {
    name: nameMatch ? nameMatch[1] : null,
    birthDate: birthMatch ? rocDotDateToIso(birthMatch[1]) : null,
    period: periodMatch ? `${periodMatch[1]}年${periodMatch[2].padStart(2, '0')}月` : null,
  };
}

// The second table (適性發展紀錄表 + 行為觀察 + 點滴分享, all sharing one 6-column grid in the
// real sample) is a flat sequence of full-width shaded "header" rows and plain "content" rows.
// This function pairs them positionally — row 0 is a header, row 1 its content, row 2 the next
// header, etc. — without yet deciding what each header *means* (domain name vs. behavior-
// observation title vs. 點滴分享); Task 21 does that classification once it has DOMAINS and the
// already-parsed 課程計畫表 entries available to cross-reference against.
export function parseRecordBlocks(tableXml) {
  const rows = [...tableXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(m => m[0]);
  const blocks = [];

  for (let i = 0; i < rows.length; i += 2) {
    const headerRow = rows[i];
    const contentRow = rows[i + 1];
    if (!contentRow) break;

    const label = [...headerRow.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('').trim();
    const paragraphs = [...contentRow.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map(p =>
      [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('')
    );
    const rawText = paragraphs.join('\n').trim();

    if (label && rawText) blocks.push({ label, rawText });
  }

  return blocks;
}
```

**Why `parseHeaderInfo`/`rocDotDateToIso` are duplicated rather than shared with `docxImport.js`:** the two document types' header phrasing genuinely differs (`出生日期：113/11/01` with slashes vs. this document's `出生年月日：113.06.20` with dots; `實施時間` vs. `紀錄時間`), so a shared implementation would need conditional branching for two formats that happen to serve two unrelated legacy file formats. Keeping them as two small, independent functions is clearer than one function with format-sniffing branches — consistent with this project's existing preference for duplicating a few lines over building a shared abstraction for a two-case difference.

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportDocxImport.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/import/parentReportDocxImport.js tests/parentReportDocxImport.test.js
git commit -m "Parse legacy header info and 適性發展紀錄表/行為觀察 header+content blocks"
```

---

### Task 21: Legacy Word import — 點滴分享 photo extraction and full assembly

**Files:**
- Modify: `src/import/parentReportDocxImport.js`
- Test: `tests/parentReportDocxImport.test.js`

**Interfaces:**
- Produces: `parseParentReportDocxImport(data): Promise<ParsedParentReportImport>` — the top-level entry point, mirroring `docxImport.js`'s `parseDocxImport(data)` shape: `{child: {name, birthDate}, tier, period, coursePlanEntries: [{indicatorCode, activityName, occurrences: [...]}], developmentRecordBlocks: [{domain, courseEntryIndexes, narrative}], behaviorObservations: [{title, narrative}], highlightEntries: [{photos: [Blob], caption}], warnings: [string]}`. `data` is whatever `JSZip.loadAsync` accepts (File/Blob/ArrayBuffer), same contract as the existing importer.

**Known limitation, by design — surfaced to the user, not silently guessed around:** matching a photo `Blob` to the *specific* highlight group it belongs to requires resolving each `<w:drawing>`'s relationship id through `word/_rels/document.xml.rels`, which this lightweight regex-based parser (matching this codebase's existing `docxImport.js` approach — no full XML/DOM parser dependency) does not do. Instead, this task assumes images are stored in `word/media/` in the same order they are referenced in the document body — true for every Word-saved `.docx` file encountered in this project so far, but not guaranteed by the file format in general. This is exactly why the design spec requires the import preview to show every extracted photo thumbnail beside its matched caption for the teacher to check before confirming (Task 22) — this task's job is to produce a reasonable best-effort grouping, not a guaranteed-correct one.

- [ ] **Step 1: Write the failing tests**

Append to `tests/parentReportDocxImport.test.js`:

```js
describe('extractHighlightPhotoGroups', () => {
  const HIGHLIGHTS_XML = `
    <w:tbl>
    <w:tr><w:tc><w:tcPr><w:gridSpan w:val="3"/></w:tcPr><w:p><w:r><w:t>點滴分享</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr>
      <w:tc><w:p><w:r><w:drawing/></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:drawing/></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:drawing/></w:r></w:p></w:tc>
    </w:tr>
    <w:tr><w:tc><w:tcPr><w:gridSpan w:val="3"/></w:tcPr><w:p><w:r><w:t>我最喜歡騎車車了！</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr>
      <w:tc><w:p><w:r><w:drawing/></w:r></w:p></w:tc>
      <w:tc><w:p></w:p></w:tc>
      <w:tc><w:p></w:p></w:tc>
    </w:tr>
    <w:tr><w:tc><w:tcPr><w:gridSpan w:val="3"/></w:tcPr><w:p><w:r><w:t>一張就好</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
  `;

  it('counts drawings per photo row and pairs each group with its following caption', () => {
    const groups = extractHighlightPhotoGroups(HIGHLIGHTS_XML);
    expect(groups).toEqual([
      { photoCount: 3, caption: '我最喜歡騎車車了！' },
      { photoCount: 1, caption: '一張就好' },
    ]);
  });
});

describe('parseParentReportDocxImport', () => {
  it('returns warnings when header info cannot be found, without throwing', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('word/document.xml', '<w:document><w:body></w:body></w:document>');
    const blob = await zip.generateAsync({ type: 'blob' });

    const result = await parseParentReportDocxImport(blob);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.coursePlanEntries).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportDocxImport.test.js`
Expected: FAIL — functions not exported yet.

- [ ] **Step 3: Append photo-group extraction and the top-level assembly function**

```js
import JSZip from 'jszip';
import { DOMAINS, getIndicator } from '../data/indicators.js';
```

(add these two imports to the top of `parentReportDocxImport.js`, alongside any already present)

```js
// Within the 點滴分享 section: a photo row is any row whose cells contain no text (only
// <w:drawing> elements, if any); the row immediately after each non-empty run of photo rows is
// that group's caption row. A photo row with zero drawings (all three slots empty) is skipped
// entirely rather than emitted as a 0-photo group.
export function extractHighlightPhotoGroups(highlightsTableXml) {
  const startIdx = highlightsTableXml.indexOf('點滴分享');
  const scoped = startIdx === -1 ? highlightsTableXml : highlightsTableXml.slice(startIdx);
  const rows = [...scoped.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(m => m[0]).slice(1); // drop the "點滴分享" header row itself

  const groups = [];
  for (let i = 0; i < rows.length; i += 2) {
    const photoRow = rows[i];
    const captionRow = rows[i + 1];
    if (!captionRow) break;

    const photoCount = (photoRow.match(/<w:drawing\s*\/>|<w:drawing>/g) || []).length;
    const caption = [...captionRow.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('').trim();
    if (photoCount > 0 && caption) groups.push({ photoCount, caption });
  }
  return groups;
}

async function extractSortedMediaImages(zip) {
  const mediaNames = Object.keys(zip.files)
    .filter(name => /^word\/media\/image\d+\.(png|jpe?g)$/i.test(name))
    .sort((a, b) => {
      const numA = Number(/image(\d+)\./.exec(a)[1]);
      const numB = Number(/image(\d+)\./.exec(b)[1]);
      return numA - numB;
    });
  return Promise.all(mediaNames.map(async name => zip.file(name).async('blob')));
}

// The domain-block classifier: a block's label is either one of the 5 known domain names (→ a
// 適性發展紀錄表 段落, referencing whichever already-parsed 課程計畫表 entries its rawText
// mentions by indicator code), or starts with "行為觀察－" (→ a behavior observation), or neither
// (→ surfaced as a warning and dropped, rather than guessed at).
function classifyRecordBlocks(blocks, coursePlanEntries, warnings) {
  const domainByName = new Map(DOMAINS.map(d => [d.name, d.id]));
  const developmentRecordBlocks = [];
  const behaviorObservations = [];

  for (const block of blocks) {
    if (domainByName.has(block.label)) {
      const codeMatches = [...block.rawText.matchAll(/[ⅠⅡⅢⅣⅤ]-\d-\d/g)].map(m => m[0]);
      const courseEntryIndexes = coursePlanEntries
        .map((entry, index) => (codeMatches.includes(entry.indicatorCode) ? index : -1))
        .filter(index => index !== -1);
      // The narrative itself is everything after the leading "code　description" lines this
      // project's own export writes (see parentReportDocxExport.js's referencedIndicatorLines) —
      // a legacy file may not follow that exact shape, so this keeps the FULL rawText as the
      // narrative rather than trying to strip a prefix that might not be there; the teacher can
      // trim it in the preview step if it duplicates the indicator list visually.
      developmentRecordBlocks.push({ domain: domainByName.get(block.label), courseEntryIndexes, narrative: block.rawText });
    } else if (block.label.startsWith('行為觀察－')) {
      behaviorObservations.push({ title: block.label.slice('行為觀察－'.length), narrative: block.rawText });
    } else {
      warnings.push(`無法辨識的段落標題「${block.label}」，已略過，請於預覽畫面確認是否需要手動補上`);
    }
  }

  return { developmentRecordBlocks, behaviorObservations };
}

export async function parseParentReportDocxImport(data) {
  const zip = await JSZip.loadAsync(data);
  const documentXml = await zip.file('word/document.xml').async('text');
  const warnings = [];

  const headerFileNames = Object.keys(zip.files).filter(name => /^word\/header\d*\.xml$/.test(name));
  let headerInfo = { name: null, birthDate: null, period: null };
  for (const name of headerFileNames) {
    const xml = await zip.file(name).async('text');
    const text = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join(' ');
    if (text.includes('幼兒姓名')) {
      headerInfo = parseHeaderInfo(text);
      break;
    }
  }
  if (!headerInfo.name) warnings.push('無法從檔案中判斷幼兒姓名，請手動輸入');
  if (!headerInfo.birthDate) warnings.push('無法從檔案中判斷出生日期，請手動輸入');
  if (!headerInfo.period) warnings.push('無法從檔案中判斷紀錄年月，請手動選擇');

  const tables = [...documentXml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map(m => m[0]);
  const [coursePlanTableXml, secondTableXml] = tables;

  const { entries: coursePlanEntriesRaw, occurrencesByEntryIndex } = coursePlanTableXml
    ? parseCoursePlanTable(coursePlanTableXml)
    : { entries: [], occurrencesByEntryIndex: {} };

  const inferredYear = headerInfo.period ? Number(/^(\d+)年/.exec(headerInfo.period)[1]) + 1911 : new Date().getFullYear();
  const coursePlanEntries = coursePlanEntriesRaw.map((entry, index) => ({
    ...entry,
    occurrences: (occurrencesByEntryIndex[index] || []).map(o => ({ ...o, date: `${inferredYear}-${o.date}` })),
  }));

  const tier = (() => {
    const counts = new Map();
    for (const entry of coursePlanEntries) {
      const indicator = getIndicator(entry.indicatorCode);
      if (!indicator) continue;
      counts.set(indicator.tier, (counts.get(indicator.tier) || 0) + 1);
    }
    let best = null, bestCount = 0;
    for (const [t, count] of counts) if (count > bestCount) { best = t; bestCount = count; }
    return best;
  })();
  if (!tier) warnings.push('無法從檔案中判斷月齡階段，請手動選擇');

  const blocks = secondTableXml ? parseRecordBlocks(secondTableXml) : [];
  const { developmentRecordBlocks, behaviorObservations } = classifyRecordBlocks(blocks, coursePlanEntries, warnings);

  const photoGroups = secondTableXml ? extractHighlightPhotoGroups(secondTableXml) : [];
  const mediaImages = await extractSortedMediaImages(zip);
  let mediaCursor = 0;
  const highlightEntries = photoGroups.map(group => {
    const photos = mediaImages.slice(mediaCursor, mediaCursor + group.photoCount);
    mediaCursor += group.photoCount;
    return { photos, caption: group.caption };
  });
  if (mediaImages.length > mediaCursor) {
    warnings.push('偵測到的照片數量多於點滴分享區塊，部分照片可能未正確歸類，請於預覽畫面確認');
  }

  return {
    child: { name: headerInfo.name, birthDate: headerInfo.birthDate },
    tier,
    period: headerInfo.period,
    coursePlanEntries,
    developmentRecordBlocks,
    behaviorObservations,
    highlightEntries,
    warnings,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportDocxImport.test.js`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/import/parentReportDocxImport.js tests/parentReportDocxImport.test.js
git commit -m "Add 點滴分享 photo extraction and full parseParentReportDocxImport assembly"
```

---

### Task 22: `parentReportImportPreviewView.js` — preview-and-confirm UI, wired into `parentReportListView.js`

**Files:**
- Create: `src/ui/parentReportImportPreviewView.js`
- Modify: `src/ui/parentReportListView.js`
- Test: `tests/parentReportImportPreviewView.test.js`, extend `tests/parentReportListView.test.js`

**Interfaces:**
- Produces: `renderParentReportImportPreviewView(container, {parsed, onCancel, onImported}): void` — mirrors `importPreviewView.js`'s shape: nothing is persisted until the form is submitted; every included item is individually checkbox-excludable; only on submit does it call `addParentReport`/`addCoursePlanEntry`/`addCourseOccurrence`/`addDevelopmentRecordEntry`/`addBehaviorObservation`/`addHighlightEntry` in sequence, remapping `courseEntryIndexes` to the real ids of entries that were actually included.

- [ ] **Step 1: Write the failing tests**

Create `tests/parentReportImportPreviewView.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllData } from '../src/storage/db.js';
import { listParentReportsForChild, listCoursePlanEntriesForReport, listCourseOccurrencesForEntry, listDevelopmentRecordEntriesForReport, listBehaviorObservationsForReport, listHighlightEntriesForReport } from '../src/storage/parentReportDb.js';
import { renderParentReportImportPreviewView } from '../src/ui/parentReportImportPreviewView.js';
import { listChildren } from '../src/storage/db.js';

function buildParsed(overrides = {}) {
  return {
    child: { name: '陳小安', birthDate: '2024-06-20' },
    tier: 'Ⅴ',
    period: '115年06月',
    coursePlanEntries: [
      { indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫', occurrences: [{ date: '2026-06-11', status: 'developed', absent: false, note: 'x' }] },
    ],
    developmentRecordBlocks: [{ domain: 1, courseEntryIndexes: [0], narrative: 'y' }],
    behaviorObservations: [{ title: '我會好好說！', narrative: 'z' }],
    highlightEntries: [{ photos: [new Blob(['a'], { type: 'image/png' })], caption: '開心！' }],
    warnings: [],
    ...overrides,
  };
}

describe('renderParentReportImportPreviewView', () => {
  beforeEach(() => clearAllData());

  it('does not persist anything until confirmed', async () => {
    const container = document.createElement('div');
    renderParentReportImportPreviewView(container, { parsed: buildParsed(), onCancel: () => {}, onImported: () => {} });
    expect(await listChildren()).toEqual([]);
  });

  it('persists the full structure on confirm, remapping development record references to real ids', async () => {
    const container = document.createElement('div');
    let imported = false;
    renderParentReportImportPreviewView(container, { parsed: buildParsed(), onCancel: () => {}, onImported: () => { imported = true; } });

    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(imported).toBe(true);
    const [child] = await listChildren();
    const [report] = await listParentReportsForChild(child.id);
    const [entry] = await listCoursePlanEntriesForReport(report.id);
    expect(entry.activityName).toBe('我愛畫畫');
    const [occurrence] = await listCourseOccurrencesForEntry(entry.id);
    expect(occurrence.note).toBe('x');
    const [record] = await listDevelopmentRecordEntriesForReport(report.id);
    expect(record.courseEntryIds).toEqual([entry.id]);
    const [observation] = await listBehaviorObservationsForReport(report.id);
    expect(observation.title).toBe('我會好好說！');
    const [highlight] = await listHighlightEntriesForReport(report.id);
    expect(highlight.caption).toBe('開心！');
  });

  it('excludes a course plan entry unchecked in the preview, and its dependent development record reference', async () => {
    const container = document.createElement('div');
    renderParentReportImportPreviewView(container, { parsed: buildParsed(), onCancel: () => {}, onImported: () => {} });

    container.querySelector('[data-course-entry-include="0"]').checked = false;
    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    const [child] = await listChildren();
    const [report] = await listParentReportsForChild(child.id);
    expect(await listCoursePlanEntriesForReport(report.id)).toEqual([]);
    const [record] = await listDevelopmentRecordEntriesForReport(report.id);
    expect(record.courseEntryIds).toEqual([]); // its only reference pointed at the excluded entry
  });

  it('calls onCancel without persisting anything', async () => {
    const container = document.createElement('div');
    let cancelled = false;
    renderParentReportImportPreviewView(container, { parsed: buildParsed(), onCancel: () => { cancelled = true; }, onImported: () => {} });

    container.querySelector('[data-action="cancel"]').click();
    expect(cancelled).toBe(true);
    expect(await listChildren()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportImportPreviewView.test.js`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Create `parentReportImportPreviewView.js`**

```js
import { addChild } from '../storage/db.js';
import {
  addParentReport, addCoursePlanEntry, addCourseOccurrence,
  addDevelopmentRecordEntry, addBehaviorObservation, addHighlightEntry,
} from '../storage/parentReportDb.js';
import { DOMAINS, TIERS } from '../data/indicators.js';
import { escapeHtml } from './escapeHtml.js';
import { currentRocYear, periodSelectsHtml, parsePeriod } from './periodFields.js';

function coursePlanEntryRow(entry, index) {
  const occurrenceSummary = entry.occurrences.map(o => `${escapeHtml(o.date)}${o.absent ? '（請假）' : o.status === 'developed' ? '○' : '△'}`).join('、');
  return `
    <li class="import-preview__entry">
      <label>
        <input type="checkbox" data-course-entry-include="${index}" checked>
        <span class="import-preview__entry-code">${escapeHtml(entry.indicatorCode)}</span>
        【${escapeHtml(entry.activityName)}】— ${occurrenceSummary || '（無實施紀錄）'}
      </label>
    </li>
  `;
}

function developmentRecordRow(block, index) {
  const domainName = DOMAINS.find(d => d.id === block.domain)?.name ?? '';
  return `
    <li class="import-preview__entry">
      <label>
        <input type="checkbox" data-record-include="${index}" checked>
        <strong>${escapeHtml(domainName)}</strong>：${escapeHtml(block.narrative)}
      </label>
    </li>
  `;
}

function behaviorObservationRow(observation, index) {
  return `
    <li class="import-preview__entry">
      <label>
        <input type="checkbox" data-observation-include="${index}" checked>
        ${escapeHtml(observation.title)}：${escapeHtml(observation.narrative)}
      </label>
    </li>
  `;
}

function highlightRow(entry, index) {
  const thumbs = entry.photos.map(blob => `<img class="highlight-thumb" src="${URL.createObjectURL(blob)}" alt="">`).join('');
  return `
    <li class="import-preview__entry">
      <label>
        <input type="checkbox" data-highlight-include="${index}" checked>
        <div class="highlight-thumbs">${thumbs}</div>
        ${escapeHtml(entry.caption)}
      </label>
    </li>
  `;
}

export function renderParentReportImportPreviewView(container, { parsed, onCancel, onImported }) {
  const defaultRocYear = currentRocYear();
  const defaultMonth = new Date().getMonth() + 1;
  const { year: parsedYear, month: parsedMonth } = parsePeriod(parsed.period);

  container.innerHTML = `
    <div class="page-header">
      <button type="button" class="btn btn--ghost" data-action="cancel">← 取消匯入</button>
      <h2 class="page-header__title">確認匯入內容（適性紀錄）</h2>
    </div>
    ${
      parsed.warnings.length > 0
        ? `<ul class="import-preview__warnings">${parsed.warnings.map(w => `<li class="field-error">${escapeHtml(w)}</li>`).join('')}</ul>`
        : ''
    }
    <form class="panel-form" data-action="confirm-import">
      <h3 class="panel-form__title">幼兒基本資料</h3>
      <label class="panel-form__field">姓名 <input data-field="name" value="${escapeHtml(parsed.child.name ?? '')}" required></label>
      <label class="panel-form__field">出生日期 <input data-field="birthDate" type="date" value="${escapeHtml(parsed.child.birthDate ?? '')}" required></label>
      <label class="panel-form__field">
        月齡階段
        <select data-field="tier">
          ${TIERS.map(t => `<option value="${t.code}" ${t.code === parsed.tier ? 'selected' : ''}>${t.code}（${t.label}）</option>`).join('')}
        </select>
      </label>
      <label class="panel-form__field">
        紀錄年月
        ${periodSelectsHtml({ yearFieldName: 'period-year', monthFieldName: 'period-month', selectedYear: parsedYear ?? defaultRocYear, selectedMonth: parsedMonth ?? defaultMonth })}
      </label>

      <h3 class="panel-form__title">課程計畫表（共 ${parsed.coursePlanEntries.length} 項）</h3>
      <ul class="import-preview__entry-list">${parsed.coursePlanEntries.map(coursePlanEntryRow).join('') || '<li>沒有偵測到任何項目</li>'}</ul>

      <h3 class="panel-form__title">適性發展紀錄表（共 ${parsed.developmentRecordBlocks.length} 段）</h3>
      <ul class="import-preview__entry-list">${parsed.developmentRecordBlocks.map(developmentRecordRow).join('') || '<li>沒有偵測到任何段落</li>'}</ul>

      <h3 class="panel-form__title">行為觀察（共 ${parsed.behaviorObservations.length} 筆）</h3>
      <ul class="import-preview__entry-list">${parsed.behaviorObservations.map(behaviorObservationRow).join('') || '<li>沒有偵測到任何觀察</li>'}</ul>

      <h3 class="panel-form__title">點滴分享（共 ${parsed.highlightEntries.length} 組）</h3>
      <ul class="import-preview__entry-list">${parsed.highlightEntries.map(highlightRow).join('') || '<li>沒有偵測到任何照片</li>'}</ul>

      <button type="submit" class="btn btn--primary">確認匯入</button>
      <p class="field-error" data-error></p>
    </form>
  `;

  container.querySelector('[data-action="cancel"]').addEventListener('click', onCancel);

  container.querySelector('[data-action="confirm-import"]').addEventListener('submit', async event => {
    event.preventDefault();
    const errorEl = container.querySelector('[data-error]');

    const name = container.querySelector('[data-field="name"]').value;
    const birthDate = container.querySelector('[data-field="birthDate"]').value;
    const tier = container.querySelector('[data-field="tier"]').value;
    const year = container.querySelector('[data-field="period-year"]').value;
    const month = container.querySelector('[data-field="period-month"]').value.padStart(2, '0');
    const period = `${year}年${month}月`;

    const includedEntryIndexes = parsed.coursePlanEntries
      .map((_, i) => i)
      .filter(i => container.querySelector(`[data-course-entry-include="${i}"]`).checked);
    const includedRecordIndexes = parsed.developmentRecordBlocks
      .map((_, i) => i)
      .filter(i => container.querySelector(`[data-record-include="${i}"]`).checked);
    const includedObservationIndexes = parsed.behaviorObservations
      .map((_, i) => i)
      .filter(i => container.querySelector(`[data-observation-include="${i}"]`).checked);
    const includedHighlightIndexes = parsed.highlightEntries
      .map((_, i) => i)
      .filter(i => container.querySelector(`[data-highlight-include="${i}"]`).checked);

    try {
      const child = await addChild({ name, birthDate });
      const report = await addParentReport({ childId: child.id, tier, period });

      const entryIdByOriginalIndex = new Map();
      for (const index of includedEntryIndexes) {
        const source = parsed.coursePlanEntries[index];
        const created = await addCoursePlanEntry({ reportId: report.id, indicatorCode: source.indicatorCode, activityName: source.activityName });
        entryIdByOriginalIndex.set(index, created.id);
        for (const occurrence of source.occurrences) {
          await addCourseOccurrence({ entryId: created.id, ...occurrence });
        }
      }

      for (const index of includedRecordIndexes) {
        const source = parsed.developmentRecordBlocks[index];
        const courseEntryIds = source.courseEntryIndexes
          .filter(i => entryIdByOriginalIndex.has(i))
          .map(i => entryIdByOriginalIndex.get(i));
        await addDevelopmentRecordEntry({ reportId: report.id, domain: source.domain, courseEntryIds, narrative: source.narrative });
      }

      for (const index of includedObservationIndexes) {
        const source = parsed.behaviorObservations[index];
        await addBehaviorObservation({ reportId: report.id, title: source.title, narrative: source.narrative });
      }

      for (const index of includedHighlightIndexes) {
        const source = parsed.highlightEntries[index];
        const photos = source.photos.map(blob => ({ blob, width: 0, height: 0 })); // dimensions unknown for legacy photos — see Step 4 note
        await addHighlightEntry({ reportId: report.id, photos, caption: source.caption });
      }

      onImported();
    } catch (err) {
      errorEl.textContent = '匯入失敗，請再試一次';
    }
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportImportPreviewView.test.js`
Expected: PASS

**Note on `width: 0, height: 0` for imported photos:** legacy photos are extracted as raw `Blob`s with no known pixel dimensions (Task 21 never decodes them, only extracts bytes). `generateParentReportDocxExport.js`'s `highlightPhotoCell` (Task 10) computes `displayHeightPx` as `displayWidthPx * (height / width)`, which divides by zero when `width` is `0`. Before this task is considered done, open `src/export/parentReportDocxExport.js` and change that line to fall back to a square aspect ratio when `width` is falsy:

```js
const displayHeightPx = photo.width ? displayWidthPx * (photo.height / photo.width) : displayWidthPx;
```

(This is already the exact code from Task 10 — confirm it's there; if Task 10 was implemented differently, apply this guard now.) Add a regression test to `tests/parentReportDocxExport.test.js`'s `buildHighlightsTable` describe block:

```js
it('falls back to a square aspect ratio when a photo has no known width (e.g. legacy-imported)', async () => {
  const entries = [{ id: 1, reportId: 1, photos: [{ blob: new Blob(['a']), width: 0, height: 0 }], caption: 'x' }];
  const table = await buildHighlightsTable(entries);
  const xml = await tableToXml(table);
  expect(xml).toContain('<w:drawing>'); // did not throw / divide by zero
});
```

- [ ] **Step 5: Wire the import trigger into `parentReportListView.js`**

Add to `src/ui/parentReportListView.js`, mirroring the exact pattern already in `childListView.js`'s Word-import trigger:

```js
import { parseParentReportDocxImport } from '../import/parentReportDocxImport.js';
import { renderParentReportImportPreviewView } from './parentReportImportPreviewView.js';
```

Add to the template (after the add-report `<form>`):

```html
<div class="import-trigger">
  <button type="button" class="btn btn--outline" data-action="import-docx">匯入舊版 Word 檔（適性紀錄）</button>
  <input type="file" accept=".docx" data-field="import-file" hidden>
  <p class="field-error" data-error="import"></p>
</div>
```

Add the wiring (mirroring `childListView.js`'s `fileInput` handling exactly):

```js
const fileInput = container.querySelector('[data-field="import-file"]');
container.querySelector('[data-action="import-docx"]').addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;
  const importErrorEl = container.querySelector('[data-error="import"]');

  try {
    const parsed = await parseParentReportDocxImport(file);
    renderParentReportImportPreviewView(container, {
      parsed,
      onCancel: () => renderParentReportListView(container, { child, onSelectReport, onBack, confirmDelete }),
      onImported: () => renderParentReportListView(container, { child, onSelectReport, onBack, confirmDelete }),
    });
  } catch (err) {
    importErrorEl.textContent = '無法讀取這個檔案，請確認是有效的 Word 檔案';
    fileInput.value = '';
  }
});
```

- [ ] **Step 6: Write the failing tests for the wiring**

Add to `tests/parentReportListView.test.js` (mirroring `childListView.test.js`'s equivalent tests):

```js
function selectFile(input, file) {
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change'));
}

it('shows an error and stays on the list when the selected file cannot be read', async () => {
  const container = document.createElement('div');
  await renderParentReportListView(container, { child, onSelectReport: () => {}, onBack: () => {} });

  const badFile = new Blob(['not a docx file'], { type: 'text/plain' });
  selectFile(container.querySelector('[data-field="import-file"]'), badFile);

  await waitFor(() => container.textContent.includes('無法讀取這個檔案'));
  expect(container.textContent).toContain('的適性紀錄(家長版)');
});
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run tests/parentReportListView.test.js tests/parentReportImportPreviewView.test.js tests/parentReportDocxExport.test.js`
Expected: PASS

- [ ] **Step 8: Run the full suite**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run`
Expected: all tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/ui/parentReportImportPreviewView.js src/ui/parentReportListView.js src/export/parentReportDocxExport.js tests/parentReportImportPreviewView.test.js tests/parentReportListView.test.js tests/parentReportDocxExport.test.js
git commit -m "Add legacy import preview/confirm UI for 適性紀錄, wire into parentReportListView"
```

---

### Task 23: Styling — tabs, photo upload grid, type-select screen, absent strikethrough

**Files:**
- Modify: `src/styles.css`

No new test file — this task is visual/CSS-only and is verified in Task 24's manual browser pass. Read the existing `src/styles.css` in full first so new rules match its existing conventions (custom property names, spacing scale, `.btn`/`.panel-form`/`.card-list`/`.field-error`/`.domain-card` classes already established) exactly, rather than introducing a parallel styling vocabulary.

- [ ] **Step 1: Add the report-type select screen styling**

Append near the other page-level layout rules (after `.page-header` rules):

```css
.type-select {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  max-width: 360px;
  margin: 3rem auto;
}

.type-select__option {
  width: 100%;
  padding: 1.25rem;
  font-size: 1.1rem;
}
```

- [ ] **Step 2: Add tab component styling**

```css
/* ---------- Tabs (適性紀錄家長版 editor) ---------- */

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0 0 1.2rem;
  border-bottom: 1px solid var(--border);
}

.tabs__button {
  padding: 0.6rem 1.1rem;
  border: none;
  border-bottom: 3px solid transparent;
  background: none;
  cursor: pointer;
  font-size: 1rem;
  color: var(--text-secondary);
}

.tabs__button--active {
  color: var(--brand);
  border-bottom-color: var(--brand);
  font-weight: 700;
}

.tabs__panel {
  min-height: 200px;
}
```

(If this codebase's `styles.css` does not define `--brand`/`--text-secondary`/`--border` under those exact names, use whichever custom properties it already uses for the equivalent roles — check the `:root` block at the top of the file before assuming these names.)

- [ ] **Step 3: Add the absent/struck-through entry style**

```css
.entry-row--absent .entry-row__date,
.entry-row--absent .entry-row__note {
  text-decoration: line-through;
  color: var(--text-secondary);
}
```

- [ ] **Step 4: Add the photo upload grid and thumbnail styling**

```css
/* ---------- 點滴分享 photo upload ---------- */

.highlight-upload-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.8rem;
  margin: 0.6rem 0;
}

.highlight-upload-slot {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.8rem;
  border: 1px dashed var(--border);
  border-radius: 10px;
  text-align: center;
}

.highlight-upload-slot__preview {
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.highlight-thumbs {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 0.4rem;
}

.highlight-thumb {
  width: 100%;
  max-width: 120px;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--border);
}

.highlight-thumb--empty {
  display: block;
  width: 100%;
  max-width: 120px;
  aspect-ratio: 4 / 3;
  border-radius: 6px;
  border: 1px dashed var(--border);
  background: var(--surface);
}
```

- [ ] **Step 5: Add the checkbox-row and fieldset styling used in the 適性發展紀錄表 tab and import preview**

```css
.panel-form__checkbox-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0;
}
```

(`fieldset`/`legend` inside `.panel-form` inherit the existing `.panel-form__field` spacing if `fieldset` is given the same class — reuse `class="panel-form__field"` on the `<fieldset>` element, as already written into Task 15's `developmentRecordTabView.js` markup, rather than adding a new fieldset-specific rule.)

- [ ] **Step 6: Run the desktop build and eyeball every new screen**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && npm run build
```

Open `dist/TableC.html` in a real browser, unlock, and visually check: the type-select screen, the tab bar (active tab visibly distinct), a course-plan entry with an absent/struck-through occurrence, and the photo upload grid with a thumbnail after selecting a file. Fix any obvious layout issues (overflow, unreadable contrast) before moving on — this step has no automated test, it is a human visual check.

- [ ] **Step 7: Commit**

```bash
git add src/styles.css
git commit -m "Style the type-select screen, tabs, absent strikethrough, and 點滴分享 upload grid"
```

---

### Task 24: End-to-end docx fidelity verification against the real reference sample

**Files:** none (verification only — this task may still produce fixes to `src/export/parentReportDocxExport.js` if it finds a mismatch, which is expected and should be committed as its own small follow-up commit, not folded silently into this task's notes).

This mirrors exactly how 適性總表's docx export was verified earlier in this project: generate a real file with real Word, not just inspect the XML.

- [ ] **Step 1: Build a complete sample 適性紀錄 through the UI**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && npm run build
```

Open `dist/TableC.html`, unlock, choose 適性紀錄(家長版), create a fictional child (use `陳小安`, birthdate `2024-06-20` — matching the Global Constraints' rule against ever using a real child's name), create a report at tier Ⅴ / period `115年06月`, and fill in a handful of entries across at least 3 different domains in 課程計畫表 (including at least one absent/struck-through occurrence), 2+ 適性發展紀錄表 paragraphs, 1 行為觀察 entry, and 1 點滴分享 entry with 2–3 real photo uploads. Export the Word file.

- [ ] **Step 2: Convert both the exported file and the reference PDF sample to comparable images**

Using this project's established PowerShell + Word COM automation pattern (`New-Object -ComObject Word.Application`, `Documents.Open`, `SaveAs` with PDF format code 17), convert the exported `.docx` to PDF. Render both that PDF and the reference sample PDF (the real `...適性紀錄(家長版).pdf` sample file already in the repo root, gitignored) to PNG per page with PyMuPDF (`fitz`), matching the exact workflow already used and documented for 適性總表's fidelity verification earlier in this project.

- [ ] **Step 3: Compare page-by-page and fix any mismatch**

Check specifically: title placement and icon spacing on the 課程計畫表 page, domain cell shading colors, the ○/△ symbols and the absent strikethrough rendering, the 適性發展紀錄表 domain header bars and indented narrative paragraphs, the 點滴分享 photo grid (3 equal columns, caption centered below), and the signature lines. If anything differs from the reference sample, fix the relevant constant or layout code in `src/export/parentReportDocxExport.js`, re-export, and re-compare — do not consider this task done until the two render visually equivalent for every section that has content in the test data from Step 1.

- [ ] **Step 4: Verify the PWA build still succeeds and carries the same title**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && npm run build:web
```

Confirm `site/index.html` still contains the app title established in the prior rename work (屏東縣內埔鄉育英公托填表系統) — this feature does not touch the app's own branding, only adds a new document type inside it.

- [ ] **Step 5: Run the full test suite one final time**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 6: Commit any fixes found in Step 3**

```bash
git add src/export/parentReportDocxExport.js
git commit -m "Fix docx export fidelity issues found against the reference 適性紀錄 sample"
```

(Only if Step 3 found something to fix — if the first export already matched, there is nothing to commit here.)

---

## Self-Review Notes

- **Spec coverage:** every section of `docs/superpowers/specs/2026-08-08-parent-report-design.md` maps to at least one task above — data model (Tasks 1–4), 課程計畫表/適性發展紀錄表/行為觀察/點滴分享 fields and docx fidelity (Tasks 7–10, 14–17, 24), navigation flow (Task 11), 新增/刪除 (Tasks 12, 14–17 all include delete), Word 匯出 (Tasks 7–10), 舊檔匯入 (Tasks 19–22), 儲存與備份 (Task 18).
- **Backward compatibility:** Task 1's migration test and Task 18's version-1-backup test are the two concrete guards against breaking real, already-deployed user data — do not skip either, even under time pressure.
- **Known simplifications, called out explicitly in-line rather than silently:** the 適性發展紀錄表/點滴分享 tables are built as clean, regular grids instead of literally reproducing the reference sample's irregular hand-edited 6-column merge pattern (Task 9, Task 10) — the visual result matches, the underlying OOXML does not need to byte-match a human-edited artifact; legacy photo-to-caption matching during import is best-effort by document order, not relationship-id-exact (Task 21), which is why the mandatory preview step (Task 22) exists.
- **After Task 24:** this plan is complete. Continue with `superpowers:finishing-a-development-branch` if this work was done on a branch, or otherwise let the user decide on committing/deploying — this plan does not itself decide whether/when to redeploy the `public` branch, since the earlier rename work in this project treated that as a separate, explicitly-confirmed action each time.

