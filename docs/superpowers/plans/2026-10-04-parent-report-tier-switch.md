# 適性紀錄 指標所屬年齡層 switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a 適性紀錄's 課程計畫表 pick indicators from any tier (add + edit forms), and order off-tier entries after the report's own tier within each domain, on screen and in the exported Word.

**Architecture:** One shared comparator in `src/data/indicators.js` drives both the tab's per-domain sort and the exporter's sort. The tier button row reuses the 月計畫 panel's `.tier-switch` markup/CSS, wired by a small helper inside `courseplanTabView.js`.

**Tech Stack:** vanilla JS, vitest + jsdom + fake-indexeddb, esbuild, Playwright (manual check).

Spec: `docs/superpowers/specs/2026-10-04-parent-report-tier-switch-design.md`

## Global Constraints

- Run tests scoped: `npx vitest run tests/` (a bare run picks up stale worktree copies).
- UI text in Traditional Chinese; the button row label is exactly 「指標所屬年齡層」, buttons use `TIERS[].label`.
- Reuse existing CSS classes `.tier-switch`, `.tier-switch__btn`, `.tier-switch__btn--active` — no new CSS.
- 彙整 (`aggregateCoursePlan.js`) is not touched.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Shared comparator

**Files:**
- Modify: `src/data/indicators.js` (after `getIndicator`, ~line 412)
- Test: `tests/indicators.test.js`

**Interfaces:**
- Produces: `compareIndicatorCodesForTier(tierCode) => (codeA, codeB) => number` — own tier first, then other tiers in `TIERS` order, then item number; unresolvable codes last (stable among themselves). Does **not** compare domains; callers group by domain first.

- [ ] **Step 1: Write failing test** — append to `tests/indicators.test.js` (add `compareIndicatorCodesForTier` to its import from `../src/data/indicators.js`):

```js
describe('compareIndicatorCodesForTier', () => {
  it('puts the given tier first, then other tiers Ⅰ→Ⅵ, then item number, unresolvable last', () => {
    const codes = ['Ⅲ-1-2', 'XX-1-1', 'Ⅳ-1-3', 'Ⅱ-1-5', 'Ⅳ-1-1', 'Ⅲ-1-1', 'Ⅴ-1-1'];
    expect([...codes].sort(compareIndicatorCodesForTier('Ⅳ')))
      .toEqual(['Ⅳ-1-1', 'Ⅳ-1-3', 'Ⅱ-1-5', 'Ⅲ-1-1', 'Ⅲ-1-2', 'Ⅴ-1-1', 'XX-1-1']);
  });

  it('with no tier given, orders by tier then item number', () => {
    expect(['Ⅴ-1-2', 'Ⅳ-1-3', 'Ⅴ-1-1'].sort(compareIndicatorCodesForTier(undefined)))
      .toEqual(['Ⅳ-1-3', 'Ⅴ-1-1', 'Ⅴ-1-2']);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/indicators.test.js` — expect FAIL (`compareIndicatorCodesForTier is not a function`).

- [ ] **Step 3: Implement** — in `src/data/indicators.js`, after `getIndicator`:

```js
// Orders codes within one domain of a 適性紀錄 課程計畫表: the report's own tier first, then any
// earlier/later tier a teacher is still tracking (Ⅰ→Ⅵ), then by item number. Unresolvable codes
// go last. Shared by the tab view and the Word exporter so screen and file agree.
export function compareIndicatorCodesForTier(tierCode) {
  const ownTier = CODE_PREFIX_TIER[tierCode] || tierCode;
  const key = code => {
    const indicator = getIndicator(code);
    if (!indicator) return [TIERS.length, 0];
    const tierRank = indicator.tier === ownTier ? -1 : TIERS.findIndex(t => t.code === indicator.tier);
    return [tierRank, Number(indicator.code.split('-').pop())];
  };
  return (codeA, codeB) => {
    const [tierA, numberA] = key(codeA);
    const [tierB, numberB] = key(codeB);
    return tierA !== tierB ? tierA - tierB : numberA - numberB;
  };
}
```

- [ ] **Step 4: Run** `npx vitest run tests/indicators.test.js` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/indicators.js tests/indicators.test.js
git commit -m "feat: compareIndicatorCodesForTier — own tier first, then other tiers"
```

---

### Task 2: Exporter ordering

**Files:**
- Modify: `src/export/parentReportDocxExport.js:56-76` (`UNRESOLVED_SORT_KEY`, `coursePlanSortKey`, sort in `buildCoursePlanRowGroups`), `:221` (`buildCoursePlanTable`), `:571` (caller)
- Test: `tests/parentReportDocxExport.test.js`

**Interfaces:**
- Consumes: `compareIndicatorCodesForTier` (Task 1).
- Produces: `buildCoursePlanRowGroups(entries, occurrencesByEntryId, tier)`, `buildCoursePlanTable(entries, occurrencesByEntryId, tier)` — `tier` optional; omitted → plain tier-then-number order (existing tests unchanged).

- [ ] **Step 1: Write failing test** — inside `describe('buildCoursePlanRowGroups', …)`:

```js
  it('within a domain, puts the report tier first and earlier-tier entries after it', () => {
    const mixed = [
      { id: 1, reportId: 1, indicatorCode: 'Ⅲ-1-2', activityName: '舊階段' },
      { id: 2, reportId: 1, indicatorCode: 'Ⅳ-1-3', activityName: 'b' },
      { id: 3, reportId: 1, indicatorCode: 'Ⅳ-2-1', activityName: 'c' },
      { id: 4, reportId: 1, indicatorCode: 'Ⅳ-1-1', activityName: 'a' },
    ];
    const groups = buildCoursePlanRowGroups(mixed, {}, 'Ⅳ');
    expect(groups.map(g => g.entry.indicatorCode)).toEqual(['Ⅳ-1-1', 'Ⅳ-1-3', 'Ⅲ-1-2', 'Ⅳ-2-1']);
    expect(groups.map(g => g.isFirstEntryOfDomain)).toEqual([true, false, false, true]);
  });
```

- [ ] **Step 2: Run** `npx vitest run tests/parentReportDocxExport.test.js` — expect FAIL (Ⅲ-1-2 sorts between Ⅳ-1-1 and Ⅳ-1-3).

- [ ] **Step 3: Implement**
  - Import `compareIndicatorCodesForTier` alongside `getIndicator` from `../data/indicators.js`.
  - Delete `UNRESOLVED_SORT_KEY`, `coursePlanSortKey` and their comment (lines 56-65).
  - Replace the signature and sort in `buildCoursePlanRowGroups`:

```js
export function buildCoursePlanRowGroups(entries, occurrencesByEntryId, tier) {
  // Fix 3: entries can arrive in arbitrary (e.g. IndexedDB insertion) order with domains
  // interleaved. The vertical-merge grouping below assumes same-domain entries are already
  // contiguous, so sort a COPY (never mutate the caller's array) by domain, then within the
  // domain by compareIndicatorCodesForTier (report tier first, earlier-tier entries after),
  // before grouping. Unresolvable codes sort to the end.
  const compareCodes = compareIndicatorCodesForTier(tier);
  const domainOf = entry => getIndicator(entry.indicatorCode)?.domain ?? Infinity;
  const sortedEntries = [...entries].sort((a, b) =>
    domainOf(a) !== domainOf(b) ? domainOf(a) - domainOf(b) : compareCodes(a.indicatorCode, b.indicatorCode)
  );
```

  - `buildCoursePlanTable(entries, occurrencesByEntryId, tier)` passes `tier` to `buildCoursePlanRowGroups`.
  - `generateParentReportDocxBlob`: `buildCoursePlanTable(coursePlanEntries, courseOccurrencesByEntryId, report.tier)`.

- [ ] **Step 4: Run** `npx vitest run tests/parentReportDocxExport.test.js` — expect PASS (all, including the existing sort tests).

- [ ] **Step 5: Commit**

```bash
git add src/export/parentReportDocxExport.js tests/parentReportDocxExport.test.js
git commit -m "feat: 適性紀錄 Word lists earlier-tier course plan entries after the report's tier"
```

---

### Task 3: Tab view — ordering + tier switch on add and edit forms

**Files:**
- Modify: `src/ui/courseplanTabView.js` (imports line 2; `indicatorItemNumber` lines 20-26; `entryCard` ~96-112; per-domain sort ~201-206; add form ~232-235; wiring after the add form's `change` listener ~280-289)
- Test: `tests/courseplanTabView.test.js` (fixture report is tier `'Ⅴ'`)

**Interfaces:**
- Consumes: `compareIndicatorCodesForTier` (Task 1), existing `indicatorOptionsHtml(tier, selectedCode)`.
- Produces (internal to the file): `tierSwitchHtml(activeTier)`, `wireTierSwitch(scope, onSwitch)`.

- [ ] **Step 1: Write failing tests** — add to `tests/courseplanTabView.test.js` (add `getIndicatorsForTier` import from `../src/data/indicators.js`):

```js
  it('add form: tier switch starts on the report tier; picking Ⅳ lists Ⅳ indicators, prefills, and saves a Ⅳ code', async () => {
    const container = document.createElement('div');
    let changed = false;
    await renderCoursePlanTab(container, { report, onChange: () => { changed = true; } });
    const form = container.querySelector('[data-action="add-entry"]');
    expect(form.querySelector('.tier-switch__btn--active').dataset.indicatorTier).toBe('Ⅴ');

    form.querySelector('[data-indicator-tier="Ⅳ"]').click();
    expect(form.querySelector('.tier-switch__btn--active').dataset.indicatorTier).toBe('Ⅳ');
    const select = form.querySelector('[data-field="indicatorCode"]');
    expect([...select.options].every(o => o.value.startsWith('Ⅳ-'))).toBe(true);
    const first = getIndicatorsForTier('Ⅳ')[0];
    expect(select.value).toBe(first.code);
    expect(form.querySelector('[data-field="activityName"]').value).toBe(first.activityName);
    expect(form.querySelector('[data-field="indicatorText"]').value).toBe(first.description);

    select.value = 'Ⅳ-1-2';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => changed);
    const [entry] = await listCoursePlanEntriesForReport(report.id);
    expect(entry.indicatorCode).toBe('Ⅳ-1-2');
  });

  it('lists an earlier-tier entry after the report tier\'s entries in its domain', async () => {
    await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅳ-1-2', activityName: '舊' });
    await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-6', activityName: 'b' });
    await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-1', activityName: 'a' });
    const container = document.createElement('div');
    await renderCoursePlanTab(container, { report, onChange: () => {} });
    const codes = [...container.querySelectorAll('.indicator-block__code')].map(el => el.textContent);
    expect(codes).toEqual(['Ⅴ-1-1', 'Ⅴ-1-6', 'Ⅳ-1-2']);
  });

  it('edit form: starts on the entry\'s own tier with its code selected; switching tiers keeps the code', async () => {
    const entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅳ-1-2', activityName: '舊活動', indicatorText: '老師寫的' });
    const container = document.createElement('div');
    await renderCoursePlanTab(container, { report, onChange: () => {} });
    const editForm = container.querySelector(`[data-entry-edit-form-for="${entry.id}"]`);
    const select = editForm.querySelector('[data-entry-edit-field="indicatorCode"]');
    expect(editForm.querySelector('.tier-switch__btn--active').dataset.indicatorTier).toBe('Ⅳ');
    expect(select.value).toBe('Ⅳ-1-2');
    expect(select.innerHTML).not.toContain('目前的指標');

    editForm.querySelector('[data-indicator-tier="Ⅴ"]').click();
    expect(select.value).toBe('Ⅳ-1-2');
    expect([...select.options].some(o => o.value === 'Ⅴ-1-1')).toBe(true);
    expect(editForm.querySelector('[data-entry-edit-field="indicatorText"]').value).toBe('老師寫的');
  });
```

- [ ] **Step 2: Run** `npx vitest run tests/courseplanTabView.test.js` — expect the three new tests to FAIL.

- [ ] **Step 3: Implement** in `src/ui/courseplanTabView.js`:
  - Import: `import { TIERS, DOMAINS, getIndicatorsForTier, getIndicator, compareIndicatorCodesForTier } from '../data/indicators.js';`
  - Delete `indicatorItemNumber` and its comment (lines 20-26).
  - Add next to `indicatorOptionsHtml`:

```js
// Same 指標所屬年齡層 row as the 月計畫 panel: a teacher may still be tracking an earlier tier's
// indicator, so the 指標 select can list any tier. Only changes what the select lists.
function tierSwitchHtml(activeTier) {
  return `
    <div class="panel-form__field">
      指標所屬年齡層
      <div class="tier-switch">
        ${TIERS.map(
          t => `<button type="button" class="tier-switch__btn${t.code === activeTier ? ' tier-switch__btn--active' : ''}" data-indicator-tier="${escapeHtml(t.code)}">${escapeHtml(t.label)}</button>`
        ).join('')}
      </div>
    </div>
  `;
}

function wireTierSwitch(scope, onSwitch) {
  scope.querySelectorAll('[data-indicator-tier]').forEach(btn => {
    btn.addEventListener('click', () => {
      scope.querySelectorAll('[data-indicator-tier]').forEach(b => b.classList.toggle('tier-switch__btn--active', b === btn));
      onSwitch(btn.dataset.indicatorTier);
    });
  });
}
```

  - `entryCard`: replace the edit form's 指標 `<label>` with

```js
        ${tierSwitchHtml(indicator ? indicator.tier : tier)}
        <label class="panel-form__field">
          指標
          <select data-entry-edit-field="indicatorCode" data-entry-id="${escapeHtml(entry.id)}">${indicatorOptionsHtml(indicator ? indicator.tier : tier, entry.indicatorCode)}</select>
        </label>
```

  - Per-domain sort: replace the comment + `group.sort(...)` with

```js
  // Report tier first, then any earlier-tier indicator the teacher is still tracking, each by item
  // number — same order as the exported Word (compareIndicatorCodesForTier).
  const compareCodes = compareIndicatorCodesForTier(report.tier);
  for (const group of byDomain.values()) {
    group.sort((a, b) => compareCodes(a.entry.indicatorCode, b.entry.indicatorCode));
  }
```

  - Add form: insert `${tierSwitchHtml(report.tier)}` directly above the 指標 `<label>`.
  - Wiring, after the add form's `[data-field="indicatorCode"]` `change` listener:

```js
  // Switching tier relists the select and refires its change handler, so 活動名稱/能力指標內容
  // follow the newly selected first indicator instead of describing one no longer selected.
  const addForm = container.querySelector('[data-action="add-entry"]');
  wireTierSwitch(addForm, tierCode => {
    const select = addForm.querySelector('[data-field="indicatorCode"]');
    select.innerHTML = indicatorOptionsHtml(tierCode);
    select.dispatchEvent(new Event('change'));
  });

  // In the edit form, switching tier keeps the entry's current code selected (shown as
  // 「（目前的指標）」 when it isn't in that tier) and never touches the text the teacher wrote.
  for (const entry of entries) {
    const editForm = container.querySelector(`[data-entry-edit-form-for="${entry.id}"]`);
    wireTierSwitch(editForm, tierCode => {
      const select = editForm.querySelector('[data-entry-edit-field="indicatorCode"]');
      select.innerHTML = indicatorOptionsHtml(tierCode, select.value);
    });
  }
```


- [ ] **Step 4: Run** `npx vitest run tests/` — expect all PASS (including the existing `指標不屬於本階段時…` and item-number sort tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/courseplanTabView.js tests/courseplanTabView.test.js
git commit -m "feat: 指標所屬年齡層 switch on the 適性紀錄 課程計畫表 add and edit forms"
```

---

### Task 4: Real-browser check + docs

**Files:**
- Modify: `CLAUDE.md` (ParentReport bullet in "What this project is")

- [ ] **Step 1:** `npm run build`, then `npm install --no-save playwright` and drive `dist/TableC.html` with a throwaway script in `$CLAUDE_JOB_DIR/tmp`: unlock, add a child + a Ⅳ 適性紀錄, on 課程計畫表 click 「7-12個月」, pick Ⅲ-1-2, add; add Ⅳ-1-1; check the 身體動作 card lists Ⅳ-1-1 before Ⅲ-1-2; open Ⅲ-1-2's 編輯 — Ⅲ active, change to Ⅲ-1-1, save; export Word and confirm the course-plan table order Ⅳ-1-1, Ⅲ-1-1. Screenshot at desktop and 390px width.

- [ ] **Step 2:** In `CLAUDE.md`'s ParentReport bullet, after the 套用其他幼兒課程計畫 sentence, add: `Its 指標 picker (add and edit) has the same 指標所屬年齡層 tier switch as 月計畫, so an earlier tier's indicator can be tracked; within a domain those entries list after the report's own tier (\`compareIndicatorCodesForTier\`), on screen and in the Word, and 彙整 still files them under the 總表's 備註 rows.`

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note the 適性紀錄 tier switch"
```
