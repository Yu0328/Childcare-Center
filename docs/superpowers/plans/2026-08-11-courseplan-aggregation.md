# 課程計畫表彙整成總表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a teacher merge the course-plan data (指標＋實施日期＋狀態＋說明) from several same-tier 適性紀錄(家長版) into one brand-new 適性總表(C表), instead of retyping it.

**Architecture:** A new domain function (`aggregateCoursePlanIntoForm`) reads `CoursePlanEntry`/`CourseOccurrence` rows from `storage/parentReportDb.js` across the selected reports, converts each non-absent occurrence into an `ObservationEntry`-shaped row, and writes them into a freshly created `AssessmentForm` via the existing `storage/db.js` API. A new UI view drives report selection; a button on the existing 適性總表 form-list screen is the entry point. This depends on first widening `ObservationEntry` from a boolean `achieved` flag to a `status` field (`developed`/`developing`), so the total-form side can represent 發展中△ the same way the course-plan side already does.

**Tech Stack:** Vanilla JS (ES modules, no framework), IndexedDB, vitest + jsdom for tests, `docx` for export. No new dependencies.

## Global Constraints

- All UI text is Traditional Chinese, matching existing copy exactly where a pattern already exists (e.g. 已發展○／發展中△ wording must match `courseplanTabView.js` verbatim).
- No new npm dependency — every task uses only what's already installed.
- Reuse existing CSS classes (`page-header`, `page-header--editor`, `panel-form`, `panel-form__checkbox-row`, `card-list`, `field-error`, `entry-form__radio-group`, `entry-form__radio`) instead of inventing new ones, except where noted.
- Every UI/domain function follows the existing pattern in its sibling files (see the file each task modifies for the exact convention to copy — e.g. `confirmDelete = message => (typeof confirm === 'function' ? confirm(message) : false)` default parameters, `escapeHtml()` on every interpolated string, re-render-by-recreating-innerHTML).
- Run `npx vitest run` (whole suite) after each task, not just the task's own test file, since Tasks 1–5 touch a shared field (`ObservationEntry.status`) consumed by many existing files.
- This plan does not cover deployment (copying `site/` to the `public` branch and pushing). That remains a separate, explicitly-requested step same as prior features.

---

## Part A — Prerequisite: `achieved` → `status` (developed/developing) on ObservationEntry

### Task 1: `storage/db.js` — `status` field + legacy-data fallback

**Files:**
- Modify: `src/storage/db.js:63-86` (`addEntry`, `listEntriesForForm`)
- Test: `tests/db.test.js`

**Interfaces:**
- Produces: `addEntry({ formId, indicatorCode, date, status, note })` → `{ id, formId, indicatorCode, date, status, note }` (no more `achieved` parameter)
- Produces: `listEntriesForForm(formId)` → array of entries, each guaranteed to have `.status` (`'developed'`|`'developing'`) even if the underlying IndexedDB record predates this change and only has `.achieved`

- [ ] **Step 1: Update existing tests to the new `status` shape and add a legacy-fallback test**

In `tests/db.test.js`, add this import at the top (alongside the existing imports):

```js
import { runRequest } from '../src/storage/dbCore.js';
```

Replace every `achieved: true` passed into `addEntry({...})` in this file with `status: 'developed'`. Concretely, these four call sites change:

```js
// line ~44, inside 'deletes a child and cascades to their forms and entries'
await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '測試' });
```

```js
// line ~102-108, inside 'adds, updates, lists and deletes entries for a form'
const entry = await addEntry({
  formId: form.id,
  indicatorCode: 'Ⅳ-1-1',
  date: '2026-01-07',
  status: 'developed',
  note: '可以來回穩定行走',
});
```

```js
// line ~131-132, inside 'deletes a form and cascades to its entries, leaving other forms untouched'
await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '測試' });
const otherEntry = await addEntry({ formId: otherForm.id, indicatorCode: 'Ⅳ-1-1', date: '2026-02-07', status: 'developed', note: '不受影響' });
```

Then add a new test at the end of the `'forms and entries storage'` describe block:

```js
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
```

- [ ] **Step 2: Run tests to verify the new test fails and the updated ones fail too (production code not yet changed)**

Run: `npx vitest run tests/db.test.js`
Expected: FAIL — the new normalization test fails because `listEntriesForForm` doesn't add `.status` yet; the updated `addEntry({..., status: ...})` calls "pass" trivially (nothing asserts on `.status` yet in those tests) but that's fine, the point is the new test drives the implementation.

- [ ] **Step 3: Implement the `status` field and fallback normalization in `src/storage/db.js`**

Replace the existing `addEntry` (currently `src/storage/db.js:63-68`):

```js
export async function addEntry({ formId, indicatorCode, date, status, note }) {
  const id = await runRequest('entries', 'readwrite', store =>
    store.add({ formId, indicatorCode, date, status, note })
  );
  return { id, formId, indicatorCode, date, status, note };
}
```

Replace the existing `listEntriesForForm` (currently `src/storage/db.js:84-86`):

```js
// Legacy records written before `status` existed only have a boolean `achieved` flag.
// Normalize them here, at the single read path every consumer (UI, docx export) goes
// through, instead of teaching every caller to understand both shapes.
export async function listEntriesForForm(formId) {
  const entries = await runRequest('entries', 'readonly', store => store.index('by_formId').getAll(formId));
  return entries.map(entry => (entry.status ? entry : { ...entry, status: entry.achieved ? 'developed' : 'developing' }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/db.test.js`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 5: Commit**

```bash
git add src/storage/db.js tests/db.test.js
git commit -m "feat: replace ObservationEntry.achieved with a developed/developing status"
```

---

### Task 2: `ui/formEditorView.js` — 已發展○／發展中△ radio group

**Files:**
- Modify: `src/ui/formEditorView.js` (whole file — `entryRow`, `indicatorBlock`, the add-entry and edit-entry submit handlers)
- Test: `tests/formEditorView.test.js`

**Interfaces:**
- Consumes: `addEntry({ formId, indicatorCode, date, status, note })`, `updateEntry(id, changes)`, `listEntriesForForm(formId)` from Task 1 (all entries returned from storage now always have `.status`)
- Produces: no exports beyond the existing `renderFormEditorView` — this task only changes what's rendered inside it

- [ ] **Step 1: Update existing tests and add new status-specific tests**

In `tests/formEditorView.test.js`:

Replace every `achieved: true` passed to `addEntry({...})` with `status: 'developed'` (4 call sites: in `'renders existing entries under their indicator'`, `'deletes an entry after confirmation'`, `'keeps the entry when deletion is not confirmed'`, `'edits an existing entry...'`, `'renders a malicious entry note...'`).

Replace the body of `'adds a new entry for an indicator via its inline form'` (currently lines 34–52):

```js
  it('adds a new entry for an indicator via its inline form', async () => {
    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    const addButton = container.querySelector('[data-add-entry-for="Ⅳ-1-1"]');
    addButton.click();

    container.querySelector('[data-entry-field="date"][data-indicator-code="Ⅳ-1-1"]').value = '2026-01-07';
    container.querySelector('[data-entry-field="status"][data-indicator-code="Ⅳ-1-1"][value="developed"]').checked = true;
    container.querySelector('[data-entry-field="note"][data-indicator-code="Ⅳ-1-1"]').value = '可以來回穩定行走';
    container.querySelector('[data-entry-save-for="Ⅳ-1-1"]').click();

    await waitFor(() => container.textContent.includes('可以來回穩定行走'));

    const entries = await listEntriesForForm(form.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].note).toBe('可以來回穩定行走');
    expect(entries[0].status).toBe('developed');
    expect(container.textContent).toContain('可以來回穩定行走');
  });

  it('adds a new entry with 發展中△ status when that radio is selected, and shows the △ mark', async () => {
    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    container.querySelector('[data-add-entry-for="Ⅳ-1-1"]').click();
    container.querySelector('[data-entry-field="date"][data-indicator-code="Ⅳ-1-1"]').value = '2026-01-07';
    container.querySelector('[data-entry-field="status"][data-indicator-code="Ⅳ-1-1"][value="developing"]').checked = true;
    container.querySelector('[data-entry-field="note"][data-indicator-code="Ⅳ-1-1"]').value = '仍在練習';
    container.querySelector('[data-entry-save-for="Ⅳ-1-1"]').click();

    await waitFor(() => container.textContent.includes('仍在練習'));

    const entries = await listEntriesForForm(form.id);
    expect(entries[0].status).toBe('developing');
    expect(container.querySelector(`[data-entry="${entries[0].id}"] .entry-row__mark`).textContent).toBe('△');
  });
```

Replace the body of `'edits an existing entry: ...'` (currently lines 95–117):

```js
  it('edits an existing entry: shows a pre-filled form, saves via updateEntry, and re-renders with the new value', async () => {
    const entry = await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '可以來回穩定行走' });

    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    const editForm = container.querySelector(`[data-entry-edit-form-for="${entry.id}"]`);
    expect(editForm.hidden).toBe(true);

    container.querySelector(`[data-edit-entry="${entry.id}"]`).click();
    expect(editForm.hidden).toBe(false);
    expect(container.querySelector(`[data-entry-edit-field="date"][data-entry-id="${entry.id}"]`).value).toBe('2026-01-07');
    expect(container.querySelector(`[data-entry-edit-field="status"][data-entry-id="${entry.id}"][value="developed"]`).checked).toBe(true);
    expect(container.querySelector(`[data-entry-edit-field="note"][data-entry-id="${entry.id}"]`).value).toBe('可以來回穩定行走');

    container.querySelector(`[data-entry-edit-field="note"][data-entry-id="${entry.id}"]`).value = '現在走得更穩了';
    container.querySelector(`[data-entry-edit-save-for="${entry.id}"]`).click();

    await waitFor(() => container.textContent.includes('現在走得更穩了'));

    const [updated] = await listEntriesForForm(form.id);
    expect(updated.note).toBe('現在走得更穩了');
  });

  it('changes an entry from 已發展○ to 發展中△ via the edit form', async () => {
    const entry = await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: 'x' });

    const container = document.createElement('div');
    await renderFormEditorView(container, { child, form, onBack: () => {} });

    container.querySelector(`[data-edit-entry="${entry.id}"]`).click();
    container.querySelector(`[data-entry-edit-field="status"][data-entry-id="${entry.id}"][value="developing"]`).checked = true;
    container.querySelector(`[data-entry-edit-save-for="${entry.id}"]`).click();

    await waitFor(async () => (await listEntriesForForm(form.id))[0].status === 'developing');

    const [updated] = await listEntriesForForm(form.id);
    expect(updated.status).toBe('developing');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/formEditorView.test.js`
Expected: FAIL — the checkbox selectors (`[data-entry-field="achieved"]`, `[data-entry-edit-field="achieved"]`) no longer exist as radios, so `.checked = true` on a nonexistent element throws, and the new mark assertions fail.

- [ ] **Step 3: Implement the radio group in `src/ui/formEditorView.js`**

Add this helper near the top of the file, right after the imports (mirrors `courseplanTabView.js`'s `statusRadios`, kept local to this file since the two views are independent and the snippet is small):

```js
function statusRadios(id, { fieldAttr, idAttr, checkedStatus }) {
  return `
    <div class="entry-form__radio-group">
      <label class="entry-form__radio">
        <input type="radio" name="status-${escapeHtml(id)}" data-${fieldAttr}="status" data-${idAttr}="${escapeHtml(id)}" value="developed" ${checkedStatus === 'developed' ? 'checked' : ''}> 已發展○
      </label>
      <label class="entry-form__radio">
        <input type="radio" name="status-${escapeHtml(id)}" data-${fieldAttr}="status" data-${idAttr}="${escapeHtml(id)}" value="developing" ${checkedStatus === 'developing' ? 'checked' : ''}> 發展中△
      </label>
    </div>
  `;
}
```

Replace `entryRow` (currently lines 6–29):

```js
function entryRow(entry) {
  const mark = entry.status === 'developed' ? '○' : '△';
  return `
    <li class="entry-row${entry.status === 'developed' ? ' entry-row--achieved' : ''}" data-entry="${escapeHtml(entry.id)}">
      <div class="entry-row__top">
        <span class="entry-row__date"><span class="entry-row__mark">${mark}</span>${escapeHtml(entry.date)}</span>
        <div class="entry-row__actions">
          <button type="button" class="btn btn--edit btn--small" data-edit-entry="${escapeHtml(entry.id)}" aria-label="編輯觀察紀錄：${escapeHtml(entry.indicatorCode)} ${escapeHtml(entry.date)}">編輯</button>
          <button type="button" class="btn--delete-circle" data-delete-entry="${escapeHtml(entry.id)}" aria-label="刪除觀察紀錄：${escapeHtml(entry.indicatorCode)} ${escapeHtml(entry.date)}">×</button>
        </div>
      </div>
      <p class="entry-row__note">${escapeHtml(entry.note)}</p>
      <div class="entry-form" data-entry-edit-form-for="${escapeHtml(entry.id)}" hidden>
        <label class="entry-form__field">日期 <input type="date" data-entry-edit-field="date" data-entry-id="${escapeHtml(entry.id)}" value="${escapeHtml(entry.date)}"></label>
        ${statusRadios(entry.id, { fieldAttr: 'entry-edit-field', idAttr: 'entry-id', checkedStatus: entry.status })}
        <input type="text" class="entry-form__note" data-entry-edit-field="note" data-entry-id="${escapeHtml(entry.id)}" placeholder="觀察敘述" value="${escapeHtml(entry.note)}">
        <div class="entry-form__actions">
          <button type="button" class="btn btn--primary btn--small" data-entry-edit-save-for="${escapeHtml(entry.id)}">儲存</button>
          <button type="button" class="btn btn--outline btn--small" data-entry-edit-cancel-for="${escapeHtml(entry.id)}">取消</button>
        </div>
        <p class="field-error" data-error></p>
      </div>
    </li>
  `;
}
```

In `indicatorBlock` (currently lines 31–48), replace the add-entry `<div class="entry-form" ...>` block's checkbox line:

```js
        <label class="entry-form__field">日期 <input type="date" data-entry-field="date" data-indicator-code="${escapeHtml(indicator.code)}"></label>
        ${statusRadios(indicator.code, { fieldAttr: 'entry-field', idAttr: 'indicator-code', checkedStatus: 'developed' })}
        <input type="text" class="entry-form__note" data-entry-field="note" data-indicator-code="${escapeHtml(indicator.code)}" placeholder="觀察敘述">
```

(This removes the old `<label class="entry-form__checkbox">...已達成</label>` line entirely.)

In the add-entry save handler (currently lines 109–121), replace the body:

```js
    container.querySelector(`[data-entry-save-for="${indicator.code}"]`).addEventListener('click', async () => {
      const date = container.querySelector(`[data-entry-field="date"][data-indicator-code="${indicator.code}"]`).value;
      const statusInput = container.querySelector(`[data-entry-field="status"][data-indicator-code="${indicator.code}"]:checked`);
      const status = statusInput ? statusInput.value : 'developed';
      const note = container.querySelector(`[data-entry-field="note"][data-indicator-code="${indicator.code}"]`).value;
      try {
        await addEntry({ formId: form.id, indicatorCode: indicator.code, date, status, note });
        await renderFormEditorView(container, { child, form, onBack, confirmDelete });
      } catch (err) {
        const entryForm = container.querySelector(`[data-entry-form-for="${indicator.code}"]`);
        const errorEl = entryForm.querySelector('[data-error]');
        if (errorEl) errorEl.textContent = '新增失敗，請再試一次';
      }
    });
```

In the edit-entry save handler (currently lines 152–163), replace the body:

```js
    container.querySelector(`[data-entry-edit-save-for="${entry.id}"]`).addEventListener('click', async () => {
      const date = container.querySelector(`[data-entry-edit-field="date"][data-entry-id="${entry.id}"]`).value;
      const statusInput = container.querySelector(`[data-entry-edit-field="status"][data-entry-id="${entry.id}"]:checked`);
      const status = statusInput ? statusInput.value : 'developed';
      const note = container.querySelector(`[data-entry-edit-field="note"][data-entry-id="${entry.id}"]`).value;
      try {
        await updateEntry(entry.id, { date, status, note });
        await renderFormEditorView(container, { child, form, onBack, confirmDelete });
      } catch (err) {
        const errorEl = container.querySelector(`[data-entry-edit-form-for="${entry.id}"] [data-error]`);
        if (errorEl) errorEl.textContent = '更新失敗，請再試一次';
      }
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/formEditorView.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/formEditorView.js tests/formEditorView.test.js
git commit -m "feat: 適性總表觀察紀錄改用已發展○／發展中△ radio group"
```

---

### Task 3: `export/docxExport.js` — status-based ○／△ glyph

**Files:**
- Modify: `src/export/docxExport.js:90-125` (`buildIndicatorRowGroups`, `formatDateCell`) and `src/export/docxExport.js:184-191` (header text)
- Test: `tests/docxExport.test.js`, `tests/docxExport.acceptance.test.js`, `tests/childListView.test.js:20` (fixture only)

**Interfaces:**
- Consumes: entries shaped `{ indicatorCode, date, status, note }` (from `listEntriesForForm`, Task 1)
- Produces: `buildIndicatorRowGroups`/`buildIndicatorRows` rows now shaped `{ code, description, date, status, note }` (no more `achieved`)

- [ ] **Step 1: Update existing tests to the `status` shape, add a developing-glyph test**

In `tests/docxExport.test.js`, replace every `achieved: true|false` with the equivalent `status`:

```js
describe('buildIndicatorRows', () => {
  it('emits one blank row for an indicator with no entries', () => {
    const rows = buildIndicatorRows(indicators, {});
    expect(rows).toEqual([
      { code: 'Ⅳ-1-1', description: '能獨立穩定行走', date: '', status: null, note: '' },
      { code: 'Ⅳ-1-2', description: '能保持平衡撿拾地上物品', date: '', status: null, note: '' },
    ]);
  });

  it('emits one row per entry, preserving indicator order', () => {
    const entriesByIndicatorCode = {
      'Ⅳ-1-1': [
        { date: '2026-01-07', status: 'developed', note: '可以來回穩定行走' },
        { date: '2026-02-26', status: 'developing', note: '可穩定行走至戶外遊戲場' },
      ],
    };

    const rows = buildIndicatorRows(indicators, entriesByIndicatorCode);

    expect(rows).toEqual([
      { code: 'Ⅳ-1-1', description: '能獨立穩定行走', date: '2026-01-07', status: 'developed', note: '可以來回穩定行走' },
      { code: 'Ⅳ-1-1', description: '能獨立穩定行走', date: '2026-02-26', status: 'developing', note: '可穩定行走至戶外遊戲場' },
      { code: 'Ⅳ-1-2', description: '能保持平衡撿拾地上物品', date: '', status: null, note: '' },
    ]);
  });
});
```

In the `'keeps the flag independent of how many entry rows an indicator has'` test, change:

```js
    const groups = buildIndicatorRowGroups(byDomain, {
      'Ⅳ-1-1': [
        { date: '2026-01-07', status: 'developed', note: 'x' },
        { date: '2026-02-26', status: 'developed', note: 'y' },
      ],
    });
```

In `describe('generateDocxBlob', ...)`, change the entries fixture:

```js
    const entries = [
      { indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '可以來回穩定行走' },
    ];
```

Add a new test to `describe('buildIndicatorRows', ...)`:

```js
  it('leaves the row status as null when an entry has no recognizable status (defensive default)', () => {
    const rows = buildIndicatorRows(indicators, {
      'Ⅳ-1-1': [{ date: '2026-01-07', status: undefined, note: 'x' }],
    });
    expect(rows[0].status).toBeUndefined();
  });
```

In `tests/docxExport.acceptance.test.js`, replace the `entries` fixture at the top:

```js
const entries = [
  { indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '可以來回穩定行走' },
  { indicatorCode: 'Ⅳ-1-1', date: '2026-02-26', status: 'developing', note: '可穩定行走至戶外遊戲場' },
  { indicatorCode: 'Ⅳ-1-2', date: '2026-01-07', status: 'developed', note: '穩定蹲下拿起地上的書本' },
  { indicatorCode: 'Ⅳ-1-2', date: '2026-02-26', status: 'developed', note: '可穩定蹲下拿起地上的小石頭' },
];
```

Update the existing marker test (it now mixes ○ and △ since the second Ⅳ-1-1 row is `developing`):

```js
  it('writes dates as MM/DD with the ○/△ status marker, not ISO dates', async () => {
    const { documentXml } = await exportParts();

    expect(documentXml).toContain('01/07○');
    expect(documentXml).toContain('02/26△');
    expect(documentXml).not.toContain('2026-01-07');
    expect(documentXml).not.toContain('2026-02-26');
  });
```

Add a new test near the header-grid test:

```js
  it('marks the header column with both status glyphs, matching the two possible row markers', async () => {
    const { headerXml } = await exportParts();

    expect(headerXml).toContain('課程實施日期【已發展○】');
    expect(headerXml).toContain('【發展中△】');
  });
```

In `tests/childListView.test.js`, in `buildSampleDocxFile()`, change:

```js
    entries: [{ indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '可以來回穩定行走' }],
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/docxExport.test.js tests/docxExport.acceptance.test.js`
Expected: FAIL — production code still reads `.achieved`, so `status: 'developing'` rows currently render with no glyph, and the header still says `【發展中】` without △.

- [ ] **Step 3: Implement in `src/export/docxExport.js`**

Replace the `rows` ternary inside `buildIndicatorRowGroups` (currently lines 96-105):

```js
    const rows =
      entries.length === 0
        ? [{ code: indicator.code, description: indicator.description, date: '', status: null, note: '' }]
        : entries.map(entry => ({
            code: indicator.code,
            description: indicator.description,
            date: entry.date,
            status: entry.status,
            note: entry.note,
          }));
```

Replace `formatDateCell` (currently lines 120-125):

```js
// Entries are stored as YYYY-MM-DD (see storage/db.js addEntry); the printed form uses MM/DD.
function formatDateCell(row) {
  if (!row.date) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(row.date);
  const formatted = match ? `${match[2]}/${match[3]}` : row.date;
  const glyph = row.status === 'developed' ? '○' : row.status === 'developing' ? '△' : '';
  return `${formatted}${glyph}`;
}
```

In `headerRows()`, change the second header row's cell text (currently lines 184-191, the `課程實施日期【已發展○】` / `【發展中】` pair):

```js
      new TableCell({
        width: cellWidth(4),
        verticalAlign: VerticalAlign.CENTER,
        children: [
          textParagraph('課程實施日期【已發展○】', { bold: true, ...CENTERED }),
          textParagraph('【發展中△】', { bold: true, ...CENTERED }),
        ],
      }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/docxExport.test.js tests/docxExport.acceptance.test.js tests/childListView.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/export/docxExport.js tests/docxExport.test.js tests/docxExport.acceptance.test.js tests/childListView.test.js
git commit -m "feat: docx 匯出依 status 顯示已發展○／發展中△符號"
```

---

### Task 4: `storage/backup.js` — legacy `achieved` fallback on JSON backup import

**Files:**
- Modify: `src/storage/backup.js:101-109` (`importV1Or2Children`)
- Test: `tests/backup.test.js`

**Interfaces:**
- Consumes: `addEntry({ formId, indicatorCode, date, status, note })` from Task 1

- [ ] **Step 1: Update existing tests, add a legacy-backup-file status assertion**

In `tests/backup.test.js`, change the three `addEntry({..., achieved: true, ...})` call sites (lines ~28, ~42, ~111) to `status: 'developed'`.

Extend the last test (`'still imports a version-1 backup file...'`, currently lines 108-127) to assert the imported entry's status:

```js
  it('still imports a version-1 backup file (no parent-report data) without error, mapping its achieved flag to a status', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年01月' });
    await addEntry({ formId: form.id, indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: 'x' });

    // Simulate a real old backup file: hand-build the exact v1 JSON shape, which only ever had
    // `achieved`, never `status` — this is what a real user's pre-existing backup file looks like.
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

    const forms = await listFormsForChild(restoredChild.id);
    const entries = await listEntriesForForm(forms[0].id);
    expect(entries[0].status).toBe('developed');
  });
```

- [ ] **Step 2: Run tests to verify the new assertion fails**

Run: `npx vitest run tests/backup.test.js`
Expected: FAIL — `importV1Or2Children` still calls `addEntry({..., achieved: entry.achieved, ...})`, so after Task 1's change the entry is stored with `status: undefined`, not `'developed'`.

- [ ] **Step 3: Implement in `src/storage/backup.js`**

Replace the entries loop inside `importV1Or2Children` (currently lines 101-109):

```js
  for (const entry of data.entries) {
    await addEntry({
      formId: formIdMap.get(entry.formId),
      indicatorCode: entry.indicatorCode,
      date: entry.date,
      status: entry.status ?? (entry.achieved ? 'developed' : 'developing'),
      note: entry.note,
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/backup.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/storage/backup.js tests/backup.test.js
git commit -m "fix: 匯入舊版備份檔時把 achieved 換算成 status"
```

---

### Task 5: `ui/importPreviewView.js` — docx-import save path

**Files:**
- Modify: `src/ui/importPreviewView.js:87-95` (confirm-import submit handler)
- Test: `tests/importPreviewView.test.js`

**Interfaces:**
- Consumes: `addEntry({ formId, indicatorCode, date, status, note })` from Task 1. `parsed.entries[].achieved` (produced by `docxImport.js`, unchanged) stays a boolean — only the translation at the save boundary changes.

- [ ] **Step 1: Add a test asserting the saved entries get the right status**

Add to `tests/importPreviewView.test.js`, after the `'excludes unchecked entries from the import'` test:

```js
  it('maps each parsed entry\'s achieved flag to a status when saving', async () => {
    const container = document.createElement('div');
    let imported = false;
    renderImportPreviewView(container, { parsed: baseParsed(), onCancel: () => {}, onImported: () => { imported = true; } });

    container.querySelector('[data-action="confirm-import"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => imported);

    const children = await listChildren();
    const forms = await listFormsForChild(children[0].id);
    const entries = await listEntriesForForm(forms[0].id);

    expect(entries.find(e => e.indicatorCode === 'Ⅳ-1-1').status).toBe('developed');
    expect(entries.find(e => e.indicatorCode === 'Ⅳ-1-2').status).toBe('developing');
  });
```

- [ ] **Step 2: Run tests to verify it fails**

Run: `npx vitest run tests/importPreviewView.test.js`
Expected: FAIL — `renderImportPreviewView` still calls `addEntry({..., achieved: entry.achieved, ...})`, so both entries end up with `status: undefined`.

- [ ] **Step 3: Implement in `src/ui/importPreviewView.js`**

Replace the `addEntry` call inside the confirm-import submit handler (currently lines 88-94):

```js
        await addEntry({
          formId: form.id,
          indicatorCode: entry.indicatorCode,
          date: entry.date,
          status: entry.achieved ? 'developed' : 'developing',
          note: entry.note,
        });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/importPreviewView.test.js`
Expected: PASS

- [ ] **Step 5: Run the full suite before moving on to the new feature**

Run: `npx vitest run`
Expected: PASS — this confirms Tasks 1–5 fully close out the `achieved` → `status` migration with nothing left broken.

- [ ] **Step 6: Commit**

```bash
git add src/ui/importPreviewView.js tests/importPreviewView.test.js
git commit -m "fix: 舊檔匯入預覽存檔時把 achieved 換算成 status"
```

---

## Part B — The aggregation feature itself

### Task 6: `domain/aggregateCoursePlan.js` — merge logic

**Files:**
- Create: `src/domain/aggregateCoursePlan.js`
- Test: `tests/aggregateCoursePlan.test.js`

**Interfaces:**
- Consumes: `addForm`, `addEntry` from `src/storage/db.js`; `getParentReport`, `listCoursePlanEntriesForReport`, `listCourseOccurrencesForEntry` from `src/storage/parentReportDb.js`; `getIndicator` from `src/data/indicators.js`
- Produces: `aggregateCoursePlanIntoForm({ childId, tier, reportIds })` → `Promise<{ form, failed }>` where `form` is the newly created `AssessmentForm` (`{ id, childId, tier, period, createdAt }`) and `failed` is `Array<{ reportPeriod, indicatorCode, activityName, reason }>`. This is consumed by Task 7's UI view.

- [ ] **Step 1: Write the failing test file**

Create `tests/aggregateCoursePlan.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllData, addChild, listEntriesForForm } from '../src/storage/db.js';
import { addParentReport, addCoursePlanEntry, addCourseOccurrence } from '../src/storage/parentReportDb.js';
import { aggregateCoursePlanIntoForm } from '../src/domain/aggregateCoursePlan.js';

describe('aggregateCoursePlanIntoForm', () => {
  let child;

  beforeEach(async () => {
    await clearAllData();
    child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
  });

  it('merges course-plan occurrences from multiple same-tier reports into one new form', async () => {
    const reportJan = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    const reportFeb = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年02月' });

    const entryJan = await addCoursePlanEntry({ reportId: reportJan.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    await addCourseOccurrence({ entryId: entryJan.id, date: '2026-01-10', status: 'developed', absent: false, note: '一月的紀錄' });

    const entryFeb = await addCoursePlanEntry({ reportId: reportFeb.id, indicatorCode: 'Ⅴ-1-7', activityName: '堆積木' });
    await addCourseOccurrence({ entryId: entryFeb.id, date: '2026-02-14', status: 'developing', absent: false, note: '二月的紀錄' });

    const { form, failed } = await aggregateCoursePlanIntoForm({
      childId: child.id,
      tier: 'Ⅴ',
      reportIds: [reportJan.id, reportFeb.id],
    });

    expect(form.childId).toBe(child.id);
    expect(form.tier).toBe('Ⅴ');
    expect(failed).toEqual([]);

    const entries = await listEntriesForForm(form.id);
    expect(entries).toHaveLength(2);
    expect(entries.find(e => e.indicatorCode === 'Ⅴ-1-6')).toMatchObject({ date: '2026-01-10', status: 'developed', note: '一月的紀錄' });
    expect(entries.find(e => e.indicatorCode === 'Ⅴ-1-7')).toMatchObject({ date: '2026-02-14', status: 'developing', note: '二月的紀錄' });
  });

  it('names the new form period from the sorted, joined source report periods', async () => {
    const reportFeb = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年02月' });
    const reportJan = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });

    const { form } = await aggregateCoursePlanIntoForm({
      childId: child.id,
      tier: 'Ⅴ',
      reportIds: [reportFeb.id, reportJan.id],
    });

    expect(form.period).toBe('115年01月、115年02月彙整');
  });

  it('excludes occurrences marked absent (請假／未執行)', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-01-10', status: 'developed', absent: true, note: '請假' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-01-17', status: 'developed', absent: false, note: '正常上課' });

    const { form } = await aggregateCoursePlanIntoForm({ childId: child.id, tier: 'Ⅴ', reportIds: [report.id] });

    const entries = await listEntriesForForm(form.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].note).toBe('正常上課');
  });

  it('lists entries whose indicator code cannot be resolved as failed, without blocking the rest', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    const badEntry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-9-9', activityName: '不存在的指標' });
    await addCourseOccurrence({ entryId: badEntry.id, date: '2026-01-10', status: 'developed', absent: false, note: 'x' });
    const goodEntry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    await addCourseOccurrence({ entryId: goodEntry.id, date: '2026-01-11', status: 'developed', absent: false, note: 'y' });

    const { form, failed } = await aggregateCoursePlanIntoForm({ childId: child.id, tier: 'Ⅴ', reportIds: [report.id] });

    expect(failed).toEqual([
      { reportPeriod: '115年01月', indicatorCode: 'Ⅴ-9-9', activityName: '不存在的指標', reason: '找不到對應指標' },
    ]);
    const entries = await listEntriesForForm(form.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].indicatorCode).toBe('Ⅴ-1-6');
  });

  it('lists entries whose indicator belongs to a different tier as failed', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    // Ⅳ-1-1 is a real indicator, but for the Ⅳ tier, not Ⅴ.
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅳ-1-1', activityName: '走路練習' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-01-10', status: 'developed', absent: false, note: 'x' });

    const { form, failed } = await aggregateCoursePlanIntoForm({ childId: child.id, tier: 'Ⅴ', reportIds: [report.id] });

    expect(failed).toEqual([
      { reportPeriod: '115年01月', indicatorCode: 'Ⅳ-1-1', activityName: '走路練習', reason: '指標不屬於此階段' },
    ]);
    expect(await listEntriesForForm(form.id)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/aggregateCoursePlan.test.js`
Expected: FAIL with "Cannot find module '../src/domain/aggregateCoursePlan.js'"

- [ ] **Step 3: Write the implementation**

Create `src/domain/aggregateCoursePlan.js`:

```js
import { getIndicator } from '../data/indicators.js';
import { addForm, addEntry } from '../storage/db.js';
import { getParentReport, listCoursePlanEntriesForReport, listCourseOccurrencesForEntry } from '../storage/parentReportDb.js';

// Merges the 課程計畫表 data of several same-tier 適性紀錄(家長版) into one brand-new 適性總表
// (AssessmentForm). Each ParentReport's CoursePlanEntry/CourseOccurrence pairs become
// ObservationEntry rows; 請假／未執行 occurrences are dropped (the teacher did not actually
// run the activity, so the total form has nothing to show for that date); an entry whose
// indicator code can't be resolved for the target tier is skipped and reported back in
// `failed` instead of aborting the whole merge.
export async function aggregateCoursePlanIntoForm({ childId, tier, reportIds }) {
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

      const occurrences = await listCourseOccurrencesForEntry(entry.id);
      for (const occurrence of occurrences) {
        if (occurrence.absent) continue;
        toWrite.push({ indicatorCode: entry.indicatorCode, date: occurrence.date, status: occurrence.status, note: occurrence.note });
      }
    }
  }

  const period = reports.length > 0 ? `${[...new Set(reports.map(r => r.period))].join('、')}彙整` : '彙整';
  const form = await addForm({ childId, tier, period });
  for (const row of toWrite) {
    await addEntry({ formId: form.id, ...row });
  }

  return { form, failed };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/aggregateCoursePlan.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/aggregateCoursePlan.js tests/aggregateCoursePlan.test.js
git commit -m "feat: 新增課程計畫表彙整成總表的核心邏輯"
```

---

### Task 7: `ui/aggregateCoursePlanView.js` — selection screen

**Files:**
- Create: `src/ui/aggregateCoursePlanView.js`
- Test: `tests/aggregateCoursePlanView.test.js`

**Interfaces:**
- Consumes: `listParentReportsForChild(childId)` from `src/storage/parentReportDb.js`; `aggregateCoursePlanIntoForm({ childId, tier, reportIds })` from Task 6; `escapeHtml` from `src/ui/escapeHtml.js`
- Produces: `renderAggregateCoursePlanView(container, { child, onCreated, onBack })` — `onCreated(form)` fires once the merge has succeeded and the teacher has acknowledged any failed items (or immediately, if there were none); `onBack()` fires on the back button. Consumed by Task 8's `app.js` wiring.

- [ ] **Step 1: Write the failing test file**

Create `tests/aggregateCoursePlanView.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import { addParentReport, addCoursePlanEntry, addCourseOccurrence } from '../src/storage/parentReportDb.js';
import { renderAggregateCoursePlanView } from '../src/ui/aggregateCoursePlanView.js';
import { waitFor } from './helpers.js';

describe('renderAggregateCoursePlanView', () => {
  let child;

  beforeEach(async () => {
    await clearAllData();
    child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });
  });

  it('shows a message when the child has no parent reports to aggregate', async () => {
    const container = document.createElement('div');
    await renderAggregateCoursePlanView(container, { child, onCreated: () => {}, onBack: () => {} });

    expect(container.textContent).toContain('尚無適性紀錄可彙整');
    expect(container.querySelector('[data-action="aggregate"]')).toBeNull();
  });

  it('lists only the reports for the selected tier, and switches when the tier changes', async () => {
    await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    await addParentReport({ childId: child.id, tier: 'Ⅳ', period: '114年11月' });

    const container = document.createElement('div');
    await renderAggregateCoursePlanView(container, { child, onCreated: () => {}, onBack: () => {} });

    expect(container.textContent).toContain('114年11月');
    expect(container.textContent).not.toContain('115年01月');

    container.querySelector('[data-field="tier"]').value = 'Ⅴ';
    container.querySelector('[data-field="tier"]').dispatchEvent(new Event('change', { bubbles: true }));

    expect(container.textContent).toContain('115年01月');
    expect(container.textContent).not.toContain('114年11月');
  });

  it('requires at least one report to be checked before submitting', async () => {
    await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });

    const container = document.createElement('div');
    await renderAggregateCoursePlanView(container, { child, onCreated: () => {}, onBack: () => {} });

    container.querySelector('[data-action="aggregate"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(container.querySelector('[data-action="aggregate"] [data-error]').textContent).toContain('請至少勾選一筆適性紀錄');
  });

  it('creates the form and calls onCreated directly when there are no failed items', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    await addCourseOccurrence({ entryId: entry.id, date: '2026-01-10', status: 'developed', absent: false, note: 'x' });

    const container = document.createElement('div');
    let created = null;
    await renderAggregateCoursePlanView(container, { child, onCreated: form => { created = form; }, onBack: () => {} });

    container.querySelector(`[data-report-checkbox="${report.id}"]`).checked = true;
    container.querySelector('[data-action="aggregate"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => created !== null);
    expect(created.tier).toBe('Ⅴ');
  });

  it('shows the failed list and only calls onCreated after "前往查看總表" is clicked', async () => {
    const report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年01月' });
    const badEntry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-9-9', activityName: '不存在的指標' });
    await addCourseOccurrence({ entryId: badEntry.id, date: '2026-01-10', status: 'developed', absent: false, note: 'x' });

    const container = document.createElement('div');
    let created = null;
    await renderAggregateCoursePlanView(container, { child, onCreated: form => { created = form; }, onBack: () => {} });

    container.querySelector(`[data-report-checkbox="${report.id}"]`).checked = true;
    container.querySelector('[data-action="aggregate"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => container.querySelector('[data-action="go-to-form"]'));
    expect(container.textContent).toContain('Ⅴ-9-9');
    expect(created).toBeNull();

    container.querySelector('[data-action="go-to-form"]').click();
    expect(created).not.toBeNull();
  });

  it('calls onBack when the back button is clicked', async () => {
    const container = document.createElement('div');
    const onBack = vi.fn();
    await renderAggregateCoursePlanView(container, { child, onCreated: () => {}, onBack });

    container.querySelector('[data-action="back"]').click();

    expect(onBack).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/aggregateCoursePlanView.test.js`
Expected: FAIL with "Cannot find module '../src/ui/aggregateCoursePlanView.js'"

- [ ] **Step 3: Write the implementation**

Create `src/ui/aggregateCoursePlanView.js`:

```js
import { listParentReportsForChild } from '../storage/parentReportDb.js';
import { aggregateCoursePlanIntoForm } from '../domain/aggregateCoursePlan.js';
import { escapeHtml } from './escapeHtml.js';

function failedListHtml(failed) {
  return `
    <div class="field-error" data-aggregate-failed>
      <p>已建立總表，但以下 ${failed.length} 筆因故無法帶入：</p>
      <ul>
        ${failed
          .map(
            item =>
              `<li>${escapeHtml(item.reportPeriod)}　${escapeHtml(item.indicatorCode)}　【${escapeHtml(item.activityName)}】—${escapeHtml(item.reason)}</li>`
          )
          .join('')}
      </ul>
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

  const tiers = [...new Set(reports.map(r => r.tier))];
  let selectedTier = tiers[0];

  function reportsForTier(tier) {
    return reports.filter(r => r.tier === tier).sort((a, b) => a.period.localeCompare(b.period));
  }

  function render(failed = null, createdForm = null) {
    const tierReports = reportsForTier(selectedTier);

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
        <button type="submit" class="btn btn--primary">建立總表</button>
        <p class="field-error" data-error></p>
      </form>
      ${failed ? failedListHtml(failed) : ''}
    `;

    container.querySelector('[data-action="back"]').addEventListener('click', onBack);

    container.querySelector('[data-field="tier"]').addEventListener('change', event => {
      selectedTier = event.target.value;
      render();
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

      try {
        const { form, failed: failedResult } = await aggregateCoursePlanIntoForm({ childId: child.id, tier: selectedTier, reportIds });
        if (failedResult.length === 0) {
          onCreated(form);
        } else {
          render(failedResult, form);
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/aggregateCoursePlanView.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/aggregateCoursePlanView.js tests/aggregateCoursePlanView.test.js
git commit -m "feat: 新增從適性紀錄彙整成總表的選擇畫面"
```

---

### Task 8: Wire the entry point — `formListView.js` button + `app.js` route + CSS

**Files:**
- Modify: `src/ui/formListView.js` (header + re-render calls)
- Modify: `src/app.js` (`showFormList`, new `showAggregateSelect`)
- Modify: `src/styles.css:247-251` (right-positioned button rule)
- Test: `tests/formListView.test.js`, `tests/app.test.js`

**Interfaces:**
- Consumes: `renderAggregateCoursePlanView` from Task 7
- Produces: `renderFormListView(container, { child, onSelectForm, onBack, onAggregate, confirmDelete })` — `onAggregate` is a new optional callback (defaults to a no-op so every existing call site that doesn't pass it keeps working)

- [ ] **Step 1: Write the failing tests**

In `tests/formListView.test.js`, add a new test:

```js
  it('calls onAggregate when the "從適性紀錄彙整" button is clicked', async () => {
    const container = document.createElement('div');
    const onAggregate = vi.fn();
    await renderFormListView(container, { child, onSelectForm: () => {}, onBack: () => {}, onAggregate });

    container.querySelector('[data-action="aggregate"]').click();

    expect(onAggregate).toHaveBeenCalled();
  });
```

In `tests/app.test.js`, add a new test inside `describe('mountApp navigation', ...)`:

```js
  it('navigates from the form list to the aggregate-from-parent-reports screen and back', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });

    const container = document.createElement('div');
    mountApp(container);
    await waitFor(() => container.textContent.includes('選擇要填寫的表'));
    container.querySelector('[data-type="assessment"]').click();
    await waitFor(() => container.querySelector(`[data-child-id="${child.id}"]`));
    container.querySelector(`[data-child-id="${child.id}"]`).click();
    await waitFor(() => container.textContent.includes('的適性總表'));

    container.querySelector('[data-action="aggregate"]').click();
    await waitFor(() => container.textContent.includes('從適性紀錄彙整'));
    expect(container.textContent).toContain('尚無適性紀錄可彙整');

    container.querySelector('[data-action="back"]').click();
    await waitFor(() => container.textContent.includes('的適性總表'));
    expect(container.textContent).toContain('的適性總表');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/formListView.test.js tests/app.test.js`
Expected: FAIL — `[data-action="aggregate"]` doesn't exist yet in `formListView.js`'s output, and `app.js` has no route to the new view.

- [ ] **Step 3: Implement**

In `src/ui/formListView.js`, change the function signature (currently line 7-9):

```js
export async function renderFormListView(
  container,
  { child, onSelectForm, onBack, onAggregate = () => {}, confirmDelete = message => (typeof confirm === 'function' ? confirm(message) : false) }
) {
```

Change the header markup (currently lines 17-21):

```js
  container.innerHTML = `
    <div class="page-header page-header--editor">
      <button type="button" class="btn btn--ghost" data-action="back">← 返回幼兒列表</button>
      <h2 class="page-header__title">${escapeHtml(child.name)} 的適性總表</h2>
      <button type="button" class="btn btn--outline" data-action="aggregate">從適性紀錄彙整</button>
    </div>
    <ul class="card-list">
```

Add a listener alongside the existing `back` listener (currently line 58):

```js
  container.querySelector('[data-action="back"]').addEventListener('click', onBack);
  container.querySelector('[data-action="aggregate"]').addEventListener('click', onAggregate);
```

In the two internal re-render calls (delete handler and add-form submit handler, currently lines 69 and 84), add `onAggregate` to the passed-through options:

```js
        await renderFormListView(container, { child, onSelectForm, onBack, onAggregate, confirmDelete });
```

(both occurrences)

In `src/app.js`, add the import at the top:

```js
import { renderAggregateCoursePlanView } from './ui/aggregateCoursePlanView.js';
```

Change `showFormList` (currently lines 37-43):

```js
  function showFormList(child) {
    renderFormListView(container, {
      child,
      onSelectForm: form => showFormEditor(child, form),
      onBack: () => showChildList('assessment'),
      onAggregate: () => showAggregateSelect(child),
    }).catch(showRenderError);
  }

  function showAggregateSelect(child) {
    renderAggregateCoursePlanView(container, {
      child,
      onCreated: form => showFormEditor(child, form),
      onBack: () => showFormList(child),
    }).catch(showRenderError);
  }
```

In `src/styles.css`, replace the existing rule (currently lines 247-251):

```css
.page-header--editor .btn[data-action="export"],
.page-header--editor .btn[data-action="aggregate"] {
  position: absolute;
  right: 0;
  left: auto;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/formListView.test.js tests/app.test.js`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS (all files)

- [ ] **Step 6: Commit**

```bash
git add src/ui/formListView.js src/app.js src/styles.css tests/formListView.test.js tests/app.test.js
git commit -m "feat: 適性總表清單頁加上「從適性紀錄彙整」入口"
```

---

## Self-Review Notes

- **Spec coverage:** Part A (Task 1-5) covers the spec's 「一、總表資料模型變更」section in full, including the docx header text tweak and the two migration boundaries (legacy IndexedDB records via `listEntriesForForm`, legacy backup JSON via `importV1Or2Children`) plus the docx-import save path that the spec didn't call out by filename but is required by the `addEntry` signature change. Task 6 covers 「二、彙整邏輯」. Task 7-8 cover 「三、UI 流程」. Testing requirements from 「四、測試」 are distributed across each task's own test file.
- **Placeholder scan:** No TBD/TODO; every step has literal code, not descriptions of code.
- **Type consistency:** `aggregateCoursePlanIntoForm({ childId, tier, reportIds })` → `{ form, failed }` is used identically in Task 6's tests, Task 7's implementation, and Task 7's tests. `renderAggregateCoursePlanView(container, { child, onCreated, onBack })` is used identically in Task 7 and Task 8. `addEntry`'s new `{ formId, indicatorCode, date, status, note }` shape is used consistently by Tasks 1 through 6.
