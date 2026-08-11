# 彙整進現有總表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a teacher merge selected 適性紀錄(家長版) course-plan data into an **existing** 適性總表 instead of always creating a new one, with automatic duplicate-row skipping and period-range widening.

**Architecture:** `aggregateCoursePlanIntoForm` (in `src/domain/aggregateCoursePlan.js`) gains an optional `targetFormId` parameter. When present, it writes into that existing `AssessmentForm` instead of calling `addForm`, skipping any row that exactly duplicates one already in the target form, and widens the form's `period` to the min-max range covering both its existing period and the newly merged reports' periods. The UI (`src/ui/aggregateCoursePlanView.js`) gains a radio choice ("建立新總表" / "合併進現有總表") and, when the latter is picked, a dropdown of the child's existing same-tier total forms to merge into.

**Tech Stack:** Vanilla JS (ES modules, no framework), IndexedDB, vitest + jsdom for tests. No new dependencies.

## Global Constraints

- All UI text is Traditional Chinese, matching the existing app's wording conventions.
- No new npm dependency.
- Reuse existing CSS classes (`panel-form__field`, `panel-form__checkbox-row`) — this plan introduces **no new CSS**, since the existing classes already provide the right layout for a radio row (flex + gap + padding) and a labeled select.
- Every UI/domain function follows the existing pattern in its sibling code (destructured params, `escapeHtml()` on every interpolated value, full `container.innerHTML =` re-render on state change).
- Run `npx vitest run` (whole suite) after each task.
- This plan does not cover deployment (copying `site/` to the `public` branch and pushing) — that remains a separate, explicitly-requested step.

---

### Task 1: `storage/db.js` — `updateForm`

**Files:**
- Modify: `src/storage/db.js` (add `updateForm`, right after `getForm`)
- Test: `tests/db.test.js`

**Interfaces:**
- Produces: `updateForm(id, changes)` → `Promise<AssessmentForm>` — reads the existing form, merges `changes` in, writes it back, returns the updated record; throws `Error('Form ${id} not found')` if `id` doesn't resolve to a real form. Mirrors `updateEntry`'s exact shape. Consumed by Task 2.

- [ ] **Step 1: Write the failing tests**

Add this import to `tests/db.test.js`'s existing `import { ... } from '../src/storage/db.js';` block (alongside `addForm, listFormsForChild, getForm, deleteForm`):

```js
  addForm, listFormsForChild, getForm, deleteForm, updateForm,
```

Add these two tests inside the existing `describe('forms and entries storage', ...)` block, after the `'gets a form by id'` test:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/db.test.js`
Expected: FAIL — `updateForm` is not exported from `src/storage/db.js` yet (import error / `updateForm is not a function`).

- [ ] **Step 3: Implement `updateForm` in `src/storage/db.js`**

Insert this function right after `getForm` (currently `src/storage/db.js:50-52`), before the `// Cascades: deleting a form...` comment on `deleteForm`:

```js
export async function updateForm(id, changes) {
  const existing = await runRequest('forms', 'readonly', store => store.get(id));
  if (!existing) {
    throw new Error(`Form ${id} not found`);
  }
  const updated = { ...existing, ...changes, id };
  await runRequest('forms', 'readwrite', store => store.put(updated));
  return updated;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/db.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/storage/db.js tests/db.test.js
git commit -m "feat: 新增 updateForm，供彙整進現有總表功能更新紀錄年月"
```

---

### Task 2: `domain/aggregateCoursePlan.js` — merge into an existing form

**Files:**
- Modify: `src/domain/aggregateCoursePlan.js` (whole file — see Step 3 for the complete replacement)
- Test: `tests/aggregateCoursePlan.test.js`

**Interfaces:**
- Consumes: `updateForm(id, changes)` from Task 1; `getForm`, `addForm`, `addEntry`, `listEntriesForForm` from `src/storage/db.js` (all already exist except `updateForm`).
- Produces: `aggregateCoursePlanIntoForm({ childId, tier, reportIds, targetFormId })` → `Promise<{ form, failed, skippedDuplicates }>`. `targetFormId` is optional (default `null`/omitted); when omitted, behavior is unchanged from before this task (creates a new form, `skippedDuplicates` is always `0`). When provided, merges into that existing form instead. Consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

In `tests/aggregateCoursePlan.test.js`, change the import line to add `addForm, addEntry`:

```js
import { clearAllData, addChild, listEntriesForForm, addForm, addEntry } from '../src/storage/db.js';
```

Add this assertion to the existing `'merges course-plan occurrences from multiple same-tier reports into one new form'` test — change its destructuring and add one line, right after `expect(failed).toEqual([]);`:

```js
    const { form, failed, skippedDuplicates } = await aggregateCoursePlanIntoForm({
      childId: child.id,
      tier: 'Ⅴ',
      reportIds: [reportJan.id, reportFeb.id],
    });

    expect(form.childId).toBe(child.id);
    expect(form.tier).toBe('Ⅴ');
    expect(failed).toEqual([]);
    expect(skippedDuplicates).toBe(0);
```

Then add this new `describe` block at the end of the file, right before the file's closing `});` of the outer `describe('aggregateCoursePlanIntoForm', ...)`:

```js
  describe('merging into an existing target form', () => {
    it('writes into the existing form instead of creating a new one when targetFormId is given', async () => {
      const existingForm = await addForm({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
      const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年02月' });
      const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
      await addCourseOccurrence({ entryId: entry.id, date: '2026-02-10', status: 'developed', absent: false, note: '二月的紀錄' });

      const { form, skippedDuplicates } = await aggregateCoursePlanIntoForm({
        childId: child.id, tier: 'Ⅴ', reportIds: [report.id], targetFormId: existingForm.id,
      });

      expect(form.id).toBe(existingForm.id);
      expect(skippedDuplicates).toBe(0);

      const entries = await listEntriesForForm(existingForm.id);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ indicatorCode: 'Ⅴ-1-6', date: '2026-02-10', status: 'developed', note: '二月的紀錄' });
    });

    it('skips rows that exactly match an entry already in the target form, and counts them', async () => {
      const existingForm = await addForm({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
      await addEntry({ formId: existingForm.id, indicatorCode: 'Ⅴ-1-6', date: '2026-01-10', status: 'developed', note: '一月的紀錄' });

      const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
      const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
      await addCourseOccurrence({ entryId: entry.id, date: '2026-01-10', status: 'developed', absent: false, note: '一月的紀錄' });

      const { skippedDuplicates } = await aggregateCoursePlanIntoForm({
        childId: child.id, tier: 'Ⅴ', reportIds: [report.id], targetFormId: existingForm.id,
      });

      expect(skippedDuplicates).toBe(1);
      const entries = await listEntriesForForm(existingForm.id);
      expect(entries).toHaveLength(1);
    });

    it('skips duplicates within the same batch (two selected reports producing an identical row)', async () => {
      const existingForm = await addForm({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });

      const reportA = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
      const entryA = await addCoursePlanEntry({ reportId: reportA.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
      await addCourseOccurrence({ entryId: entryA.id, date: '2026-01-10', status: 'developed', absent: false, note: '重複' });

      const reportB = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
      const entryB = await addCoursePlanEntry({ reportId: reportB.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
      await addCourseOccurrence({ entryId: entryB.id, date: '2026-01-10', status: 'developed', absent: false, note: '重複' });

      const { skippedDuplicates } = await aggregateCoursePlanIntoForm({
        childId: child.id, tier: 'Ⅴ', reportIds: [reportA.id, reportB.id], targetFormId: existingForm.id,
      });

      expect(skippedDuplicates).toBe(1);
      const entries = await listEntriesForForm(existingForm.id);
      expect(entries).toHaveLength(1);
    });

    it('widens the period range: existing single period + a new report period', async () => {
      const existingForm = await addForm({ childId: child.id, tier: 'Ⅴ', period: '115年05月' });
      const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年07月' });

      const { form } = await aggregateCoursePlanIntoForm({
        childId: child.id, tier: 'Ⅴ', reportIds: [report.id], targetFormId: existingForm.id,
      });

      expect(form.period).toBe('115年05月-115年07月');
    });

    it('widens the period range: existing range + a new report period', async () => {
      const existingForm = await addForm({ childId: child.id, tier: 'Ⅴ', period: '115年05月-115年06月' });
      const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年07月' });

      const { form } = await aggregateCoursePlanIntoForm({
        childId: child.id, tier: 'Ⅴ', reportIds: [report.id], targetFormId: existingForm.id,
      });

      expect(form.period).toBe('115年05月-115年07月');
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/aggregateCoursePlan.test.js`
Expected: FAIL — `targetFormId` is not handled yet (`skippedDuplicates` is `undefined`, and merging writes into a brand-new form instead of the existing one).

- [ ] **Step 3: Replace `src/domain/aggregateCoursePlan.js` with this**

```js
import { getIndicator } from '../data/indicators.js';
import { addForm, addEntry, getForm, updateForm, listEntriesForForm } from '../storage/db.js';
import { getParentReport, listCoursePlanEntriesForReport, listCourseOccurrencesForEntry } from '../storage/parentReportDb.js';

// "115年05月-115年08月" (min-max range) from a flat list of period strings, collapsing to a
// single value when there's only one distinct period.
function combinedPeriodRange(periods) {
  if (periods.length === 0) return '';
  const sorted = [...periods].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return first === last ? first : `${first}-${last}`;
}

// An existing AssessmentForm's own period may already be a range ("115年05月-115年08月") from a
// prior merge — split it back into its parts so a further merge can fold them into the new range.
function periodRangeParts(period) {
  return period.includes('-') ? period.split('-') : [period];
}

// A composite key identifying "the same observation" for duplicate-skipping when merging into an
// existing form. JSON.stringify of an array safely separates fields regardless of their content
// (no manual delimiter that a note's text could collide with).
function entrySignature({ indicatorCode, date, status, note }) {
  return JSON.stringify([indicatorCode, date, status, note]);
}

// Merges the 課程計畫表 data of several same-tier 適性紀錄(家長版) into one 適性總表
// (AssessmentForm) — either a brand-new one, or an existing one when `targetFormId` is given.
// Each ParentReport's CoursePlanEntry/CourseOccurrence pairs become ObservationEntry rows;
// 請假／未執行 occurrences are dropped (the teacher did not actually run the activity, so the
// total form has nothing to show for that date); an entry whose indicator code can't be resolved
// for the target tier is skipped and reported back in `failed` instead of aborting the whole
// merge. When merging into an existing form, a row that exactly duplicates one already in that
// form (same indicatorCode+date+status+note) is skipped and counted in `skippedDuplicates`
// instead of being written twice.
export async function aggregateCoursePlanIntoForm({ childId, tier, reportIds, targetFormId = null }) {
  const reports = [];
  for (const reportId of reportIds) {
    const report = await getParentReport(reportId);
    if (report) reports.push(report);
  }
  reports.sort((a, b) => a.period.localeCompare(b.period));

  const toWrite = [];
  const failed = [];

  for (const report of reports) {
    const entries = await listCoursePlanEntriesForReport(report.id);
    for (const entry of entries) {
      const indicator = getIndicator(entry.indicatorCode);
      if (!indicator || indicator.tier !== tier) {
        failed.push({
          reportPeriod: report.period,
          indicatorCode: entry.indicatorCode,
          activityName: entry.activityName,
          reason: indicator ? '指標不屬於此階段' : '找不到對應指標',
        });
        continue;
      }

      const occurrences = (await listCourseOccurrencesForEntry(entry.id)).sort((a, b) => a.date.localeCompare(b.date));
      for (const occurrence of occurrences) {
        if (occurrence.absent) continue;
        toWrite.push({ indicatorCode: entry.indicatorCode, date: occurrence.date, status: occurrence.status, note: occurrence.note });
      }
    }
  }

  let form;
  let skippedDuplicates = 0;

  if (targetFormId) {
    form = await getForm(targetFormId);
    const existingEntries = await listEntriesForForm(targetFormId);
    const seen = new Set(existingEntries.map(entrySignature));

    const rowsToWrite = [];
    for (const row of toWrite) {
      const signature = entrySignature(row);
      if (seen.has(signature)) {
        skippedDuplicates += 1;
        continue;
      }
      seen.add(signature);
      rowsToWrite.push(row);
    }

    const period = combinedPeriodRange([...periodRangeParts(form.period), ...reports.map(r => r.period)]);
    form = await updateForm(targetFormId, { period });

    for (const row of rowsToWrite) {
      await addEntry({ formId: form.id, ...row });
    }
  } else {
    const period = combinedPeriodRange(reports.map(r => r.period));
    form = await addForm({ childId, tier, period });
    for (const row of toWrite) {
      await addEntry({ formId: form.id, ...row });
    }
  }

  return { form, failed, skippedDuplicates };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/aggregateCoursePlan.test.js`
Expected: PASS (all tests in the file, old and new)

- [ ] **Step 5: Commit**

```bash
git add src/domain/aggregateCoursePlan.js tests/aggregateCoursePlan.test.js
git commit -m "feat: aggregateCoursePlanIntoForm 支援合併進現有總表（跳過重複、擴大紀錄年月範圍）"
```

---

### Task 3: `ui/aggregateCoursePlanView.js` — 建立新總表／合併進現有總表 選項

**Files:**
- Modify: `src/ui/aggregateCoursePlanView.js` (whole file — see Step 3 for the complete replacement)
- Test: `tests/aggregateCoursePlanView.test.js`

**Interfaces:**
- Consumes: `aggregateCoursePlanIntoForm({ childId, tier, reportIds, targetFormId })` from Task 2 (now returns `{ form, failed, skippedDuplicates }`); `listFormsForChild(childId)` from `src/storage/db.js` (already exists, not previously imported by this file).
- No change to `renderAggregateCoursePlanView(container, { child, onCreated, onBack })`'s own signature — Task 8 of the earlier plan already wired `app.js`/`formListView.js` to it, nothing there needs to change.

- [ ] **Step 1: Write the failing tests**

In `tests/aggregateCoursePlanView.test.js`, change the import line to add `addForm, addEntry`:

```js
import { clearAllData, addChild, addForm, addEntry } from '../src/storage/db.js';
```

Add these tests, inserted right after the existing `'lists only the reports for the selected tier, and switches when the tier changes'` test and before `'requires at least one report to be checked before submitting'`:

```js
  it('disables 合併進現有總表 when the selected tier has no existing forms', async () => {
    await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });

    const container = document.createElement('div');
    await renderAggregateCoursePlanView(container, { child, onCreated: () => {}, onBack: () => {} });

    expect(container.querySelector('[data-field="target-mode"][value="existing"]').disabled).toBe(true);
    expect(container.querySelector('[data-field="target-form"]')).toBeNull();
  });

  it('lists existing forms for the tier once 合併進現有總表 is selected', async () => {
    await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    await addForm({ childId: child.id, tier: 'Ⅴ', period: '115年03月' });

    const container = document.createElement('div');
    await renderAggregateCoursePlanView(container, { child, onCreated: () => {}, onBack: () => {} });

    const existingRadio = container.querySelector('[data-field="target-mode"][value="existing"]');
    expect(existingRadio.disabled).toBe(false);
    existingRadio.checked = true;
    existingRadio.dispatchEvent(new Event('change', { bubbles: true }));

    const options = [...container.querySelectorAll('[data-field="target-form"] option')].map(o => o.textContent);
    expect(options).toContain('115年03月');
  });

  it('resets to 建立新總表 when switching to a tier with no existing forms', async () => {
    // Tiers sort to ['Ⅳ', 'Ⅴ'], so the view's default selected tier is Ⅳ — explicitly switch to
    // Ⅴ first (the tier that has an existing form) before exercising the existing-mode selection,
    // then switch to Ⅳ (no existing form) to verify the reset.
    await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    await addParentReport({ childId: child.id, tier: 'Ⅳ', period: '114年11月' });
    await addForm({ childId: child.id, tier: 'Ⅴ', period: '115年03月' });

    const container = document.createElement('div');
    await renderAggregateCoursePlanView(container, { child, onCreated: () => {}, onBack: () => {} });

    container.querySelector('[data-field="tier"]').value = 'Ⅴ';
    container.querySelector('[data-field="tier"]').dispatchEvent(new Event('change', { bubbles: true }));

    const existingRadio = container.querySelector('[data-field="target-mode"][value="existing"]');
    existingRadio.checked = true;
    existingRadio.dispatchEvent(new Event('change', { bubbles: true }));
    expect(container.querySelector('[data-field="target-form"]')).not.toBeNull();

    container.querySelector('[data-field="tier"]').value = 'Ⅳ';
    container.querySelector('[data-field="tier"]').dispatchEvent(new Event('change', { bubbles: true }));

    expect(container.querySelector('[data-field="target-mode"][value="new"]').checked).toBe(true);
    expect(container.querySelector('[data-field="target-form"]')).toBeNull();
  });

  it('requires selecting a target form when 合併進現有總表 is chosen', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    await addForm({ childId: child.id, tier: 'Ⅴ', period: '115年03月' });

    const container = document.createElement('div');
    await renderAggregateCoursePlanView(container, { child, onCreated: () => {}, onBack: () => {} });

    const existingRadio = container.querySelector('[data-field="target-mode"][value="existing"]');
    existingRadio.checked = true;
    existingRadio.dispatchEvent(new Event('change', { bubbles: true }));

    container.querySelector(`[data-report-checkbox="${report.id}"]`).checked = true;
    container.querySelector('[data-action="aggregate"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(container.querySelector('[data-action="aggregate"] [data-error]').textContent).toContain('請選擇要合併進去的總表');
  });

  it('merges into the selected existing form and calls onCreated directly when clean', async () => {
    const existingForm = await addForm({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年02月' });
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-02-10', status: 'developed', absent: false, note: 'x' });

    const container = document.createElement('div');
    let created = null;
    await renderAggregateCoursePlanView(container, { child, onCreated: form => { created = form; }, onBack: () => {} });

    const existingRadio = container.querySelector('[data-field="target-mode"][value="existing"]');
    existingRadio.checked = true;
    existingRadio.dispatchEvent(new Event('change', { bubbles: true }));
    container.querySelector('[data-field="target-form"]').value = String(existingForm.id);

    container.querySelector(`[data-report-checkbox="${report.id}"]`).checked = true;
    container.querySelector('[data-action="aggregate"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => created !== null);
    expect(created.id).toBe(existingForm.id);
    expect(created.period).toBe('115年01月-115年02月');
  });

  it('shows the skipped-duplicates count and only navigates after "前往查看總表" is clicked', async () => {
    const existingForm = await addForm({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    await addEntry({ formId: existingForm.id, indicatorCode: 'Ⅴ-1-6', date: '2026-01-10', status: 'developed', note: 'x' });

    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-01-10', status: 'developed', absent: false, note: 'x' });

    const container = document.createElement('div');
    let created = null;
    await renderAggregateCoursePlanView(container, { child, onCreated: form => { created = form; }, onBack: () => {} });

    const existingRadio = container.querySelector('[data-field="target-mode"][value="existing"]');
    existingRadio.checked = true;
    existingRadio.dispatchEvent(new Event('change', { bubbles: true }));
    container.querySelector('[data-field="target-form"]').value = String(existingForm.id);

    container.querySelector(`[data-report-checkbox="${report.id}"]`).checked = true;
    container.querySelector('[data-action="aggregate"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => container.querySelector('[data-action="go-to-form"]'));
    expect(container.textContent).toContain('已跳過 1 筆重複資料');
    expect(created).toBeNull();

    container.querySelector('[data-action="go-to-form"]').click();
    expect(created).not.toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/aggregateCoursePlanView.test.js`
Expected: FAIL — `[data-field="target-mode"]` doesn't exist in the rendered output yet.

- [ ] **Step 3: Replace `src/ui/aggregateCoursePlanView.js` with this**

```js
import { listParentReportsForChild } from '../storage/parentReportDb.js';
import { listFormsForChild } from '../storage/db.js';
import { aggregateCoursePlanIntoForm } from '../domain/aggregateCoursePlan.js';
import { escapeHtml } from './escapeHtml.js';

function resultSummaryHtml(failed, skippedDuplicates) {
  const failedSection =
    failed.length > 0
      ? `<p>以下 ${failed.length} 筆因故無法帶入：</p>
         <ul>
           ${failed
             .map(
               item =>
                 `<li>${escapeHtml(item.reportPeriod)}　${escapeHtml(item.indicatorCode)}　【${escapeHtml(item.activityName)}】—${escapeHtml(item.reason)}</li>`
             )
             .join('')}
         </ul>`
      : '';
  const skippedSection = skippedDuplicates > 0 ? `<p>已跳過 ${skippedDuplicates} 筆重複資料</p>` : '';

  return `
    <div class="field-error" data-aggregate-result>
      <p>已完成彙整，但：</p>
      ${failedSection}
      ${skippedSection}
      <button type="button" class="btn btn--primary" data-action="go-to-form">前往查看總表</button>
    </div>
  `;
}

export async function renderAggregateCoursePlanView(container, { child, onCreated, onBack }) {
  const reports = await listParentReportsForChild(child.id);

  if (reports.length === 0) {
    container.innerHTML = `
      <div class="page-header">
        <button type="button" class="btn btn--ghost" data-action="back">← 返回適性總表列表</button>
        <h2 class="page-header__title">${escapeHtml(child.name)}　從適性紀錄彙整</h2>
      </div>
      <p>這位幼兒尚無適性紀錄可彙整</p>
    `;
    container.querySelector('[data-action="back"]').addEventListener('click', onBack);
    return;
  }

  const forms = await listFormsForChild(child.id);
  const tiers = [...new Set(reports.map(r => r.tier))].sort();
  let selectedTier = tiers[0];
  let selectedMode = 'new';

  function reportsForTier(tier) {
    return reports.filter(r => r.tier === tier).sort((a, b) => a.period.localeCompare(b.period));
  }

  function formsForTier(tier) {
    return forms.filter(f => f.tier === tier).sort((a, b) => a.period.localeCompare(b.period));
  }

  function render(failed = null, createdForm = null, skippedDuplicates = 0) {
    const tierReports = reportsForTier(selectedTier);
    const tierForms = formsForTier(selectedTier);
    if (tierForms.length === 0) selectedMode = 'new';

    container.innerHTML = `
      <div class="page-header">
        <button type="button" class="btn btn--ghost" data-action="back">← 返回適性總表列表</button>
        <h2 class="page-header__title">${escapeHtml(child.name)}　從適性紀錄彙整</h2>
      </div>
      <form class="panel-form" data-action="aggregate">
        <label class="panel-form__field">
          月齡階段
          <select data-field="tier">
            ${tiers.map(t => `<option value="${escapeHtml(t)}" ${t === selectedTier ? 'selected' : ''}>${escapeHtml(t)} 階段</option>`).join('')}
          </select>
        </label>
        <fieldset class="panel-form__field">
          <legend>選擇要彙整的適性紀錄</legend>
          ${tierReports
            .map(
              r => `
                <label class="panel-form__checkbox-row">
                  <input type="checkbox" data-report-checkbox="${escapeHtml(r.id)}">
                  ${escapeHtml(r.period)}
                </label>
              `
            )
            .join('')}
        </fieldset>
        <fieldset class="panel-form__field">
          <legend>彙整方式</legend>
          <label class="panel-form__checkbox-row">
            <input type="radio" name="target-mode" data-field="target-mode" value="new" ${selectedMode === 'new' ? 'checked' : ''}>
            建立新總表
          </label>
          <label class="panel-form__checkbox-row">
            <input type="radio" name="target-mode" data-field="target-mode" value="existing" ${selectedMode === 'existing' ? 'checked' : ''} ${tierForms.length === 0 ? 'disabled' : ''}>
            合併進現有總表
          </label>
          ${
            selectedMode === 'existing'
              ? `<label class="panel-form__field">
                   選擇要合併進去的總表
                   <select data-field="target-form">
                     <option value="">請選擇</option>
                     ${tierForms.map(f => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.period)}</option>`).join('')}
                   </select>
                 </label>`
              : ''
          }
        </fieldset>
        <button type="submit" class="btn btn--primary">${selectedMode === 'existing' ? '合併進總表' : '建立總表'}</button>
        <p class="field-error" data-error></p>
      </form>
      ${failed ? resultSummaryHtml(failed, skippedDuplicates) : ''}
    `;

    container.querySelector('[data-action="back"]').addEventListener('click', onBack);

    container.querySelector('[data-field="tier"]').addEventListener('change', event => {
      selectedTier = event.target.value;
      render();
    });

    container.querySelectorAll('[data-field="target-mode"]').forEach(radio => {
      radio.addEventListener('change', event => {
        selectedMode = event.target.value;
        render();
      });
    });

    container.querySelector('[data-action="aggregate"]').addEventListener('submit', async event => {
      event.preventDefault();
      const errorEl = container.querySelector('[data-action="aggregate"] [data-error]');
      const reportIds = tierReports
        .filter(r => container.querySelector(`[data-report-checkbox="${r.id}"]`).checked)
        .map(r => r.id);

      if (reportIds.length === 0) {
        errorEl.textContent = '請至少勾選一筆適性紀錄';
        return;
      }

      let targetFormId = null;
      if (selectedMode === 'existing') {
        const targetFormValue = container.querySelector('[data-field="target-form"]').value;
        if (!targetFormValue) {
          errorEl.textContent = '請選擇要合併進去的總表';
          return;
        }
        targetFormId = Number(targetFormValue);
      }

      try {
        const {
          form,
          failed: failedResult,
          skippedDuplicates: skippedResult,
        } = await aggregateCoursePlanIntoForm({
          childId: child.id,
          tier: selectedTier,
          reportIds,
          ...(targetFormId ? { targetFormId } : {}),
        });
        if (failedResult.length === 0 && skippedResult === 0) {
          onCreated(form);
        } else {
          render(failedResult, form, skippedResult);
        }
      } catch (err) {
        errorEl.textContent = '建立失敗，請再試一次';
      }
    });

    if (failed && createdForm) {
      container.querySelector('[data-action="go-to-form"]').addEventListener('click', () => onCreated(createdForm));
    }
  }

  render();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/aggregateCoursePlanView.test.js`
Expected: PASS (all tests in the file, old and new)

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS (all files)

- [ ] **Step 6: Commit**

```bash
git add src/ui/aggregateCoursePlanView.js tests/aggregateCoursePlanView.test.js
git commit -m "feat: 彙整選擇畫面新增「建立新總表／合併進現有總表」選項"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers the spec's 「一、資料層」. Task 2 covers 「二、`aggregateCoursePlanIntoForm` 變更」 including the period-range-merge helper described in 「期別範圍合併的字串處理」. Task 3 covers 「三、UI」 including the tier-switch refresh/reset behavior and the `skippedDuplicates` display. 「四、測試」's items are distributed across each task's own test file.
- **Placeholder scan:** No TBD/TODO; every step has literal code.
- **Type consistency:** `aggregateCoursePlanIntoForm(...)` → `{ form, failed, skippedDuplicates }` is used identically in Task 2's implementation/tests and Task 3's implementation/tests. `updateForm(id, changes)` from Task 1 is used identically in Task 2. `listFormsForChild` (pre-existing, unchanged) is imported and used consistently in Task 3.
