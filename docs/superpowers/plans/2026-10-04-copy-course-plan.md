# 套用其他幼兒課程計畫 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A button on the 適性紀錄 課程計畫表 tab that replaces the current report's course plan with a copy of another child's (same tier, same month).

**Architecture:** One new domain module `src/domain/copyCoursePlan.js` (find candidates, dry-run counts for the confirm text, apply) built on the existing `parentReportDb.js` functions. `src/ui/courseplanTabView.js` gets the button + picker above its two-column layout and calls the module. Spec: `docs/superpowers/specs/2026-10-04-copy-course-plan-design.md`.

**Tech Stack:** Vanilla JS, IndexedDB, vitest + jsdom + fake-indexeddb, esbuild, Playwright (manual check only).

## Global Constraints

- Button text: 「套用其他幼兒課程計畫」 desktop, 「套用」 mobile, via `headerButtonLabel(full, short)`.
- Candidates: other ParentReports with the same `tier` AND `period` as the current one, with ≥1 CoursePlanEntry. Never the current report.
- Empty-picker text: 「沒有同年齡層、同月份的其他幼兒課程計畫可以套用」.
- Copied: `indicatorCode`, `activityName`, `indicatorText` per entry; `date`, `note` per occurrence. Reset: `status: 'developed'`, `absent: false`, `courseChanged: false`.
- 適性發展紀錄表 `courseEntryIds` re-linked by `indicatorCode` + `activityName` (first match), unmatched dropped, deduped.
- Order: copy → re-link → delete old. Source report never modified.
- Apply handler wrapped in `oneAtATime`; confirm goes through the tab's existing injectable `confirmDelete`.
- Never put real children's names in tests, comments, or commits — use fixture names like `陳小安` / `林小明`.
- Run tests scoped: `npx vitest run tests/` (a bare `npx vitest run` may pick up stale worktree copies).

---

### Task 1: `copyCoursePlan.js` domain module

**Files:**
- Create: `src/domain/copyCoursePlan.js`
- Test: `tests/copyCoursePlan.test.js`

**Interfaces:**
- Consumes: `listChildren` (`src/storage/db.js`); `listParentReportsForChild`, `listCoursePlanEntriesForReport`, `addCoursePlanEntry`, `deleteCoursePlanEntry`, `listCourseOccurrencesForEntry`, `addCourseOccurrence`, `listDevelopmentRecordEntriesForReport`, `updateDevelopmentRecordEntry` (`src/storage/parentReportDb.js`).
- Produces:
  - `findCopySources(report) → Promise<Array<{ report, childName: string, entryCount: number }>>`
  - `planCoursePlanCopy({ targetReportId, sourceReportId }) → Promise<{ currentCount, sourceCount, unlinkedRecordCount }>` (read-only)
  - `copyCoursePlan({ targetReportId, sourceReportId }) → Promise<void>`

- [ ] **Step 0: Install dependencies in the worktree**

Run: `npm ci`
Expected: completes without errors (the worktree has no `node_modules` yet).

- [ ] **Step 1: Write the failing tests**

Create `tests/copyCoursePlan.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import {
  addParentReport, addCoursePlanEntry, addCourseOccurrence,
  listCoursePlanEntriesForReport, listCourseOccurrencesForEntry,
  addDevelopmentRecordEntry, listDevelopmentRecordEntriesForReport,
} from '../src/storage/parentReportDb.js';
import { findCopySources, planCoursePlanCopy, copyCoursePlan } from '../src/domain/copyCoursePlan.js';

describe('copyCoursePlan', () => {
  let target;
  let source;

  beforeEach(async () => {
    await clearAllData();
    const childA = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    const childB = await addChild({ name: '林小明', birthDate: '2024-07-01' });
    target = await addParentReport({ childId: childA.id, tier: 'Ⅴ', period: '115年06月' });
    source = await addParentReport({ childId: childB.id, tier: 'Ⅴ', period: '115年06月' });
  });

  describe('findCopySources', () => {
    it('lists other same-tier, same-period reports that have entries, with child name and count', async () => {
      await addCoursePlanEntry({ reportId: source.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
      await addCoursePlanEntry({ reportId: source.id, indicatorCode: 'Ⅴ-1-7', activityName: '堆積木' });
      await addCoursePlanEntry({ reportId: target.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });

      const sources = await findCopySources(target);

      expect(sources).toHaveLength(1);
      expect(sources[0]).toMatchObject({ childName: '林小明', entryCount: 2 });
      expect(sources[0].report.id).toBe(source.id);
    });

    it('skips other tiers, other periods, and empty reports', async () => {
      const childC = await addChild({ name: '王小華', birthDate: '2024-05-01' });
      const otherTier = await addParentReport({ childId: childC.id, tier: 'Ⅳ', period: '115年06月' });
      const otherPeriod = await addParentReport({ childId: childC.id, tier: 'Ⅴ', period: '115年07月' });
      await addCoursePlanEntry({ reportId: otherTier.id, indicatorCode: 'Ⅳ-1-1', activityName: 'x' });
      await addCoursePlanEntry({ reportId: otherPeriod.id, indicatorCode: 'Ⅴ-1-1', activityName: 'x' });
      // `source` stays empty.

      expect(await findCopySources(target)).toEqual([]);
    });
  });

  describe('copyCoursePlan', () => {
    it('copies entry fields, dates and notes; resets status/absent/courseChanged; leaves the source alone', async () => {
      const entry = await addCoursePlanEntry({ reportId: source.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫', indicatorText: '能拿筆塗鴉' });
      await addCourseOccurrence({ entryId: entry.id, date: '2026-06-03', status: 'developing', absent: true, courseChanged: false, note: '說明一' });
      await addCourseOccurrence({ entryId: entry.id, date: '2026-06-10', status: 'developing', absent: false, courseChanged: true, note: '說明二' });

      await copyCoursePlan({ targetReportId: target.id, sourceReportId: source.id });

      const [copied] = await listCoursePlanEntriesForReport(target.id);
      expect(copied).toMatchObject({ indicatorCode: 'Ⅴ-1-6', activityName: '畫畫', indicatorText: '能拿筆塗鴉' });
      expect(copied.uid).not.toBe(entry.uid);
      const occurrences = await listCourseOccurrencesForEntry(copied.id);
      expect(occurrences.map(o => [o.date, o.note, o.status, o.absent, o.courseChanged])).toEqual([
        ['2026-06-03', '說明一', 'developed', false, false],
        ['2026-06-10', '說明二', 'developed', false, false],
      ]);

      const sourceOccurrences = await listCourseOccurrencesForEntry(entry.id);
      expect(sourceOccurrences.map(o => o.status)).toEqual(['developing', 'developing']);
      expect(await listCoursePlanEntriesForReport(source.id)).toHaveLength(1);
    });

    it("replaces the target's existing entries and their occurrences", async () => {
      const old = await addCoursePlanEntry({ reportId: target.id, indicatorCode: 'Ⅴ-2-1', activityName: '舊活動' });
      await addCourseOccurrence({ entryId: old.id, date: '2026-06-01', status: 'developed', absent: false, note: '' });
      await addCoursePlanEntry({ reportId: source.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });

      await copyCoursePlan({ targetReportId: target.id, sourceReportId: source.id });

      const entries = await listCoursePlanEntriesForReport(target.id);
      expect(entries.map(e => e.activityName)).toEqual(['畫畫']);
      expect(await listCourseOccurrencesForEntry(old.id)).toEqual([]);
    });

    it('keeps source entry order', async () => {
      await addCoursePlanEntry({ reportId: source.id, indicatorCode: 'Ⅴ-1-7', activityName: '堆積木' });
      await addCoursePlanEntry({ reportId: source.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });

      await copyCoursePlan({ targetReportId: target.id, sourceReportId: source.id });

      expect((await listCoursePlanEntriesForReport(target.id)).map(e => e.activityName)).toEqual(['堆積木', '畫畫']);
    });

    it('re-links 適性發展紀錄表 ticks by indicator + activity, drops unmatched, dedupes, leaves empty ones alone', async () => {
      const keep = await addCoursePlanEntry({ reportId: target.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
      const keepTwin = await addCoursePlanEntry({ reportId: target.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
      const gone = await addCoursePlanEntry({ reportId: target.id, indicatorCode: 'Ⅴ-2-1', activityName: '舊活動' });
      const linked = await addDevelopmentRecordEntry({ reportId: target.id, domain: 1, courseEntryIds: [keep.id, keepTwin.id, gone.id], narrative: '甲' });
      const untouched = await addDevelopmentRecordEntry({ reportId: target.id, domain: 1, courseEntryIds: [], narrative: '乙' });
      await addCoursePlanEntry({ reportId: source.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });

      await copyCoursePlan({ targetReportId: target.id, sourceReportId: source.id });

      const [newEntry] = await listCoursePlanEntriesForReport(target.id);
      const records = await listDevelopmentRecordEntriesForReport(target.id);
      expect(records.find(r => r.id === linked.id)).toMatchObject({ courseEntryIds: [newEntry.id], narrative: '甲' });
      expect(records.find(r => r.id === untouched.id)).toMatchObject({ courseEntryIds: [], narrative: '乙' });
    });
  });

  describe('planCoursePlanCopy', () => {
    it('counts current rows, source rows, and records that would lose a tick — without writing', async () => {
      const keep = await addCoursePlanEntry({ reportId: target.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
      const gone = await addCoursePlanEntry({ reportId: target.id, indicatorCode: 'Ⅴ-2-1', activityName: '舊活動' });
      await addDevelopmentRecordEntry({ reportId: target.id, domain: 1, courseEntryIds: [keep.id], narrative: '全對得上' });
      await addDevelopmentRecordEntry({ reportId: target.id, domain: 2, courseEntryIds: [keep.id, gone.id], narrative: '有一個對不上' });
      await addCoursePlanEntry({ reportId: source.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
      await addCoursePlanEntry({ reportId: source.id, indicatorCode: 'Ⅴ-1-7', activityName: '堆積木' });
      await addCoursePlanEntry({ reportId: source.id, indicatorCode: 'Ⅴ-3-1', activityName: '唱歌' });

      const plan = await planCoursePlanCopy({ targetReportId: target.id, sourceReportId: source.id });

      expect(plan).toEqual({ currentCount: 2, sourceCount: 3, unlinkedRecordCount: 1 });
      expect(await listCoursePlanEntriesForReport(target.id)).toHaveLength(2);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/copyCoursePlan.test.js`
Expected: FAIL — cannot resolve `../src/domain/copyCoursePlan.js`.

- [ ] **Step 3: Implement**

Create `src/domain/copyCoursePlan.js`:

```js
import { listChildren } from '../storage/db.js';
import {
  listParentReportsForChild, listCoursePlanEntriesForReport, addCoursePlanEntry, deleteCoursePlanEntry,
  listCourseOccurrencesForEntry, addCourseOccurrence,
  listDevelopmentRecordEntriesForReport, updateDevelopmentRecordEntry,
} from '../storage/parentReportDb.js';

// Same indicator + activity = "the same row" when moving 適性發展紀錄表 ticks onto the copied rows.
// JSON.stringify keeps the two fields apart whatever their text (as aggregateCoursePlan.js does).
function rowKey(entry) {
  return JSON.stringify([entry.indicatorCode, entry.activityName]);
}

// Each record's courseEntryIds moved from the target's current rows onto whatever `newIdByKey` maps
// the same key to; ids with no match are dropped. `lostSome` = at least one tick won't survive.
function relink(records, oldEntries, newIdByKey) {
  const keyByOldId = new Map(oldEntries.map(entry => [entry.id, rowKey(entry)]));
  return records.map(record => {
    const mapped = (record.courseEntryIds || []).map(id => newIdByKey.get(keyByOldId.get(id)));
    return {
      record,
      ids: [...new Set(mapped.filter(id => id !== undefined))],
      lostSome: mapped.some(id => id === undefined),
    };
  });
}

// Other children's 適性紀錄 for the same tier and month that have a course plan to copy.
export async function findCopySources(report) {
  const sources = [];
  for (const child of await listChildren()) {
    for (const other of await listParentReportsForChild(child.id)) {
      if (other.id === report.id || other.tier !== report.tier || other.period !== report.period) continue;
      const entryCount = (await listCoursePlanEntriesForReport(other.id)).length;
      if (entryCount > 0) sources.push({ report: other, childName: child.name, entryCount });
    }
  }
  return sources;
}

// Read-only: the numbers the confirm dialog shows before anything is replaced.
export async function planCoursePlanCopy({ targetReportId, sourceReportId }) {
  const targetEntries = await listCoursePlanEntriesForReport(targetReportId);
  const sourceEntries = await listCoursePlanEntriesForReport(sourceReportId);
  const records = await listDevelopmentRecordEntriesForReport(targetReportId);
  const sourceKeys = new Map(sourceEntries.map(entry => [rowKey(entry), true]));
  return {
    currentCount: targetEntries.length,
    sourceCount: sourceEntries.length,
    unlinkedRecordCount: relink(records, targetEntries, sourceKeys).filter(r => r.lostSome).length,
  };
}

// Replaces the target report's course plan with a copy of the source's. Copies first and deletes
// last, so an interruption leaves duplicate rows to tidy up rather than lost ones.
export async function copyCoursePlan({ targetReportId, sourceReportId }) {
  const oldEntries = await listCoursePlanEntriesForReport(targetReportId);
  const sourceEntries = await listCoursePlanEntriesForReport(sourceReportId);

  const newIdByKey = new Map();
  for (const source of sourceEntries) {
    const entry = await addCoursePlanEntry({
      reportId: targetReportId,
      indicatorCode: source.indicatorCode,
      activityName: source.activityName,
      indicatorText: source.indicatorText,
    });
    if (!newIdByKey.has(rowKey(entry))) newIdByKey.set(rowKey(entry), entry.id);
    for (const occurrence of await listCourseOccurrencesForEntry(source.id)) {
      // ○／請假／更換課程 describe the source child, not this one — reset to the add form's defaults.
      await addCourseOccurrence({
        entryId: entry.id, date: occurrence.date, note: occurrence.note,
        status: 'developed', absent: false, courseChanged: false,
      });
    }
  }

  const records = await listDevelopmentRecordEntriesForReport(targetReportId);
  for (const { record, ids } of relink(records, oldEntries, newIdByKey)) {
    if ((record.courseEntryIds || []).length > 0) await updateDevelopmentRecordEntry(record.id, { courseEntryIds: ids });
  }

  for (const entry of oldEntries) await deleteCoursePlanEntry(entry.id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/copyCoursePlan.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/copyCoursePlan.js tests/copyCoursePlan.test.js
git commit -m "feat: copy another child's course plan into a 適性紀錄 (domain)"
```

---

### Task 2: Button + picker on the 課程計畫表 tab

**Files:**
- Modify: `src/ui/courseplanTabView.js` (imports at top; `renderCoursePlanTab` markup and wiring)
- Modify: `src/styles.css` (append a small `.copy-plan` block next to the `.tab-layout` rules, ~line 1385)
- Test: `tests/courseplanTabView.test.js` (append a `describe`)

**Interfaces:**
- Consumes: `findCopySources`, `planCoursePlanCopy`, `copyCoursePlan` from Task 1; `headerButtonLabel` (`src/ui/headerButtonLabel.js`); `oneAtATime`; the existing `confirmDelete` option of `renderCoursePlanTab`.
- Produces: DOM hooks `[data-action="toggle-copy-picker"]`, `[data-copy-picker]`, `[data-copy-from="<reportId>"]`, `[data-error="copy"]`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/courseplanTabView.test.js` (no import changes — `clearAllData`, `addChild`, `addParentReport`, `addCoursePlanEntry`, `listCoursePlanEntriesForReport`, `waitFor` are already imported):

```js
describe('renderCoursePlanTab — 套用其他幼兒課程計畫', () => {
  let report;
  let other;

  beforeEach(async () => {
    await clearAllData();
    const child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    const otherChild = await addChild({ name: '林小明', birthDate: '2024-07-01' });
    report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
    other = await addParentReport({ childId: otherChild.id, tier: 'Ⅴ', period: '115年06月' });
  });

  it('shows the button with full and short labels, picker hidden until clicked', async () => {
    const container = document.createElement('div');
    await renderCoursePlanTab(container, { report, onChange: () => {} });

    const toggle = container.querySelector('[data-action="toggle-copy-picker"]');
    expect(toggle.querySelector('.btn__label-full').textContent).toBe('套用其他幼兒課程計畫');
    expect(toggle.querySelector('.btn__label-short').textContent).toBe('套用');
    const picker = container.querySelector('[data-copy-picker]');
    expect(picker.hidden).toBe(true);

    toggle.click();
    expect(picker.hidden).toBe(false);
  });

  it('lists same tier/month children with entry counts, or an empty message', async () => {
    let container = document.createElement('div');
    await renderCoursePlanTab(container, { report, onChange: () => {} });
    expect(container.querySelector('[data-copy-picker]').textContent).toContain('沒有同年齡層、同月份的其他幼兒課程計畫可以套用');

    await addCoursePlanEntry({ reportId: other.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    container = document.createElement('div');
    await renderCoursePlanTab(container, { report, onChange: () => {} });
    expect(container.querySelector(`[data-copy-from="${other.id}"]`).textContent).toBe('林小明（1 筆）');
  });

  it('cancelling the confirm changes nothing', async () => {
    await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-2-1', activityName: '舊活動' });
    await addCoursePlanEntry({ reportId: other.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    let message = null;
    const container = document.createElement('div');
    await renderCoursePlanTab(container, { report, onChange: () => {}, confirmDelete: m => { message = m; return false; } });

    container.querySelector(`[data-copy-from="${other.id}"]`).click();
    await waitFor(() => message !== null);

    expect(message).toContain('目前這份的 1 筆課程計畫，會換成「林小明」的 1 筆課程計畫。');
    expect((await listCoursePlanEntriesForReport(report.id)).map(e => e.activityName)).toEqual(['舊活動']);
  });

  it('confirming replaces the course plan and re-renders', async () => {
    await addCoursePlanEntry({ reportId: other.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    let message = null;
    let changed = false;
    const container = document.createElement('div');
    await renderCoursePlanTab(container, {
      report, onChange: () => { changed = true; }, confirmDelete: m => { message = m; return true; },
    });

    container.querySelector(`[data-copy-from="${other.id}"]`).click();
    await waitFor(() => changed);

    expect(message).toContain('會套用「林小明」的 1 筆課程計畫。');
    expect((await listCoursePlanEntriesForReport(report.id)).map(e => e.activityName)).toEqual(['畫畫']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/courseplanTabView.test.js`
Expected: the 4 new tests FAIL (no `[data-action="toggle-copy-picker"]`); existing tests still pass.

- [ ] **Step 3: Implement**

In `src/ui/courseplanTabView.js`, add imports after the `oneAtATime` import:

```js
import { headerButtonLabel } from './headerButtonLabel.js';
import { findCopySources, planCoursePlanCopy, copyCoursePlan } from '../domain/copyCoursePlan.js';
```

Add this helper above `export async function renderCoursePlanTab(`:

```js
function copyConfirmMessage({ childName, currentCount, sourceCount, unlinkedRecordCount }) {
  const lines = [
    currentCount > 0
      ? `目前這份的 ${currentCount} 筆課程計畫，會換成「${childName}」的 ${sourceCount} 筆課程計畫。`
      : `會套用「${childName}」的 ${sourceCount} 筆課程計畫。`,
    '發展狀況一律先填 ○，請假、更換課程不會套用，請再逐筆確認。',
  ];
  if (unlinkedRecordCount > 0) lines.push(`有 ${unlinkedRecordCount} 段發展紀錄的對應課程會被取消勾選。`);
  lines.push('確定要套用嗎？');
  return lines.join('\n');
}
```

Inside `renderCoursePlanTab`, right after the `occurrencesByEntryId` loop:

```js
  const copySources = await findCopySources(report);
```

In the `container.innerHTML` template, insert before `<div class="tab-layout">`:

```js
    <div class="copy-plan">
      <button type="button" class="btn btn--outline btn--small" data-action="toggle-copy-picker" aria-expanded="false">${headerButtonLabel('套用其他幼兒課程計畫', '套用')}</button>
      <div class="copy-plan__picker" data-copy-picker hidden>
        ${copySources.length === 0
          ? '<p class="copy-plan__empty">沒有同年齡層、同月份的其他幼兒課程計畫可以套用</p>'
          : copySources.map(source => `<button type="button" class="btn btn--outline btn--small" data-copy-from="${escapeHtml(source.report.id)}">${escapeHtml(source.childName)}（${source.entryCount} 筆）</button>`).join('')}
      </div>
      <p class="field-error" data-error="copy"></p>
    </div>
```

Directly after the `container.innerHTML = ...;` assignment ends, add the wiring:

```js
  const copyPicker = container.querySelector('[data-copy-picker]');
  const copyToggle = container.querySelector('[data-action="toggle-copy-picker"]');
  copyToggle.addEventListener('click', () => {
    copyPicker.hidden = !copyPicker.hidden;
    copyToggle.setAttribute('aria-expanded', String(!copyPicker.hidden));
  });
  for (const source of copySources) {
    container.querySelector(`[data-copy-from="${source.report.id}"]`).addEventListener('click', oneAtATime(async () => {
      const ids = { targetReportId: report.id, sourceReportId: source.report.id };
      try {
        const counts = await planCoursePlanCopy(ids);
        // confirmDelete is just the tab's injectable confirm(); this replaces (deletes) rows too.
        if (!confirmDelete(copyConfirmMessage({ childName: source.childName, ...counts }))) return;
        await copyCoursePlan(ids);
        onChange();
      } catch (err) {
        container.querySelector('[data-error="copy"]').textContent = '套用失敗，請再試一次';
      }
    }));
  }
```

Append to `src/styles.css` right before the `/* ---------- Two-column tab layout` comment (~line 1377):

```css
/* 課程計畫表's 套用其他幼兒課程計畫 button and the child picker it opens, above the two columns. */
.copy-plan {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.copy-plan__picker {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.copy-plan__picker[hidden] {
  display: none;
}
.copy-plan__empty {
  margin: 0;
}
.copy-plan .field-error:empty {
  display: none;
}
```

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run tests/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/courseplanTabView.js src/styles.css tests/courseplanTabView.test.js
git commit -m "feat: 套用其他幼兒課程計畫 button on the 課程計畫表 tab"
```

---

### Task 3: Real-browser check + docs

**Files:**
- Modify: `CLAUDE.md` (item 2 in "What this project is")

- [ ] **Step 1: Build and drive it with Playwright**

Run: `npm run build`, then `npm install --no-save playwright` and a throwaway script in `$CLAUDE_JOB_DIR/tmp` (not committed) that opens `dist/TableC.html`, unlocks the password gate, creates two children with a 適性紀錄 each (same tier, same month), adds 2 course-plan rows with dates to the second, adds 1 row + 1 適性發展紀錄 tick to the first, then on the first: clicks 套用其他幼兒課程計畫 → the second child's line → accepts the dialog. Check: rows match the second child's, every occurrence shows ○ with no strike, the 適性發展紀錄表 tab's ticks follow the matching row. Also screenshot at 390px width: button reads 「套用」.
Expected: all checks hold; screenshots look aligned with the tab's other buttons.

- [ ] **Step 2: Update docs**

In `CLAUDE.md`, item 2, append after "…點滴分享 (photo highlights).":

```
 Its course plan can be replaced with a copy of another child's same-tier, same-month report (「套用其他幼兒課程計畫」, `src/domain/copyCoursePlan.js`) — dates and 說明 copy over, ○／△ resets to ○, 請假／更換課程 to unchecked.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note 套用其他幼兒課程計畫"
```
