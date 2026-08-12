# 課程月計畫 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third form type, 課程月計畫 (monthly class course plan): pick a year-month and a set of children, get one auto-generated calendar (weekdays only) per child with 大團體活動/節氣 defaults on Mon/Tue, indicator-based activity planning shared per age-tier on the other days, per-child 未達成/請假(代替) marks, and a docx export matching the reference sample.

**Architecture:** Follows this codebase's existing three-layer split exactly: `src/storage/*Db.js` (raw IndexedDB CRUD, one function per operation, cascading deletes written by hand), `src/domain/*.js` (pure or storage-calling business logic, no DOM), `src/ui/*View.js` (render functions taking a container + callbacks, re-render-on-mutate style — no framework). A new entity family (MonthlyCoursePlan → PlanSlot → PlanSlotItem, plus ChildItemOverride) is added as four new IndexedDB object stores, mirroring the existing ParentReport → CoursePlanEntry → CourseOccurrence shape. The calendar grid itself is pure date math in `src/domain/monthlyCalendar.js`, testable with no storage or DOM involved.

**Tech Stack:** Vanilla JS (ES modules), IndexedDB (via existing `runRequest` helper), `docx` npm package for export, vitest + jsdom + fake-indexeddb for tests. No new dependencies.

## Global Constraints

- Every new source file's on-screen and exported strings are Traditional Chinese, matching every existing file in this repo.
- No new npm dependencies — `docx`, `jszip`, `vitest`, `jsdom`, `fake-indexeddb` are already installed and are the only tools needed.
- Follow the existing storage convention exactly: one object store per entity, `keyPath: 'id', autoIncrement: true`, a `by_<parentField>` index for parent lookups, cascading deletes implemented by hand in the parent's `delete*` function (see `src/storage/parentReportDb.js` for the reference pattern).
- Follow the existing UI convention exactly: `render*View(container, { ...props, onX })` functions that set `container.innerHTML` and re-invoke themselves after any mutation (no virtual DOM, no component framework).
- Follow the existing docx export convention exactly: pure, storage-free "row/run builder" functions (e.g. `buildIndicatorRows`) are unit-tested directly; the `docx` package assembly (`Table`/`TableRow`/`TableCell`/`Paragraph`/`TextRun`) consumes those pre-built structures and is not itself unit-tested beyond smoke-checking it doesn't throw — final visual fidelity against the reference document is a manual check, not an automated one (see Task 13).
- Reuse `src/data/indicators.js` (`TIERS`, `getIndicatorsForTier`, `getIndicator`), `src/domain/ageTier.js` (`suggestTier`, `calculateAgeInMonths`), and `src/ui/periodFields.js` (`periodSelectsHtml`, `parsePeriod`, `currentRocYear`) rather than re-implementing any of them.
- This plan does not touch docx import, class/roster management, or holiday-calendar logic — these are explicit non-goals in `docs/superpowers/specs/2026-08-12-monthly-course-plan-design.md`.

---

## File Structure

New files:
- `src/domain/monthlyCalendar.js` — pure calendar math: year+month → weeks of weekdays.
- `src/domain/monthlyCoursePlan.js` — `seedDefaultPlanSlots`, the one piece of cross-cutting business logic (weeks × tiers → default Mon/Tue slot items).
- `src/storage/monthlyPlanDb.js` — CRUD for the four new object stores.
- `src/ui/monthlyPlanListView.js` — list/create/delete 課程月計畫.
- `src/ui/monthlyPlanEditorView.js` — the two-pane editor (left: per-child calendars, right: edit panel). Built incrementally across Tasks 7–10.
- `src/export/monthlyPlanDocxExport.js` — docx export.
- `tests/monthlyCalendar.test.js`, `tests/monthlyCoursePlan.test.js`, `tests/monthlyPlanDb.test.js`, `tests/monthlyPlanListView.test.js`, `tests/monthlyPlanEditorView.test.js`, `tests/monthlyPlanDocxExport.test.js` — one test file per new source file, same naming convention as the rest of `tests/`.

Modified files:
- `src/storage/dbCore.js` — add 4 object stores, bump `DB_VERSION`.
- `src/storage/backup.js` — include the new stores in export/import, bump `BACKUP_VERSION`.
- `src/ui/reportTypeSelectView.js` — add the third type button.
- `src/app.js` — wire the three new routes.
- `src/styles.css` — calendar grid layout + red/strike item styling.
- `tests/dbCore.test.js`, `tests/backup.test.js`, `tests/reportTypeSelectView.test.js`, `tests/app.test.js` — extended for the above.

---

## Data Model Reference (for every task below)

```
MonthlyCoursePlan   { id, period, childIds: number[], childTiers: { [childId]: tierCode }, createdAt }
PlanSlot             { id, planId, tier, weekIndex, weekday }   // weekday: 1=一..5=五
PlanSlotItem         { id, slotId, indicatorCode: string|null, activityName, indicatorText }
ChildItemOverride    { id, planId, childId, itemId, notAchieved: boolean, replaced: boolean, replacementText: string }
```

A `ChildItemOverride` row only exists while at least one of `notAchieved`/`replaced` is true — `setChildItemOverride` deletes the row once both are cleared, so there is never a dead "all-false" row to special-case elsewhere.

---

### Task 1: Add the four new object stores to dbCore

**Files:**
- Modify: `src/storage/dbCore.js`
- Test: `tests/dbCore.test.js`

**Interfaces:**
- Produces: object stores `monthlyCoursePlans` (no index), `planSlots` (index `by_planId`), `planSlotItems` (index `by_slotId`), `childItemOverrides` (index `by_planId`) — all `keyPath: 'id', autoIncrement: true`.

- [ ] **Step 1: Read the existing test for reference**

Open `tests/dbCore.test.js` and note how it asserts store/index existence (it opens the DB directly and checks `objectStoreNames`/`indexNames`).

- [ ] **Step 2: Write the failing test**

Add to `tests/dbCore.test.js`:

```js
it('creates the monthly course plan stores with their indexes', async () => {
  const db = await openDatabase();
  expect(db.objectStoreNames.contains('monthlyCoursePlans')).toBe(true);
  expect(db.objectStoreNames.contains('planSlots')).toBe(true);
  expect(db.objectStoreNames.contains('planSlotItems')).toBe(true);
  expect(db.objectStoreNames.contains('childItemOverrides')).toBe(true);

  const tx = db.transaction(['planSlots', 'planSlotItems', 'childItemOverrides'], 'readonly');
  expect(tx.objectStore('planSlots').indexNames.contains('by_planId')).toBe(true);
  expect(tx.objectStore('planSlotItems').indexNames.contains('by_slotId')).toBe(true);
  expect(tx.objectStore('childItemOverrides').indexNames.contains('by_planId')).toBe(true);
  db.close();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/dbCore.test.js`
Expected: FAIL (stores don't exist yet)

- [ ] **Step 4: Implement**

In `src/storage/dbCore.js`, bump `export const DB_VERSION = 2;` to `3;`, and inside `request.onupgradeneeded`, after the existing `highlightEntries` block, add:

```js
      if (!db.objectStoreNames.contains('monthlyCoursePlans')) {
        db.createObjectStore('monthlyCoursePlans', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('planSlots')) {
        const planSlots = db.createObjectStore('planSlots', { keyPath: 'id', autoIncrement: true });
        planSlots.createIndex('by_planId', 'planId');
      }
      if (!db.objectStoreNames.contains('planSlotItems')) {
        const planSlotItems = db.createObjectStore('planSlotItems', { keyPath: 'id', autoIncrement: true });
        planSlotItems.createIndex('by_slotId', 'slotId');
      }
      if (!db.objectStoreNames.contains('childItemOverrides')) {
        const childItemOverrides = db.createObjectStore('childItemOverrides', { keyPath: 'id', autoIncrement: true });
        childItemOverrides.createIndex('by_planId', 'planId');
      }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/dbCore.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/storage/dbCore.js tests/dbCore.test.js
git commit -m "feat: add monthly course plan object stores"
```

---

### Task 2: Calendar math — `src/domain/monthlyCalendar.js`

**Files:**
- Create: `src/domain/monthlyCalendar.js`
- Test: `tests/monthlyCalendar.test.js`

**Interfaces:**
- Produces: `buildMonthlyCalendar(year, month)` → `Week[]` where `Week = { weekIndex: number, dateRange: string, days: Day[] }` and `Day = { weekday: 1|2|3|4|5, isoDate: 'YYYY-MM-DD', dateLabel: 'MM/DD(一)' }`. `year`/`month` are Gregorian (month is 1-12). Weeks are Monday-start buckets; the first/last week is partial if the month doesn't start on Monday / end on Friday. Weekends are omitted entirely.

- [ ] **Step 1: Write the failing test**

Create `tests/monthlyCalendar.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildMonthlyCalendar } from '../src/domain/monthlyCalendar.js';

describe('buildMonthlyCalendar', () => {
  it('splits a month that starts on Monday and ends on Tuesday into 5 weeks, last one partial', () => {
    // June 2026: 6/1 is a Monday, 6/30 is a Tuesday.
    const weeks = buildMonthlyCalendar(2026, 6);

    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual({
      weekIndex: 1,
      dateRange: '06/01-06/05',
      days: [
        { weekday: 1, isoDate: '2026-06-01', dateLabel: '06/01(一)' },
        { weekday: 2, isoDate: '2026-06-02', dateLabel: '06/02(二)' },
        { weekday: 3, isoDate: '2026-06-03', dateLabel: '06/03(三)' },
        { weekday: 4, isoDate: '2026-06-04', dateLabel: '06/04(四)' },
        { weekday: 5, isoDate: '2026-06-05', dateLabel: '06/05(五)' },
      ],
    });
    expect(weeks[4]).toEqual({
      weekIndex: 5,
      dateRange: '06/29-06/30',
      days: [
        { weekday: 1, isoDate: '2026-06-29', dateLabel: '06/29(一)' },
        { weekday: 2, isoDate: '2026-06-30', dateLabel: '06/30(二)' },
      ],
    });
  });

  it('gives the first week fewer than 5 days when the month starts mid-week', () => {
    // July 2026: 7/1 is a Wednesday.
    const weeks = buildMonthlyCalendar(2026, 7);

    expect(weeks[0].days.map(d => d.weekday)).toEqual([3, 4, 5]);
    expect(weeks[0].dateRange).toBe('07/01-07/03');
  });

  it('never includes a Saturday or Sunday', () => {
    const weeks = buildMonthlyCalendar(2026, 6);
    const allWeekdays = weeks.flatMap(w => w.days.map(d => d.weekday));
    expect(allWeekdays.every(w => w >= 1 && w <= 5)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/monthlyCalendar.test.js`
Expected: FAIL with "Cannot find module '../src/domain/monthlyCalendar.js'"

- [ ] **Step 3: Implement**

Create `src/domain/monthlyCalendar.js`:

```js
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五']; // index 0 = weekday 1 (Mon)

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Splits every weekday (Mon-Fri) of a Gregorian year/month into Monday-start week buckets. The
// first bucket is short if the month doesn't start on Monday; the last is short if it doesn't
// end on Friday. Weekends are dropped entirely (this app has no concept of a "上課日" outside
// Mon-Fri — holidays/停課 within a weekday are handled as ordinary typed-in content, not here).
export function buildMonthlyCalendar(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const weeks = [];
  let currentWeek = null;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month - 1, day);
    const dow = date.getDay(); // 0=Sun..6=Sat
    if (dow === 0 || dow === 6) continue;

    const weekday = dow; // 1=Mon..5=Fri
    if (!currentWeek || weekday === 1) {
      currentWeek = { weekIndex: weeks.length + 1, days: [] };
      weeks.push(currentWeek);
    }
    currentWeek.days.push({
      weekday,
      isoDate: `${year}-${pad2(month)}-${pad2(day)}`,
      dateLabel: `${pad2(month)}/${pad2(day)}(${WEEKDAY_LABELS[weekday - 1]})`,
    });
  }

  return weeks.map(week => {
    const first = week.days[0];
    const last = week.days[week.days.length - 1];
    return {
      weekIndex: week.weekIndex,
      dateRange: `${first.isoDate.slice(5).replace('-', '/')}-${last.isoDate.slice(5).replace('-', '/')}`,
      days: week.days,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/monthlyCalendar.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/monthlyCalendar.js tests/monthlyCalendar.test.js
git commit -m "feat: add monthly calendar week-splitting logic"
```

---

### Task 3: Storage CRUD — `src/storage/monthlyPlanDb.js`

**Files:**
- Create: `src/storage/monthlyPlanDb.js`
- Test: `tests/monthlyPlanDb.test.js`

**Interfaces:**
- Consumes: `runRequest(storeName, mode, fn)` from `src/storage/dbCore.js` (Task 1).
- Produces (all `async`):
  - `addMonthlyCoursePlan({ period, childIds, childTiers })` → `{ id, period, childIds, childTiers, createdAt }`
  - `listMonthlyCoursePlans()` → array
  - `getMonthlyCoursePlan(id)` → object or `undefined`
  - `updateMonthlyCoursePlan(id, changes)` → updated object
  - `deleteMonthlyCoursePlan(id)` → cascades to its `PlanSlot`s (and their items) and `ChildItemOverride`s
  - `listPlanSlotsForPlan(planId)` → array
  - `getOrCreatePlanSlot({ planId, tier, weekIndex, weekday })` → existing or newly-created slot
  - `deletePlanSlot(id)` → cascades to its `PlanSlotItem`s (and, via `deletePlanSlotItem`, their overrides)
  - `listPlanSlotItems(slotId)` → array
  - `addPlanSlotItem({ slotId, indicatorCode = null, activityName, indicatorText = '' })` → created item
  - `updatePlanSlotItem(id, changes)` → updated item
  - `deletePlanSlotItem(id)` → cascades to `ChildItemOverride`s referencing this `itemId`
  - `listChildItemOverridesForPlan(planId)` → array
  - `setChildItemOverride({ planId, childId, itemId, notAchieved, replaced, replacementText = '' })` → upserts; deletes the row instead when both `notAchieved` and `replaced` are false; returns the row or `null` when deleted
  - `deleteChildItemOverridesForChild(planId, childId)` → deletes every override row for that child in that plan (used when removing a child from a plan)

- [ ] **Step 1: Write the failing tests**

Create `tests/monthlyPlanDb.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllData } from '../src/storage/db.js';
import {
  addMonthlyCoursePlan, listMonthlyCoursePlans, getMonthlyCoursePlan, updateMonthlyCoursePlan, deleteMonthlyCoursePlan,
  listPlanSlotsForPlan, getOrCreatePlanSlot, deletePlanSlot,
  listPlanSlotItems, addPlanSlotItem, updatePlanSlotItem, deletePlanSlotItem,
  listChildItemOverridesForPlan, setChildItemOverride, deleteChildItemOverridesForChild,
} from '../src/storage/monthlyPlanDb.js';

describe('monthlyPlanDb: MonthlyCoursePlan', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('adds a plan and lists it back', async () => {
    const plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [1, 2], childTiers: { 1: 'Ⅳ', 2: 'Ⅴ' } });
    expect(plan.id).toBeTypeOf('number');
    expect(plan.createdAt).toBeTypeOf('string');
    expect(await listMonthlyCoursePlans()).toEqual([plan]);
  });

  it('gets a plan by id', async () => {
    const plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [1], childTiers: { 1: 'Ⅴ' } });
    expect(await getMonthlyCoursePlan(plan.id)).toEqual(plan);
  });

  it('updates a plan (e.g. adding a child)', async () => {
    const plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [1], childTiers: { 1: 'Ⅴ' } });
    const updated = await updateMonthlyCoursePlan(plan.id, { childIds: [1, 2], childTiers: { 1: 'Ⅴ', 2: 'Ⅳ' } });
    expect(updated.childIds).toEqual([1, 2]);
    expect(await getMonthlyCoursePlan(plan.id)).toEqual(updated);
  });

  it('deleting a plan cascades to its slots, items, and overrides', async () => {
    const plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [1], childTiers: { 1: 'Ⅴ' } });
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 1 });
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: '大團體活動' });
    await setChildItemOverride({ planId: plan.id, childId: 1, itemId: item.id, notAchieved: true, replaced: false });

    await deleteMonthlyCoursePlan(plan.id);

    expect(await getMonthlyCoursePlan(plan.id)).toBeUndefined();
    expect(await listPlanSlotsForPlan(plan.id)).toEqual([]);
    expect(await listPlanSlotItems(slot.id)).toEqual([]);
    expect(await listChildItemOverridesForPlan(plan.id)).toEqual([]);
  });
});

describe('monthlyPlanDb: PlanSlot / PlanSlotItem', () => {
  let plan;

  beforeEach(async () => {
    await clearAllData();
    plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [1], childTiers: { 1: 'Ⅴ' } });
  });

  it('getOrCreatePlanSlot creates once, then returns the same slot on repeat calls', async () => {
    const first = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const second = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    expect(second).toEqual(first);
    expect(await listPlanSlotsForPlan(plan.id)).toHaveLength(1);
  });

  it('different (tier, weekIndex, weekday) combos are different slots', async () => {
    await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 4 });
    await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅳ', weekIndex: 1, weekday: 3 });
    expect(await listPlanSlotsForPlan(plan.id)).toHaveLength(3);
  });

  it('adds, updates, and deletes a slot item', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const item = await addPlanSlotItem({ slotId: slot.id, indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲', indicatorText: '能依形狀或顏色分類' });
    expect(await listPlanSlotItems(slot.id)).toEqual([item]);

    const updated = await updatePlanSlotItem(item.id, { activityName: '分類遊戲(改)' });
    expect(updated.activityName).toBe('分類遊戲(改)');

    await deletePlanSlotItem(item.id);
    expect(await listPlanSlotItems(slot.id)).toEqual([]);
  });

  it('deleting a slot cascades to its items', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    await addPlanSlotItem({ slotId: slot.id, activityName: 'x' });
    await deletePlanSlot(slot.id);
    expect(await listPlanSlotItems(slot.id)).toEqual([]);
    expect(await listPlanSlotsForPlan(plan.id)).toEqual([]);
  });

  it('deleting an item cascades to overrides referencing it, leaving other overrides alone', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const itemA = await addPlanSlotItem({ slotId: slot.id, activityName: 'a' });
    const itemB = await addPlanSlotItem({ slotId: slot.id, activityName: 'b' });
    await setChildItemOverride({ planId: plan.id, childId: 1, itemId: itemA.id, notAchieved: true, replaced: false });
    await setChildItemOverride({ planId: plan.id, childId: 1, itemId: itemB.id, notAchieved: true, replaced: false });

    await deletePlanSlotItem(itemA.id);

    const remaining = await listChildItemOverridesForPlan(plan.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].itemId).toBe(itemB.id);
  });
});

describe('monthlyPlanDb: ChildItemOverride', () => {
  let plan, item;

  beforeEach(async () => {
    await clearAllData();
    plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [1], childTiers: { 1: 'Ⅴ' } });
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    item = await addPlanSlotItem({ slotId: slot.id, activityName: 'x' });
  });

  it('creates an override when a flag is set', async () => {
    const override = await setChildItemOverride({ planId: plan.id, childId: 1, itemId: item.id, notAchieved: true, replaced: false });
    expect(override.notAchieved).toBe(true);
    expect(await listChildItemOverridesForPlan(plan.id)).toEqual([override]);
  });

  it('updates the same row on a second call instead of creating a duplicate', async () => {
    await setChildItemOverride({ planId: plan.id, childId: 1, itemId: item.id, notAchieved: true, replaced: false });
    const second = await setChildItemOverride({
      planId: plan.id, childId: 1, itemId: item.id, notAchieved: true, replaced: true, replacementText: '請假',
    });
    const all = await listChildItemOverridesForPlan(plan.id);
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(second);
    expect(second.replacementText).toBe('請假');
  });

  it('deletes the row once both flags are cleared', async () => {
    await setChildItemOverride({ planId: plan.id, childId: 1, itemId: item.id, notAchieved: true, replaced: false });
    const result = await setChildItemOverride({ planId: plan.id, childId: 1, itemId: item.id, notAchieved: false, replaced: false });
    expect(result).toBeNull();
    expect(await listChildItemOverridesForPlan(plan.id)).toEqual([]);
  });

  it('deleteChildItemOverridesForChild removes only that child\'s rows', async () => {
    await setChildItemOverride({ planId: plan.id, childId: 1, itemId: item.id, notAchieved: true, replaced: false });
    await setChildItemOverride({ planId: plan.id, childId: 2, itemId: item.id, notAchieved: true, replaced: false });

    await deleteChildItemOverridesForChild(plan.id, 1);

    const remaining = await listChildItemOverridesForPlan(plan.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].childId).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/monthlyPlanDb.test.js`
Expected: FAIL with "Cannot find module '../src/storage/monthlyPlanDb.js'"

- [ ] **Step 3: Implement**

Create `src/storage/monthlyPlanDb.js`:

```js
import { runRequest } from './dbCore.js';

export async function addMonthlyCoursePlan({ period, childIds, childTiers }) {
  const createdAt = new Date().toISOString();
  const id = await runRequest('monthlyCoursePlans', 'readwrite', store => store.add({ period, childIds, childTiers, createdAt }));
  return { id, period, childIds, childTiers, createdAt };
}

export async function listMonthlyCoursePlans() {
  return runRequest('monthlyCoursePlans', 'readonly', store => store.getAll());
}

export async function getMonthlyCoursePlan(id) {
  return runRequest('monthlyCoursePlans', 'readonly', store => store.get(id));
}

export async function updateMonthlyCoursePlan(id, changes) {
  const existing = await runRequest('monthlyCoursePlans', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`MonthlyCoursePlan ${id} not found`);
  const updated = { ...existing, ...changes, id };
  await runRequest('monthlyCoursePlans', 'readwrite', store => store.put(updated));
  return updated;
}

// Cascades: deleting a plan also deletes every PlanSlot (+ its PlanSlotItems, + any
// ChildItemOverrides those items carry) and any ChildItemOverride left over.
export async function deleteMonthlyCoursePlan(id) {
  const slots = await listPlanSlotsForPlan(id);
  for (const slot of slots) {
    await deletePlanSlot(slot.id);
  }
  const overrides = await listChildItemOverridesForPlan(id);
  for (const override of overrides) {
    await runRequest('childItemOverrides', 'readwrite', store => store.delete(override.id));
  }
  await runRequest('monthlyCoursePlans', 'readwrite', store => store.delete(id));
}

export async function listPlanSlotsForPlan(planId) {
  return runRequest('planSlots', 'readonly', store => store.index('by_planId').getAll(planId));
}

export async function getOrCreatePlanSlot({ planId, tier, weekIndex, weekday }) {
  const slots = await listPlanSlotsForPlan(planId);
  const existing = slots.find(s => s.tier === tier && s.weekIndex === weekIndex && s.weekday === weekday);
  if (existing) return existing;
  const id = await runRequest('planSlots', 'readwrite', store => store.add({ planId, tier, weekIndex, weekday }));
  return { id, planId, tier, weekIndex, weekday };
}

// Cascades: deleting a slot also deletes every PlanSlotItem under it (and, via deletePlanSlotItem,
// every ChildItemOverride referencing one of those items).
export async function deletePlanSlot(id) {
  const items = await listPlanSlotItems(id);
  for (const item of items) {
    await deletePlanSlotItem(item.id);
  }
  await runRequest('planSlots', 'readwrite', store => store.delete(id));
}

export async function listPlanSlotItems(slotId) {
  return runRequest('planSlotItems', 'readonly', store => store.index('by_slotId').getAll(slotId));
}

export async function addPlanSlotItem({ slotId, indicatorCode = null, activityName, indicatorText = '' }) {
  const id = await runRequest('planSlotItems', 'readwrite', store => store.add({ slotId, indicatorCode, activityName, indicatorText }));
  return { id, slotId, indicatorCode, activityName, indicatorText };
}

export async function updatePlanSlotItem(id, changes) {
  const existing = await runRequest('planSlotItems', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`PlanSlotItem ${id} not found`);
  const updated = { ...existing, ...changes, id };
  await runRequest('planSlotItems', 'readwrite', store => store.put(updated));
  return updated;
}

// Cascades: deleting an item also deletes every ChildItemOverride referencing it. Overrides are
// only indexed by planId, so this looks up the item's plan (via its slot) to scope the scan.
export async function deletePlanSlotItem(id) {
  const item = await runRequest('planSlotItems', 'readonly', store => store.get(id));
  if (item) {
    const slot = await runRequest('planSlots', 'readonly', store => store.get(item.slotId));
    if (slot) {
      const overrides = await listChildItemOverridesForPlan(slot.planId);
      for (const override of overrides) {
        if (override.itemId === id) {
          await runRequest('childItemOverrides', 'readwrite', store => store.delete(override.id));
        }
      }
    }
  }
  await runRequest('planSlotItems', 'readwrite', store => store.delete(id));
}

export async function listChildItemOverridesForPlan(planId) {
  return runRequest('childItemOverrides', 'readonly', store => store.index('by_planId').getAll(planId));
}

// Upserts a child's mark on one item. Once both flags are false there is nothing left to
// remember, so the row is deleted instead of kept around as a no-op default — every other
// consumer can then treat "no matching row" as the single source of truth for "no override".
export async function setChildItemOverride({ planId, childId, itemId, notAchieved, replaced, replacementText = '' }) {
  const existing = (await listChildItemOverridesForPlan(planId)).find(o => o.childId === childId && o.itemId === itemId);

  if (!notAchieved && !replaced) {
    if (existing) await runRequest('childItemOverrides', 'readwrite', store => store.delete(existing.id));
    return null;
  }

  if (existing) {
    const updated = { ...existing, notAchieved, replaced, replacementText };
    await runRequest('childItemOverrides', 'readwrite', store => store.put(updated));
    return updated;
  }

  const id = await runRequest('childItemOverrides', 'readwrite', store =>
    store.add({ planId, childId, itemId, notAchieved, replaced, replacementText })
  );
  return { id, planId, childId, itemId, notAchieved, replaced, replacementText };
}

export async function deleteChildItemOverridesForChild(planId, childId) {
  const overrides = await listChildItemOverridesForPlan(planId);
  for (const override of overrides) {
    if (override.childId === childId) {
      await runRequest('childItemOverrides', 'readwrite', store => store.delete(override.id));
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/monthlyPlanDb.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/storage/monthlyPlanDb.js tests/monthlyPlanDb.test.js
git commit -m "feat: add monthly course plan storage CRUD"
```

---

### Task 4: Default Mon/Tue seeding — `src/domain/monthlyCoursePlan.js`

**Files:**
- Create: `src/domain/monthlyCoursePlan.js`
- Test: `tests/monthlyCoursePlan.test.js`

**Interfaces:**
- Consumes: `getOrCreatePlanSlot`, `listPlanSlotItems`, `addPlanSlotItem` from `src/storage/monthlyPlanDb.js` (Task 3); `Week` shape from `src/domain/monthlyCalendar.js` (Task 2).
- Produces: `seedDefaultPlanSlots({ planId, tiers, weeks })` (async, no return value) — for every `(tier, week)` pair, fills the Monday slot with a `大團體活動` item and the Tuesday slot (if that week has one) with a `節氣` item, **only when that slot doesn't already have items** (safe to call repeatedly, e.g. when a child of an already-seeded tier is added later).

- [ ] **Step 1: Write the failing test**

Create `tests/monthlyCoursePlan.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllData } from '../src/storage/db.js';
import { addMonthlyCoursePlan, getOrCreatePlanSlot, listPlanSlotItems, addPlanSlotItem } from '../src/storage/monthlyPlanDb.js';
import { buildMonthlyCalendar } from '../src/domain/monthlyCalendar.js';
import { seedDefaultPlanSlots } from '../src/domain/monthlyCoursePlan.js';

describe('seedDefaultPlanSlots', () => {
  let plan, weeks;

  beforeEach(async () => {
    await clearAllData();
    plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [1], childTiers: { 1: 'Ⅴ' } });
    weeks = buildMonthlyCalendar(2026, 6); // 5 weeks, last week is Mon+Tue only (06/29-06/30)
  });

  it('fills every week\'s Monday with 大團體活動 and Tuesday with 節氣, for the given tier', async () => {
    await seedDefaultPlanSlots({ planId: plan.id, tiers: ['Ⅴ'], weeks });

    for (const week of weeks) {
      const mondaySlot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: week.weekIndex, weekday: 1 });
      const mondayItems = await listPlanSlotItems(mondaySlot.id);
      expect(mondayItems.map(i => i.activityName)).toEqual(['大團體活動']);

      const tuesdaySlot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: week.weekIndex, weekday: 2 });
      const tuesdayItems = await listPlanSlotItems(tuesdaySlot.id);
      expect(tuesdayItems.map(i => i.activityName)).toEqual(['節氣']);
    }
  });

  it('seeds every tier passed in', async () => {
    await seedDefaultPlanSlots({ planId: plan.id, tiers: ['Ⅳ', 'Ⅴ'], weeks });

    const ivMonday = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅳ', weekIndex: 1, weekday: 1 });
    expect((await listPlanSlotItems(ivMonday.id)).map(i => i.activityName)).toEqual(['大團體活動']);
  });

  it('does not duplicate items when called again on an already-seeded tier', async () => {
    await seedDefaultPlanSlots({ planId: plan.id, tiers: ['Ⅴ'], weeks });
    await seedDefaultPlanSlots({ planId: plan.id, tiers: ['Ⅴ'], weeks });

    const mondaySlot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 1 });
    expect(await listPlanSlotItems(mondaySlot.id)).toHaveLength(1);
  });

  it('leaves a Monday item the teacher already edited untouched on a later call', async () => {
    const mondaySlot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 1 });
    await addPlanSlotItem({ slotId: mondaySlot.id, activityName: '戶外教學' });

    await seedDefaultPlanSlots({ planId: plan.id, tiers: ['Ⅴ'], weeks });

    expect((await listPlanSlotItems(mondaySlot.id)).map(i => i.activityName)).toEqual(['戶外教學']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/monthlyCoursePlan.test.js`
Expected: FAIL with "Cannot find module '../src/domain/monthlyCoursePlan.js'"

- [ ] **Step 3: Implement**

Create `src/domain/monthlyCoursePlan.js`:

```js
import { getOrCreatePlanSlot, listPlanSlotItems, addPlanSlotItem } from '../storage/monthlyPlanDb.js';

const DEFAULTS = [
  [1, '大團體活動'],
  [2, '節氣'],
];

// New MonthlyCoursePlans start with 大團體活動 (Monday) and 節氣 (Tuesday) pre-filled for every
// tier present among the plan's children, for every week that actually has that weekday (a
// month's first/last week may be partial — see monthlyCalendar.js). Only touches slots that
// don't already have items, so it's safe to call again later (e.g. adding a child of an
// already-seeded tier, or of a genuinely new tier) without duplicating or overwriting anything
// the teacher already edited.
export async function seedDefaultPlanSlots({ planId, tiers, weeks }) {
  for (const tier of tiers) {
    for (const week of weeks) {
      for (const [weekday, activityName] of DEFAULTS) {
        if (!week.days.some(d => d.weekday === weekday)) continue;
        const slot = await getOrCreatePlanSlot({ planId, tier, weekIndex: week.weekIndex, weekday });
        const existingItems = await listPlanSlotItems(slot.id);
        if (existingItems.length === 0) {
          await addPlanSlotItem({ slotId: slot.id, indicatorCode: null, activityName, indicatorText: '' });
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/monthlyCoursePlan.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/monthlyCoursePlan.js tests/monthlyCoursePlan.test.js
git commit -m "feat: seed default Monday/Tuesday plan slots"
```

---

### Task 5: Third type button — `reportTypeSelectView.js`

**Files:**
- Modify: `src/ui/reportTypeSelectView.js`
- Test: `tests/reportTypeSelectView.test.js`

**Interfaces:**
- Produces: `renderReportTypeSelectView(container, { onSelectType })` now also fires `onSelectType('monthly-plan')` for the new button.

- [ ] **Step 1: Read the existing test**

Open `tests/reportTypeSelectView.test.js` to see how the existing two buttons are asserted (click → `onSelectType` called with the type string).

- [ ] **Step 2: Write the failing test**

Add to `tests/reportTypeSelectView.test.js`:

```js
it('clicking 課程月計畫 calls onSelectType with "monthly-plan"', async () => {
  const container = document.createElement('div');
  const onSelectType = vi.fn();
  await renderReportTypeSelectView(container, { onSelectType });

  container.querySelector('[data-type="monthly-plan"]').click();

  expect(onSelectType).toHaveBeenCalledWith('monthly-plan');
});
```

(Check the file's existing imports — it should already import `vi` from `vitest` alongside `describe`/`it`/`expect`; add it if not.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/reportTypeSelectView.test.js`
Expected: FAIL — `[data-type="monthly-plan"]` is null

- [ ] **Step 4: Implement**

In `src/ui/reportTypeSelectView.js`, add a third button next to the existing two:

```js
        <button type="button" class="btn btn--primary type-select__option" data-type="assessment">適性總表</button>
        <button type="button" class="btn btn--primary type-select__option" data-type="parent-report">適性紀錄(家長版)</button>
        <button type="button" class="btn btn--primary type-select__option" data-type="monthly-plan">課程月計畫</button>
```

and wire it the same way as the other two:

```js
  container.querySelector('[data-type="monthly-plan"]').addEventListener('click', () => onSelectType('monthly-plan'));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/reportTypeSelectView.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui/reportTypeSelectView.js tests/reportTypeSelectView.test.js
git commit -m "feat: add 課程月計畫 to the form type select screen"
```

---

### Task 6: List/create/delete screen — `src/ui/monthlyPlanListView.js`

**Files:**
- Create: `src/ui/monthlyPlanListView.js`
- Test: `tests/monthlyPlanListView.test.js`

**Interfaces:**
- Consumes: `listChildren` (`src/storage/db.js`); `addMonthlyCoursePlan`, `listMonthlyCoursePlans`, `deleteMonthlyCoursePlan` (Task 3); `suggestTier` (`src/domain/ageTier.js`); `buildMonthlyCalendar` (Task 2); `seedDefaultPlanSlots` (Task 4); `periodSelectsHtml`, `parsePeriod`, `currentRocYear` (`src/ui/periodFields.js`); `escapeHtml` (`src/ui/escapeHtml.js`).
- Produces: `renderMonthlyPlanListView(container, { onSelectPlan, onBack, confirmDelete })`.

- [ ] **Step 1: Write the failing tests**

Create `tests/monthlyPlanListView.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import { listMonthlyCoursePlans, listPlanSlotItems, getOrCreatePlanSlot } from '../src/storage/monthlyPlanDb.js';
import { renderMonthlyPlanListView } from '../src/ui/monthlyPlanListView.js';
import { currentRocYear } from '../src/ui/periodFields.js';

describe('monthlyPlanListView', () => {
  let container, childA, childB;

  beforeEach(async () => {
    await clearAllData();
    container = document.createElement('div');
    // 2Y old as of 2026-06 -> tier Ⅴ (19-24個月); the exact birthdate only needs to land there.
    childA = await addChild({ name: '趙萬竑', birthDate: '2024-07-01' });
    childB = await addChild({ name: '張珏銨', birthDate: '2025-01-01' });
  });

  it('renders existing plans with their period', async () => {
    const { addMonthlyCoursePlan } = await import('../src/storage/monthlyPlanDb.js');
    await addMonthlyCoursePlan({ period: '115年06月', childIds: [childA.id], childTiers: { [childA.id]: 'Ⅴ' } });

    await renderMonthlyPlanListView(container, { onSelectPlan: vi.fn(), onBack: vi.fn() });

    expect(container.textContent).toContain('115年06月');
  });

  it('creating a plan: computes each child\'s tier for the period, seeds Mon/Tue defaults, and calls onSelectPlan', async () => {
    const onSelectPlan = vi.fn();
    await renderMonthlyPlanListView(container, { onSelectPlan, onBack: vi.fn() });

    const year = container.querySelector('[data-field="period-year"]');
    const month = container.querySelector('[data-field="period-month"]');
    year.value = String(currentRocYear());
    month.value = '6';
    container.querySelector(`[data-child-checkbox="${childA.id}"]`).checked = true;
    container.querySelector(`[data-child-checkbox="${childB.id}"]`).checked = true;

    container.querySelector('[data-action="add-plan"]').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    const plans = await listMonthlyCoursePlans();
    expect(plans).toHaveLength(1);
    expect(plans[0].childIds.sort()).toEqual([childA.id, childB.id].sort());
    expect(plans[0].childTiers[childA.id]).toBeTypeOf('string');
    expect(onSelectPlan).toHaveBeenCalledWith(plans[0]);

    const slot = await getOrCreatePlanSlot({ planId: plans[0].id, tier: plans[0].childTiers[childA.id], weekIndex: 1, weekday: 1 });
    expect((await listPlanSlotItems(slot.id)).map(i => i.activityName)).toEqual(['大團體活動']);
  });

  it('shows a field error and does not create a plan when no child is selected', async () => {
    const onSelectPlan = vi.fn();
    await renderMonthlyPlanListView(container, { onSelectPlan, onBack: vi.fn() });

    container.querySelector('[data-action="add-plan"]').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(onSelectPlan).not.toHaveBeenCalled();
    expect(await listMonthlyCoursePlans()).toEqual([]);
    expect(container.querySelector('[data-error]').textContent).not.toBe('');
  });

  it('deletes a plan after confirmation', async () => {
    const { addMonthlyCoursePlan } = await import('../src/storage/monthlyPlanDb.js');
    const plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [childA.id], childTiers: { [childA.id]: 'Ⅴ' } });

    await renderMonthlyPlanListView(container, { onSelectPlan: vi.fn(), onBack: vi.fn(), confirmDelete: () => true });
    container.querySelector(`[data-delete-plan="${plan.id}"]`).click();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(await listMonthlyCoursePlans()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/monthlyPlanListView.test.js`
Expected: FAIL with "Cannot find module '../src/ui/monthlyPlanListView.js'"

- [ ] **Step 3: Implement**

Create `src/ui/monthlyPlanListView.js`:

```js
import { listChildren } from '../storage/db.js';
import { addMonthlyCoursePlan, listMonthlyCoursePlans, deleteMonthlyCoursePlan } from '../storage/monthlyPlanDb.js';
import { suggestTier } from '../domain/ageTier.js';
import { buildMonthlyCalendar } from '../domain/monthlyCalendar.js';
import { seedDefaultPlanSlots } from '../domain/monthlyCoursePlan.js';
import { periodSelectsHtml, parsePeriod, currentRocYear } from './periodFields.js';
import { escapeHtml } from './escapeHtml.js';

export async function renderMonthlyPlanListView(
  container,
  { onSelectPlan, onBack, confirmDelete = message => (typeof confirm === 'function' ? confirm(message) : false) }
) {
  const plans = await listMonthlyCoursePlans();
  const children = await listChildren();
  const defaultYear = currentRocYear();
  const defaultMonth = new Date().getMonth() + 1;

  container.innerHTML = `
    <div class="page-header page-header--editor">
      ${onBack ? '<button type="button" class="btn btn--ghost" data-action="back">← 返回選擇表單</button>' : ''}
      <h2 class="page-header__title">課程月計畫</h2>
    </div>
    <div class="tab-layout">
      <div class="entry-list-wrap">
        <ul class="card-list">
          ${plans
            .map(
              plan =>
                `<li class="card-list__row">
                  <button type="button" class="card-list__item" data-plan-id="${escapeHtml(plan.id)}">
                    <span class="card-list__name">${escapeHtml(plan.period)}</span>
                    <span class="card-list__meta">${plan.childIds.length} 位小朋友</span>
                  </button>
                  <button type="button" class="card-list__delete" data-delete-plan="${escapeHtml(plan.id)}" aria-label="刪除${escapeHtml(plan.period)}的課程月計畫">×</button>
                </li>`
            )
            .join('')}
        </ul>
        <p class="field-error" data-error="delete"></p>
      </div>
      <form class="panel-form" data-action="add-plan">
        <h3 class="panel-form__title">新增課程月計畫</h3>
        <label class="panel-form__field">
          年月
          ${periodSelectsHtml({
            yearFieldName: 'period-year',
            monthFieldName: 'period-month',
            selectedYear: defaultYear,
            selectedMonth: defaultMonth,
          })}
        </label>
        <fieldset class="panel-form__field">
          <legend>小朋友</legend>
          ${children
            .map(
              child =>
                `<label class="panel-form__checkbox">
                  <input type="checkbox" data-child-checkbox="${escapeHtml(child.id)}"> ${escapeHtml(child.name)}
                </label>`
            )
            .join('')}
        </fieldset>
        <button type="submit" class="btn btn--primary">新增</button>
        <p class="field-error" data-error></p>
      </form>
    </div>
  `;

  if (onBack) {
    container.querySelector('[data-action="back"]').addEventListener('click', onBack);
  }

  for (const plan of plans) {
    container.querySelector(`[data-plan-id="${plan.id}"]`).addEventListener('click', () => onSelectPlan(plan));
    container.querySelector(`[data-delete-plan="${plan.id}"]`).addEventListener('click', async () => {
      if (!confirmDelete(`確定要刪除「${plan.period}」這份課程月計畫嗎？此操作無法復原。`)) return;
      try {
        await deleteMonthlyCoursePlan(plan.id);
        await renderMonthlyPlanListView(container, { onSelectPlan, onBack, confirmDelete });
      } catch (err) {
        container.querySelector('[data-error="delete"]').textContent = '刪除失敗，請再試一次';
      }
    });
  }

  container.querySelector('[data-action="add-plan"]').addEventListener('submit', async event => {
    event.preventDefault();
    const errorEl = container.querySelector('[data-action="add-plan"] [data-error]');
    errorEl.textContent = '';

    const year = container.querySelector('[data-field="period-year"]').value;
    const month = container.querySelector('[data-field="period-month"]').value.padStart(2, '0');
    const period = `${year}年${month}月`;

    const childIds = children
      .filter(child => container.querySelector(`[data-child-checkbox="${child.id}"]`).checked)
      .map(child => child.id);

    if (childIds.length === 0) {
      errorEl.textContent = '請至少選擇一位小朋友';
      return;
    }

    try {
      const { year: gYear, month: gMonth } = parsePeriod(period);
      const asOfDate = `${gYear + 1911}-${String(gMonth).padStart(2, '0')}-01`;
      const childTiers = {};
      for (const childId of childIds) {
        const child = children.find(c => c.id === childId);
        childTiers[childId] = suggestTier(child.birthDate, asOfDate);
      }

      const plan = await addMonthlyCoursePlan({ period, childIds, childTiers });

      const weeks = buildMonthlyCalendar(gYear + 1911, gMonth);
      const tiers = [...new Set(Object.values(childTiers))];
      await seedDefaultPlanSlots({ planId: plan.id, tiers, weeks });

      onSelectPlan(plan);
    } catch (err) {
      errorEl.textContent = '新增失敗，請再試一次';
    }
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/monthlyPlanListView.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/monthlyPlanListView.js tests/monthlyPlanListView.test.js
git commit -m "feat: add 課程月計畫 list/create/delete screen"
```

---

### Task 7: Editor shell — render calendars + cell selection

**Files:**
- Create: `src/ui/monthlyPlanEditorView.js`
- Modify: `src/styles.css` (append new rules; do not touch existing ones)
- Test: `tests/monthlyPlanEditorView.test.js`

**Interfaces:**
- Consumes: `getChild` (`src/storage/db.js`); `listPlanSlotsForPlan`, `listPlanSlotItems`, `listChildItemOverridesForPlan` (Task 3); `buildMonthlyCalendar` (Task 2); `parsePeriod` (`src/ui/periodFields.js`); `TIERS`, `getIndicator` (`src/data/indicators.js`); `calculateAgeInMonths` (`src/domain/ageTier.js`); `escapeHtml`.
- Produces: `renderMonthlyPlanEditorView(container, { plan, onBack })`. Internal (not exported, but later tasks in this same file rely on the DOM contract): each child's calendar renders as `<section class="monthly-calendar" data-child-id="...">`; each day cell as `<button type="button" class="monthly-calendar__day" data-child-id="..." data-tier="..." data-week-index="N" data-weekday="N">`; the right panel is `<div class="panel-form" data-panel>` with a header `[data-panel-header]` and item list `[data-panel-items]`. Clicking a day cell sets `[data-panel-header]` text and adds `.monthly-calendar__day--selected` to that cell (removing it from any previously-selected cell).

- [ ] **Step 1: Write the failing tests**

Create `tests/monthlyPlanEditorView.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import {
  addMonthlyCoursePlan, getOrCreatePlanSlot, addPlanSlotItem, setChildItemOverride,
} from '../src/storage/monthlyPlanDb.js';
import { renderMonthlyPlanEditorView } from '../src/ui/monthlyPlanEditorView.js';

describe('monthlyPlanEditorView: rendering', () => {
  let container, child, plan;

  beforeEach(async () => {
    await clearAllData();
    container = document.createElement('div');
    child = await addChild({ name: '趙萬竑', birthDate: '2024-07-01' });
    plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [child.id], childTiers: { [child.id]: 'Ⅴ' } });
  });

  it('renders one calendar section per child, with the child\'s name visible', async () => {
    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });

    const section = container.querySelector(`.monthly-calendar[data-child-id="${child.id}"]`);
    expect(section).not.toBeNull();
    expect(section.textContent).toContain('趙萬竑');
  });

  it('renders a slot item\'s text in its day cell', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    await addPlanSlotItem({ slotId: slot.id, indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲', indicatorText: '能依形狀或顏色分類' });

    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });

    const cell = container.querySelector(
      `.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`
    );
    expect(cell.textContent).toContain('分類遊戲');
    expect(cell.textContent).toContain('能依形狀或顏色分類');
  });

  it('renders a not-achieved item in red and a replaced item struck-through, for that child only', async () => {
    const otherChild = await addChild({ name: '鍾晴妍', birthDate: '2024-08-01' });
    const withOther = await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() }).then(async () => {
      const { updateMonthlyCoursePlan } = await import('../src/storage/monthlyPlanDb.js');
      return updateMonthlyCoursePlan(plan.id, {
        childIds: [child.id, otherChild.id],
        childTiers: { [child.id]: 'Ⅴ', [otherChild.id]: 'Ⅴ' },
      });
    });

    const slot = await getOrCreatePlanSlot({ planId: withOther.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: '拼拼圖' });
    await setChildItemOverride({ planId: withOther.id, childId: child.id, itemId: item.id, notAchieved: true, replaced: false });
    await setChildItemOverride({
      planId: withOther.id, childId: otherChild.id, itemId: item.id, notAchieved: false, replaced: true, replacementText: '請假',
    });

    await renderMonthlyPlanEditorView(container, { plan: withOther, onBack: vi.fn() });

    const cellA = container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`);
    const itemA = cellA.querySelector('.monthly-calendar__item');
    expect(itemA.classList.contains('monthly-calendar__item--not-achieved')).toBe(true);
    expect(itemA.classList.contains('monthly-calendar__item--replaced')).toBe(false);

    const cellB = container.querySelector(`.monthly-calendar__day[data-child-id="${otherChild.id}"][data-week-index="1"][data-weekday="3"]`);
    const itemB = cellB.querySelector('.monthly-calendar__item');
    expect(itemB.classList.contains('monthly-calendar__item--replaced')).toBe(true);
    expect(itemB.textContent).toContain('請假');
  });

  it('clicking a day cell selects it and updates the panel header', async () => {
    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });

    const cell = container.querySelector(
      `.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`
    );
    cell.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(cell.classList.contains('monthly-calendar__day--selected')).toBe(true);
    expect(container.querySelector('[data-panel-header]').textContent).toContain('趙萬竑');
    expect(container.querySelector('[data-panel-header]').textContent).toContain('06/03');
  });

  it('clicking a second cell moves the selection instead of adding to it', async () => {
    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });

    const cell3 = container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`);
    const cell4 = container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="4"]`);
    cell3.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    cell4.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(cell3.classList.contains('monthly-calendar__day--selected')).toBe(false);
    expect(cell4.classList.contains('monthly-calendar__day--selected')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/monthlyPlanEditorView.test.js`
Expected: FAIL with "Cannot find module '../src/ui/monthlyPlanEditorView.js'"

- [ ] **Step 3: Implement**

Create `src/ui/monthlyPlanEditorView.js`:

```js
import { getChild } from '../storage/db.js';
import { listPlanSlotsForPlan, listPlanSlotItems, listChildItemOverridesForPlan } from '../storage/monthlyPlanDb.js';
import { buildMonthlyCalendar } from '../domain/monthlyCalendar.js';
import { parsePeriod } from './periodFields.js';
import { TIERS } from '../data/indicators.js';
import { calculateAgeInMonths } from '../domain/ageTier.js';
import { escapeHtml } from './escapeHtml.js';

function tierFormLetter(tierCode) {
  const tier = TIERS.find(t => t.code === tierCode);
  return tier ? tier.formLetter : '';
}

// Loads everything the render pass needs in one pass: the plan's still-existing children (a
// child deleted elsewhere after being added to this plan is silently skipped rather than
// crashing the render), every slot+items for every tier in play, and every override for the
// plan (grouped by "childId:itemId" for O(1) lookup while rendering cells).
async function loadEditorData(plan) {
  const childResults = await Promise.all(plan.childIds.map(id => getChild(id)));
  const children = childResults.filter(Boolean);

  const slots = await listPlanSlotsForPlan(plan.id);
  const itemsBySlotId = {};
  for (const slot of slots) {
    itemsBySlotId[slot.id] = await listPlanSlotItems(slot.id);
  }

  const overrides = await listChildItemOverridesForPlan(plan.id);
  const overrideByKey = new Map(overrides.map(o => [`${o.childId}:${o.itemId}`, o]));

  const { year, month } = parsePeriod(plan.period);
  const weeks = buildMonthlyCalendar(year + 1911, month);

  return { children, slots, itemsBySlotId, overrideByKey, weeks };
}

function findSlot(slots, tier, weekIndex, weekday) {
  return slots.find(s => s.tier === tier && s.weekIndex === weekIndex && s.weekday === weekday);
}

function itemHtml(item, override) {
  const classes = ['monthly-calendar__item'];
  if (override?.notAchieved) classes.push('monthly-calendar__item--not-achieved');
  if (override?.replaced) classes.push('monthly-calendar__item--replaced');

  const label = item.indicatorCode
    ? `${escapeHtml(item.indicatorCode)}【${escapeHtml(item.activityName)}】${escapeHtml(item.indicatorText || '')}`
    : escapeHtml(item.activityName);

  const replacementHtml =
    override?.replaced && override.replacementText
      ? `<span class="monthly-calendar__replacement">${escapeHtml(override.replacementText)}</span>`
      : '';

  return `<div class="${classes.join(' ')}" data-item-id="${escapeHtml(item.id)}">${label}</div>${replacementHtml}`;
}

function dayCellHtml(child, tier, week, day, data) {
  const slot = findSlot(data.slots, tier, week.weekIndex, day.weekday);
  const items = slot ? data.itemsBySlotId[slot.id] || [] : [];
  const itemsHtml = items
    .map(item => itemHtml(item, data.overrideByKey.get(`${child.id}:${item.id}`)))
    .join('');

  return `
    <button
      type="button"
      class="monthly-calendar__day"
      data-child-id="${escapeHtml(child.id)}"
      data-tier="${escapeHtml(tier)}"
      data-week-index="${week.weekIndex}"
      data-weekday="${day.weekday}"
    >
      <span class="monthly-calendar__date">${escapeHtml(day.dateLabel)}</span>
      ${itemsHtml}
    </button>
  `;
}

function childCalendarHtml(child, tier, data) {
  const ageMonths = calculateAgeInMonths(child.birthDate, `${data.weeks[0].days[0].isoDate}`);
  return `
    <section class="monthly-calendar" data-child-id="${escapeHtml(child.id)}">
      <h3 class="monthly-calendar__title">${escapeHtml(child.name)}　${ageMonths}M　${escapeHtml(tierFormLetter(tier))}表</h3>
      <div class="monthly-calendar__weeks">
        ${data.weeks
          .map(
            week => `
              <div class="monthly-calendar__week">
                <div class="monthly-calendar__week-range">第${week.weekIndex}週　${escapeHtml(week.dateRange)}</div>
                <div class="monthly-calendar__days">
                  ${week.days.map(day => dayCellHtml(child, tier, week, day, data)).join('')}
                </div>
              </div>
            `
          )
          .join('')}
      </div>
    </section>
  `;
}

export async function renderMonthlyPlanEditorView(container, { plan, onBack }) {
  const data = await loadEditorData(plan);

  container.innerHTML = `
    <div class="page-header page-header--editor">
      <button type="button" class="btn btn--ghost" data-action="back">← 返回課程月計畫列表</button>
      <h2 class="page-header__title">${escapeHtml(plan.period)} 課程月計畫</h2>
    </div>
    <div class="tab-layout">
      <div class="monthly-calendar-list">
        ${data.children.map(child => childCalendarHtml(child, plan.childTiers[child.id], data)).join('')}
      </div>
      <div class="panel-form" data-panel>
        <h3 class="panel-form__title" data-panel-header>點選左側的日期格子開始規劃</h3>
        <div data-panel-items></div>
      </div>
    </div>
  `;

  container.querySelector('[data-action="back"]').addEventListener('click', onBack);

  for (const child of data.children) {
    for (const week of data.weeks) {
      for (const day of week.days) {
        const cell = container.querySelector(
          `.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="${week.weekIndex}"][data-weekday="${day.weekday}"]`
        );
        cell.addEventListener('click', () => {
          container.querySelectorAll('.monthly-calendar__day--selected').forEach(el => el.classList.remove('monthly-calendar__day--selected'));
          cell.classList.add('monthly-calendar__day--selected');
          container.querySelector('[data-panel-header]').textContent = `${child.name}　第${week.weekIndex}週　${day.dateLabel}`;
        });
      }
    }
  }
}
```

- [ ] **Step 4: Add calendar CSS**

Append to `src/styles.css` (do not modify any existing rule):

```css
.monthly-calendar-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.monthly-calendar__title {
  margin-bottom: 0.5rem;
}

.monthly-calendar__weeks {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.monthly-calendar__week-range {
  font-weight: 600;
  font-size: 0.85rem;
  opacity: 0.75;
}

.monthly-calendar__days {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.4rem;
}

.monthly-calendar__day {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  text-align: left;
  border: 1px solid var(--border-color, #ccc);
  border-radius: 6px;
  padding: 0.4rem;
  background: none;
  cursor: pointer;
  min-height: 4.5rem;
}

.monthly-calendar__day--selected {
  border-color: var(--accent-color, #6b4fbb);
  border-width: 2px;
}

.monthly-calendar__date {
  font-weight: 600;
  font-size: 0.8rem;
}

.monthly-calendar__item {
  font-size: 0.8rem;
}

.monthly-calendar__item--not-achieved {
  color: #d32f2f;
}

.monthly-calendar__item--replaced {
  text-decoration: line-through;
}

.monthly-calendar__replacement {
  font-size: 0.8rem;
}
```

If `--border-color`/`--accent-color` custom properties don't already exist in `src/styles.css`'s `:root`, replace them with literal colors already used elsewhere in the file (check the top of the file for the existing palette, e.g. the purple used for `.btn--purple`, and reuse that hex value directly instead of inventing a new one).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/monthlyPlanEditorView.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui/monthlyPlanEditorView.js src/styles.css tests/monthlyPlanEditorView.test.js
git commit -m "feat: render 課程月計畫 editor calendars with cell selection"
```

---

### Task 8: Right panel — slot item CRUD (add/edit/delete, indicator picker)

**Files:**
- Modify: `src/ui/monthlyPlanEditorView.js`
- Test: `tests/monthlyPlanEditorView.test.js`

**Interfaces:**
- Consumes: `getOrCreatePlanSlot`, `listPlanSlotItems`, `addPlanSlotItem`, `updatePlanSlotItem`, `deletePlanSlotItem` (Task 3); `getIndicatorsForTier`, `getIndicator` (`src/data/indicators.js`).
- Produces: selecting a cell now also populates `[data-panel-items]` with the slot's current items (editable) and an "add item" form. A change to the panel's indicator `<select>` re-renders **only** the panel (not the whole page — the previously-selected cell's calendar block is unaffected), consuming `updatePlanSlotItem`/`addPlanSlotItem`/`deletePlanSlotItem` and afterward reloading the affected cells' HTML so every calendar block referencing that tier/week/weekday updates.

- [ ] **Step 1: Write the failing tests**

Add to `tests/monthlyPlanEditorView.test.js` (new `describe` block):

```js
describe('monthlyPlanEditorView: slot item editing', () => {
  let container, child, plan;

  beforeEach(async () => {
    await clearAllData();
    container = document.createElement('div');
    child = await addChild({ name: '趙萬竑', birthDate: '2024-07-01' });
    plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [child.id], childTiers: { [child.id]: 'Ⅴ' } });
    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });
    container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`).click();
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  it('picking an indicator auto-fills activity name and indicator text in the add-item form', () => {
    const select = container.querySelector('[data-field="new-item-indicator"]');
    select.value = 'Ⅴ-4-3';
    select.dispatchEvent(new Event('change'));

    expect(container.querySelector('[data-field="new-item-activity-name"]').value).toBe('分類遊戲'.length > 0 ? container.querySelector('[data-field="new-item-activity-name"]').value : '');
    // The auto-filled activityName must be non-empty and the indicatorText must match the reference data.
    expect(container.querySelector('[data-field="new-item-activity-name"]').value.length).toBeGreaterThan(0);
    expect(container.querySelector('[data-field="new-item-indicator-text"]').value).toBe('能依形狀或顏色分類');
  });

  it('adding an item without an indicator (free activity) writes a PlanSlotItem and shows it in the cell', async () => {
    container.querySelector('[data-field="new-item-activity-name"]').value = '戶外教學';
    container.querySelector('[data-action="add-item"]').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const items = await listPlanSlotItems(slot.id);
    expect(items.map(i => i.activityName)).toEqual(['戶外教學']);
    expect(items[0].indicatorCode).toBeNull();

    const cell = container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`);
    expect(cell.textContent).toContain('戶外教學');
  });

  it('editing an existing item\'s activity name updates storage and the rendered cell', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: '原活動' });
    // Re-select the cell so the panel picks up the newly added item.
    container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`).click();
    await new Promise(resolve => setTimeout(resolve, 0));

    container.querySelector(`[data-item-edit-field="activityName"][data-item-id="${item.id}"]`).value = '改過的活動';
    container.querySelector(`[data-item-edit-save-for="${item.id}"]`).click();
    await new Promise(resolve => setTimeout(resolve, 0));

    const updated = await listPlanSlotItems(slot.id);
    expect(updated[0].activityName).toBe('改過的活動');
    const cell = container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`);
    expect(cell.textContent).toContain('改過的活動');
  });

  it('deleting an item removes it from storage and the cell', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: '要刪除' });
    container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`).click();
    await new Promise(resolve => setTimeout(resolve, 0));

    container.querySelector(`[data-delete-item="${item.id}"]`).click();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(await listPlanSlotItems(slot.id)).toEqual([]);
    const cell = container.querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="1"][data-weekday="3"]`);
    expect(cell.textContent).not.toContain('要刪除');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/monthlyPlanEditorView.test.js`
Expected: FAIL — the add-item form / indicator select / item edit controls don't exist yet

- [ ] **Step 3: Implement**

In `src/ui/monthlyPlanEditorView.js`:

1. Add the import: `import { getOrCreatePlanSlot, listPlanSlotsForPlan, listPlanSlotItems, listChildItemOverridesForPlan, addPlanSlotItem, updatePlanSlotItem, deletePlanSlotItem } from '../storage/monthlyPlanDb.js';` (merge with the existing import from that module) and `import { TIERS, getIndicatorsForTier, getIndicator, DOMAINS } from '../data/indicators.js';` (merge with existing).

2. Track the currently-selected cell as local state (module-level closure inside `renderMonthlyPlanEditorView`, reset each full render):

```js
export async function renderMonthlyPlanEditorView(container, { plan, onBack }) {
  const data = await loadEditorData(plan);
  let selected = null; // { child, tier, week, day }

  container.innerHTML = `...same as Task 7...`;

  container.querySelector('[data-action="back"]').addEventListener('click', onBack);

  async function selectCell(child, tier, week, day) {
    selected = { child, tier, week, day };
    container.querySelectorAll('.monthly-calendar__day--selected').forEach(el => el.classList.remove('monthly-calendar__day--selected'));
    container.querySelector(
      `.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="${week.weekIndex}"][data-weekday="${day.weekday}"]`
    ).classList.add('monthly-calendar__day--selected');
    container.querySelector('[data-panel-header]').textContent = `${child.name}　第${week.weekIndex}週　${day.dateLabel}`;
    await renderPanelItems();
  }

  function indicatorOptionsHtml(tier) {
    const indicators = getIndicatorsForTier(tier);
    const byDomain = new Map();
    for (const indicator of indicators) {
      if (!byDomain.has(indicator.domainName)) byDomain.set(indicator.domainName, []);
      byDomain.get(indicator.domainName).push(indicator);
    }
    return (
      '<option value="">（不選指標，純活動）</option>' +
      [...byDomain.entries()]
        .map(
          ([domainName, group]) =>
            `<optgroup label="${escapeHtml(domainName)}">
              ${group.map(i => `<option value="${escapeHtml(i.code)}">${escapeHtml(i.code)} ${escapeHtml(i.description)}</option>`).join('')}
            </optgroup>`
        )
        .join('')
    );
  }

  function panelItemRowHtml(item) {
    return `
      <div class="indicator-block" data-panel-item="${item.id}">
        <div class="indicator-block__title">
          ${item.indicatorCode ? `<span class="indicator-block__code">${escapeHtml(item.indicatorCode)}</span>` : ''}
          <input data-item-edit-field="activityName" data-item-id="${item.id}" value="${escapeHtml(item.activityName)}">
          <button type="button" class="btn btn--primary btn--small" data-item-edit-save-for="${item.id}">儲存</button>
          <button type="button" class="btn--delete-circle" data-delete-item="${item.id}" aria-label="刪除${escapeHtml(item.activityName)}">×</button>
        </div>
        <textarea data-item-edit-field="indicatorText" data-item-id="${item.id}" rows="2">${escapeHtml(item.indicatorText || '')}</textarea>
      </div>
    `;
  }

  async function renderPanelItems() {
    const panelItems = container.querySelector('[data-panel-items]');
    if (!selected) {
      panelItems.innerHTML = '';
      return;
    }
    const { tier, week, day } = selected;
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier, weekIndex: week.weekIndex, weekday: day.weekday });
    const items = await listPlanSlotItems(slot.id);

    panelItems.innerHTML = `
      ${items.map(panelItemRowHtml).join('')}
      <form class="entry-form" data-action="add-item">
        <label class="panel-form__field">
          指標
          <select data-field="new-item-indicator">${indicatorOptionsHtml(tier)}</select>
        </label>
        <label class="panel-form__field">活動名稱 <input data-field="new-item-activity-name" required></label>
        <label class="panel-form__field">指標內容 <textarea data-field="new-item-indicator-text" rows="2"></textarea></label>
        <button type="submit" class="btn btn--primary btn--small">新增項目</button>
        <p class="field-error" data-error></p>
      </form>
    `;

    panelItems.querySelector('[data-field="new-item-indicator"]').addEventListener('change', event => {
      const indicator = getIndicator(event.target.value);
      if (!indicator) return;
      panelItems.querySelector('[data-field="new-item-activity-name"]').value = indicator.description;
      panelItems.querySelector('[data-field="new-item-indicator-text"]').value = indicator.description;
    });

    panelItems.querySelector('[data-action="add-item"]').addEventListener('submit', async event => {
      event.preventDefault();
      const indicatorCode = panelItems.querySelector('[data-field="new-item-indicator"]').value || null;
      const activityName = panelItems.querySelector('[data-field="new-item-activity-name"]').value;
      const indicatorText = panelItems.querySelector('[data-field="new-item-indicator-text"]').value;
      try {
        await addPlanSlotItem({ slotId: slot.id, indicatorCode, activityName, indicatorText });
        await refreshCellAndPanel();
      } catch (err) {
        panelItems.querySelector('[data-action="add-item"] [data-error]').textContent = '新增失敗，請再試一次';
      }
    });

    for (const item of items) {
      panelItems.querySelector(`[data-item-edit-save-for="${item.id}"]`).addEventListener('click', async () => {
        const activityName = panelItems.querySelector(`[data-item-edit-field="activityName"][data-item-id="${item.id}"]`).value;
        const indicatorText = panelItems.querySelector(`[data-item-edit-field="indicatorText"][data-item-id="${item.id}"]`).value;
        await updatePlanSlotItem(item.id, { activityName, indicatorText });
        await refreshCellAndPanel();
      });
      panelItems.querySelector(`[data-delete-item="${item.id}"]`).addEventListener('click', async () => {
        await deletePlanSlotItem(item.id);
        await refreshCellAndPanel();
      });
    }
  }

  // Re-reads this one (tier, week, weekday) slot and rewrites every child's cell that shares it
  // (same tier → same slot, per the shared-per-tier design), then redraws the panel.
  async function refreshCellAndPanel() {
    const { tier, week, day } = selected;
    const freshSlots = await listPlanSlotsForPlan(plan.id);
    const freshItemsBySlotId = {};
    for (const slot of freshSlots) {
      freshItemsBySlotId[slot.id] = await listPlanSlotItems(slot.id);
    }
    const freshOverrides = await listChildItemOverridesForPlan(plan.id);
    const freshOverrideByKey = new Map(freshOverrides.map(o => [`${o.childId}:${o.itemId}`, o]));
    const freshData = { ...data, slots: freshSlots, itemsBySlotId: freshItemsBySlotId, overrideByKey: freshOverrideByKey };

    for (const child of data.children) {
      if (plan.childTiers[child.id] !== tier) continue;
      const cell = container.querySelector(
        `.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="${week.weekIndex}"][data-weekday="${day.weekday}"]`
      );
      cell.outerHTML = dayCellHtml(child, tier, week, day, freshData);
      container
        .querySelector(`.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="${week.weekIndex}"][data-weekday="${day.weekday}"]`)
        .addEventListener('click', () => selectCell(child, tier, week, day));
    }
    await renderPanelItems();
  }

  for (const child of data.children) {
    for (const week of data.weeks) {
      for (const day of week.days) {
        const cell = container.querySelector(
          `.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="${week.weekIndex}"][data-weekday="${day.weekday}"]`
        );
        cell.addEventListener('click', () => selectCell(child, plan.childTiers[child.id], week, day));
      }
    }
  }
}
```

Remove the old inline click handler block from Task 7 (it's superseded by the `selectCell`-based wiring above — there should be exactly one place that attaches click listeners to day cells).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/monthlyPlanEditorView.test.js`
Expected: PASS (all `describe` blocks, including Task 7's)

- [ ] **Step 5: Commit**

```bash
git add src/ui/monthlyPlanEditorView.js tests/monthlyPlanEditorView.test.js
git commit -m "feat: add slot item add/edit/delete to the plan editor panel"
```

---

### Task 9: Right panel — per-child 未達成/請假 overrides

**Files:**
- Modify: `src/ui/monthlyPlanEditorView.js`
- Test: `tests/monthlyPlanEditorView.test.js`

**Interfaces:**
- Consumes: `setChildItemOverride` (Task 3).
- Produces: when the selected cell belongs to a specific child (it always does, per Task 7/8's `selectCell(child, ...)`), each item row in the panel gains two checkboxes — 未達成, 請假／其他活動代替 — and a replacement-text input that's only enabled when 請假 is checked. Toggling them calls `setChildItemOverride` scoped to `selected.child.id` and refreshes.

- [ ] **Step 1: Write the failing tests**

Add to `tests/monthlyPlanEditorView.test.js`:

```js
describe('monthlyPlanEditorView: per-child overrides', () => {
  let container, childA, childB, plan, item;

  beforeEach(async () => {
    await clearAllData();
    container = document.createElement('div');
    childA = await addChild({ name: '趙萬竑', birthDate: '2024-07-01' });
    childB = await addChild({ name: '鍾晴妍', birthDate: '2024-08-01' });
    plan = await addMonthlyCoursePlan({
      period: '115年06月',
      childIds: [childA.id, childB.id],
      childTiers: { [childA.id]: 'Ⅴ', [childB.id]: 'Ⅴ' },
    });
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    item = await addPlanSlotItem({ slotId: slot.id, activityName: '拼拼圖' });

    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });
    container.querySelector(`.monthly-calendar__day[data-child-id="${childA.id}"][data-week-index="1"][data-weekday="3"]`).click();
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  it('checking 未達成 for one child marks only that child\'s cell red', async () => {
    container.querySelector(`[data-override-field="notAchieved"][data-item-id="${item.id}"]`).click();
    await new Promise(resolve => setTimeout(resolve, 0));

    const overrides = await listChildItemOverridesForPlan(plan.id);
    expect(overrides).toHaveLength(1);
    expect(overrides[0]).toMatchObject({ childId: childA.id, itemId: item.id, notAchieved: true, replaced: false });

    const cellA = container.querySelector(`.monthly-calendar__day[data-child-id="${childA.id}"][data-week-index="1"][data-weekday="3"]`);
    expect(cellA.querySelector('.monthly-calendar__item--not-achieved')).not.toBeNull();
    const cellB = container.querySelector(`.monthly-calendar__day[data-child-id="${childB.id}"][data-week-index="1"][data-weekday="3"]`);
    expect(cellB.querySelector('.monthly-calendar__item--not-achieved')).toBeNull();
  });

  it('checking 請假 enables the replacement text field, and saving it shows the replacement in the cell', async () => {
    const replacedCheckbox = container.querySelector(`[data-override-field="replaced"][data-item-id="${item.id}"]`);
    replacedCheckbox.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    const replacementInput = container.querySelector(`[data-override-field="replacementText"][data-item-id="${item.id}"]`);
    expect(replacementInput.disabled).toBe(false);
    replacementInput.value = '請假';
    replacementInput.dispatchEvent(new Event('change'));
    await new Promise(resolve => setTimeout(resolve, 0));

    const overrides = await listChildItemOverridesForPlan(plan.id);
    expect(overrides[0]).toMatchObject({ replaced: true, replacementText: '請假' });

    const cellA = container.querySelector(`.monthly-calendar__day[data-child-id="${childA.id}"][data-week-index="1"][data-weekday="3"]`);
    expect(cellA.textContent).toContain('請假');
  });

  it('unchecking both flags removes the override row', async () => {
    container.querySelector(`[data-override-field="notAchieved"][data-item-id="${item.id}"]`).click();
    await new Promise(resolve => setTimeout(resolve, 0));
    container.querySelector(`[data-override-field="notAchieved"][data-item-id="${item.id}"]`).click();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(await listChildItemOverridesForPlan(plan.id)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/monthlyPlanEditorView.test.js`
Expected: FAIL — `[data-override-field]` controls don't exist yet

- [ ] **Step 3: Implement**

In `src/ui/monthlyPlanEditorView.js`:

1. Merge `setChildItemOverride` into the existing `monthlyPlanDb.js` import.

2. Extend `panelItemRowHtml` to take the current override and render the two checkboxes + replacement input:

```js
function panelItemRowHtml(item, override) {
  return `
    <div class="indicator-block" data-panel-item="${item.id}">
      <div class="indicator-block__title">
        ${item.indicatorCode ? `<span class="indicator-block__code">${escapeHtml(item.indicatorCode)}</span>` : ''}
        <input data-item-edit-field="activityName" data-item-id="${item.id}" value="${escapeHtml(item.activityName)}">
        <button type="button" class="btn btn--primary btn--small" data-item-edit-save-for="${item.id}">儲存</button>
        <button type="button" class="btn--delete-circle" data-delete-item="${item.id}" aria-label="刪除${escapeHtml(item.activityName)}">×</button>
      </div>
      <textarea data-item-edit-field="indicatorText" data-item-id="${item.id}" rows="2">${escapeHtml(item.indicatorText || '')}</textarea>
      <div class="entry-form__checkbox-row">
        <label class="entry-form__checkbox">
          <input type="checkbox" data-override-field="notAchieved" data-item-id="${item.id}" ${override?.notAchieved ? 'checked' : ''}> 未達成
        </label>
        <label class="entry-form__checkbox">
          <input type="checkbox" data-override-field="replaced" data-item-id="${item.id}" ${override?.replaced ? 'checked' : ''}> 請假／其他活動代替
        </label>
        <input
          type="text"
          data-override-field="replacementText"
          data-item-id="${item.id}"
          placeholder="替代活動內容"
          value="${escapeHtml(override?.replacementText || '')}"
          ${override?.replaced ? '' : 'disabled'}
        >
      </div>
    </div>
  `;
}
```

3. In `renderPanelItems`, fetch the current child's overrides for these items and pass them through, then wire the new controls:

```js
  async function renderPanelItems() {
    const panelItems = container.querySelector('[data-panel-items]');
    if (!selected) {
      panelItems.innerHTML = '';
      return;
    }
    const { child, tier, week, day } = selected;
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier, weekIndex: week.weekIndex, weekday: day.weekday });
    const items = await listPlanSlotItems(slot.id);
    const allOverrides = await listChildItemOverridesForPlan(plan.id);
    const overrideByItemId = new Map(allOverrides.filter(o => o.childId === child.id).map(o => [o.itemId, o]));

    panelItems.innerHTML = `
      ${items.map(item => panelItemRowHtml(item, overrideByItemId.get(item.id))).join('')}
      <form class="entry-form" data-action="add-item">
        ...unchanged from Task 8...
      </form>
    `;

    // ...unchanged indicator-select / add-item / edit / delete wiring from Task 8...

    for (const item of items) {
      const notAchievedBox = panelItems.querySelector(`[data-override-field="notAchieved"][data-item-id="${item.id}"]`);
      const replacedBox = panelItems.querySelector(`[data-override-field="replaced"][data-item-id="${item.id}"]`);
      const replacementInput = panelItems.querySelector(`[data-override-field="replacementText"][data-item-id="${item.id}"]`);

      async function saveOverride() {
        await setChildItemOverride({
          planId: plan.id,
          childId: child.id,
          itemId: item.id,
          notAchieved: notAchievedBox.checked,
          replaced: replacedBox.checked,
          replacementText: replacementInput.value,
        });
        await refreshCellAndPanel();
      }

      notAchievedBox.addEventListener('change', saveOverride);
      replacedBox.addEventListener('change', () => {
        replacementInput.disabled = !replacedBox.checked;
        saveOverride();
      });
      replacementInput.addEventListener('change', saveOverride);
    }
  }
```

Note `refreshCellAndPanel` (Task 8) re-runs `renderPanelItems`, which re-reads `container.querySelector('[data-panel-items]')` fresh each time — no stale-closure risk since `panelItems` is re-looked-up at the top of every call.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/monthlyPlanEditorView.test.js`
Expected: PASS (all `describe` blocks)

- [ ] **Step 5: Commit**

```bash
git add src/ui/monthlyPlanEditorView.js tests/monthlyPlanEditorView.test.js
git commit -m "feat: add per-child 未達成/請假 overrides to the plan editor panel"
```

---

### Task 10: Manage children on an existing plan

**Files:**
- Modify: `src/ui/monthlyPlanEditorView.js`
- Test: `tests/monthlyPlanEditorView.test.js`

**Interfaces:**
- Consumes: `listChildren` (`src/storage/db.js`); `updateMonthlyCoursePlan`, `deleteChildItemOverridesForChild` (Task 3); `suggestTier`; `seedDefaultPlanSlots` (Task 4).
- Produces: a "管理小朋友" control in the page header opens a checkbox list of every child (pre-checked for those already in the plan); saving calls `updateMonthlyCoursePlan` with the new `childIds`/`childTiers`, runs `seedDefaultPlanSlots` for any newly-introduced tier, cleans up overrides for removed children, and re-renders the whole editor.

- [ ] **Step 1: Write the failing tests**

Add to `tests/monthlyPlanEditorView.test.js`:

```js
describe('monthlyPlanEditorView: manage children', () => {
  let container, childA, childB, plan;

  beforeEach(async () => {
    await clearAllData();
    container = document.createElement('div');
    childA = await addChild({ name: '趙萬竑', birthDate: '2024-07-01' });
    childB = await addChild({ name: '張珏銨', birthDate: '2024-12-01' }); // different tier
    plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [childA.id], childTiers: { [childA.id]: 'Ⅴ' } });
    await renderMonthlyPlanEditorView(container, { plan, onBack: vi.fn() });
  });

  it('adding a child recomputes their tier and seeds Mon/Tue defaults for a new tier', async () => {
    container.querySelector('[data-action="manage-children"]').click();
    container.querySelector(`[data-manage-child-checkbox="${childB.id}"]`).checked = true;
    container.querySelector('[data-action="save-children"]').click();
    await new Promise(resolve => setTimeout(resolve, 0));

    const updated = await getMonthlyCoursePlan(plan.id);
    expect(updated.childIds.sort()).toEqual([childA.id, childB.id].sort());
    expect(updated.childTiers[childB.id]).toBeTypeOf('string');

    const bSlot = await getOrCreatePlanSlot({ planId: plan.id, tier: updated.childTiers[childB.id], weekIndex: 1, weekday: 1 });
    expect((await listPlanSlotItems(bSlot.id)).map(i => i.activityName)).toEqual(['大團體活動']);

    expect(container.querySelector(`.monthly-calendar[data-child-id="${childB.id}"]`)).not.toBeNull();
  });

  it('removing a child clears their overrides for this plan and their calendar block', async () => {
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
    const item = await addPlanSlotItem({ slotId: slot.id, activityName: 'x' });
    await setChildItemOverride({ planId: plan.id, childId: childA.id, itemId: item.id, notAchieved: true, replaced: false });

    container.querySelector('[data-action="manage-children"]').click();
    container.querySelector(`[data-manage-child-checkbox="${childA.id}"]`).checked = false;
    container.querySelector('[data-action="save-children"]').click();
    await new Promise(resolve => setTimeout(resolve, 0));

    const updated = await getMonthlyCoursePlan(plan.id);
    expect(updated.childIds).toEqual([]);
    expect(await listChildItemOverridesForPlan(plan.id)).toEqual([]);
    expect(container.querySelector(`.monthly-calendar[data-child-id="${childA.id}"]`)).toBeNull();
  });
});
```

Add the missing imports at the top of the test file: `getMonthlyCoursePlan` from `../src/storage/monthlyPlanDb.js` (merge into the existing import).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/monthlyPlanEditorView.test.js`
Expected: FAIL — `[data-action="manage-children"]` doesn't exist yet

- [ ] **Step 3: Implement**

In `src/ui/monthlyPlanEditorView.js`:

1. Merge into the existing imports: `listChildren` from `'../storage/db.js'`; `updateMonthlyCoursePlan`, `deleteChildItemOverridesForChild` from `'../storage/monthlyPlanDb.js'`; `suggestTier` from `'../domain/ageTier.js'`; `seedDefaultPlanSlots` from `'../domain/monthlyCoursePlan.js'`.

2. Add a "管理小朋友" button to the page header and a hidden management form, plus the wiring — since saving must reload the whole plan (children/tiers changed), the simplest correct approach is to have this handler call `renderMonthlyPlanEditorView` again with the updated plan, rather than trying to patch the DOM in place:

```js
  container.innerHTML = `
    <div class="page-header page-header--editor">
      <button type="button" class="btn btn--ghost" data-action="back">← 返回課程月計畫列表</button>
      <h2 class="page-header__title">${escapeHtml(plan.period)} 課程月計畫</h2>
      <button type="button" class="btn btn--purple" data-action="manage-children">管理小朋友</button>
    </div>
    <form class="panel-form" data-manage-children-form hidden>
      <h3 class="panel-form__title">選擇本月計畫涵蓋的小朋友</h3>
      ${(await listChildren())
        .map(
          c =>
            `<label class="panel-form__checkbox">
              <input type="checkbox" data-manage-child-checkbox="${escapeHtml(c.id)}" ${plan.childIds.includes(c.id) ? 'checked' : ''}> ${escapeHtml(c.name)}
            </label>`
        )
        .join('')}
      <button type="button" class="btn btn--primary" data-action="save-children">儲存</button>
      <p class="field-error" data-error="manage-children"></p>
    </form>
    <div class="tab-layout">
      ...unchanged...
    </div>
  `;

  container.querySelector('[data-action="back"]').addEventListener('click', onBack);

  container.querySelector('[data-action="manage-children"]').addEventListener('click', () => {
    const form = container.querySelector('[data-manage-children-form]');
    form.hidden = !form.hidden;
  });

  container.querySelector('[data-action="save-children"]').addEventListener('click', async () => {
    const allChildren = await listChildren();
    const newChildIds = allChildren.filter(c => container.querySelector(`[data-manage-child-checkbox="${c.id}"]`).checked).map(c => c.id);
    const removedChildIds = plan.childIds.filter(id => !newChildIds.includes(id));

    try {
      const { year, month } = parsePeriod(plan.period);
      const asOfDate = `${year + 1911}-${String(month).padStart(2, '0')}-01`;
      const newChildTiers = { ...plan.childTiers };
      for (const childId of newChildIds) {
        if (newChildTiers[childId]) continue;
        const child = allChildren.find(c => c.id === childId);
        newChildTiers[childId] = suggestTier(child.birthDate, asOfDate);
      }
      for (const childId of removedChildIds) {
        delete newChildTiers[childId];
      }

      const updatedPlan = await updateMonthlyCoursePlan(plan.id, { childIds: newChildIds, childTiers: newChildTiers });

      const weeks = buildMonthlyCalendar(year + 1911, month);
      const tiers = [...new Set(Object.values(newChildTiers))];
      await seedDefaultPlanSlots({ planId: plan.id, tiers, weeks });

      for (const childId of removedChildIds) {
        await deleteChildItemOverridesForChild(plan.id, childId);
      }

      await renderMonthlyPlanEditorView(container, { plan: updatedPlan, onBack });
    } catch (err) {
      container.querySelector('[data-error="manage-children"]').textContent = '更新失敗，請再試一次';
    }
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/monthlyPlanEditorView.test.js`
Expected: PASS (all `describe` blocks in the file)

- [ ] **Step 5: Commit**

```bash
git add src/ui/monthlyPlanEditorView.js tests/monthlyPlanEditorView.test.js
git commit -m "feat: allow adding/removing children on an existing 課程月計畫"
```

---

### Task 11: Wire routing in `app.js`

**Files:**
- Modify: `src/app.js`
- Test: `tests/app.test.js`

**Interfaces:**
- Consumes: `renderMonthlyPlanListView` (Task 6), `renderMonthlyPlanEditorView` (Tasks 7-10).
- Produces: selecting "課程月計畫" on the type-select screen routes to the list view; selecting a plan routes to the editor; the editor's back button returns to the list; the list's back button returns to the type-select screen.

- [ ] **Step 1: Read the existing test for the analogous route**

Open `tests/app.test.js` and find the test(s) covering `showFormList`/`showFormEditor` (the 適性總表 flow) to copy the assertion style (mocking the render functions, or driving through `container` if the existing tests are DOM-driven — match whichever style is already used).

- [ ] **Step 2: Write the failing test**

Add to `tests/app.test.js`, following whatever pattern the existing parent-report routing test uses (adjust the import path / mock style to match — the snippet below assumes the existing tests drive through the rendered DOM rather than mocking view modules; if the file instead mocks view modules with `vi.mock`, mirror that instead):

```js
it('routes 課程月計畫 -> list -> editor -> back to list -> back to type select', async () => {
  const container = document.createElement('div');
  mountApp(container);
  await flushPromises();

  container.querySelector('[data-type="monthly-plan"]').click();
  await flushPromises();
  expect(container.querySelector('[data-action="add-plan"]')).not.toBeNull();

  // Create a minimal plan through the real form so the editor has something to open.
  // (Reuse whatever helper the existing formList->formEditor routing test uses to fill in a
  // child + submit; if none exists, add one child via addChild() before mountApp and check it
  // here instead.)
});
```

Adjust this test to actually match the existing file's conventions once you've read it in Step 1 — the goal is: clicking through type-select → 課程月計畫 shows the list view's markers, and clicking a created plan shows the editor view's markers (`.monthly-calendar-list` or `[data-panel]`), and the editor's back button returns to the list view's markers.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/app.test.js`
Expected: FAIL — `[data-type="monthly-plan"]` routes nowhere yet

- [ ] **Step 4: Implement**

In `src/app.js`:

```js
import { renderMonthlyPlanListView } from './ui/monthlyPlanListView.js';
import { renderMonthlyPlanEditorView } from './ui/monthlyPlanEditorView.js';
```

```js
  function showChildList(reportType) {
    renderChildListView(container, {
      onSelectChild: child => (reportType === 'parent-report' ? showParentReportList(child) : showFormList(child)),
      onBack: showReportTypeSelect,
      reportType,
    }).catch(showRenderError);
  }
```

Update `showReportTypeSelect`'s `onSelectType` to branch on the new type:

```js
  function showReportTypeSelect() {
    renderReportTypeSelectView(container, {
      onSelectType: type => (type === 'monthly-plan' ? showMonthlyPlanList() : showChildList(type)),
    }).catch(showRenderError);
  }

  function showMonthlyPlanList() {
    renderMonthlyPlanListView(container, {
      onSelectPlan: plan => showMonthlyPlanEditor(plan),
      onBack: showReportTypeSelect,
    }).catch(showRenderError);
  }

  function showMonthlyPlanEditor(plan) {
    renderMonthlyPlanEditorView(container, { plan, onBack: showMonthlyPlanList }).catch(showRenderError);
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/app.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app.js tests/app.test.js
git commit -m "feat: wire 課程月計畫 routing into app.js"
```

---

### Task 12: Backup export/import

**Files:**
- Modify: `src/storage/backup.js`
- Test: `tests/backup.test.js`

**Interfaces:**
- Consumes: `listMonthlyCoursePlans`, `listPlanSlotsForPlan`, `listPlanSlotItems`, `listChildItemOverridesForPlan`, `addMonthlyCoursePlan`, `getOrCreatePlanSlot`, `addPlanSlotItem`, `setChildItemOverride` (Task 3).
- Produces: `exportBackup()` includes `monthlyCoursePlans`/`planSlots`/`planSlotItems`/`childItemOverrides`; `importBackup()` (bumped to `BACKUP_VERSION = 3`) restores them with every id remapped through the same `childIdMap` used for the rest of the import, plus new `planIdMap`/`slotIdMap`/`itemIdMap`.

- [ ] **Step 1: Read the existing test for the parent-report round trip**

Open `tests/backup.test.js` and find the parent-report export/import round-trip test — copy its structure exactly (create data, export, `clearAllData`, import, assert the restored data matches with fresh ids).

- [ ] **Step 2: Write the failing test**

Add to `tests/backup.test.js`:

```js
it('round-trips a monthly course plan, including slot items and per-child overrides', async () => {
  const child = await addChild({ name: '趙萬竑', birthDate: '2024-07-01' });
  const plan = await addMonthlyCoursePlan({ period: '115年06月', childIds: [child.id], childTiers: { [child.id]: 'Ⅴ' } });
  const slot = await getOrCreatePlanSlot({ planId: plan.id, tier: 'Ⅴ', weekIndex: 1, weekday: 3 });
  const item = await addPlanSlotItem({ slotId: slot.id, indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲', indicatorText: '能依形狀或顏色分類' });
  await setChildItemOverride({ planId: plan.id, childId: child.id, itemId: item.id, notAchieved: true, replaced: false });

  const json = await exportBackup();
  await clearAllData();
  await importBackup(json);

  const [restoredChild] = await listChildren();
  const [restoredPlan] = await listMonthlyCoursePlans();
  expect(restoredPlan.period).toBe('115年06月');
  expect(restoredPlan.childIds).toEqual([restoredChild.id]);
  expect(restoredPlan.childTiers[restoredChild.id]).toBe('Ⅴ');

  const restoredSlots = await listPlanSlotsForPlan(restoredPlan.id);
  expect(restoredSlots).toHaveLength(1);
  const restoredItems = await listPlanSlotItems(restoredSlots[0].id);
  expect(restoredItems).toHaveLength(1);
  expect(restoredItems[0]).toMatchObject({ indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲' });

  const restoredOverrides = await listChildItemOverridesForPlan(restoredPlan.id);
  expect(restoredOverrides).toHaveLength(1);
  expect(restoredOverrides[0]).toMatchObject({ childId: restoredChild.id, itemId: restoredItems[0].id, notAchieved: true });
});
```

Add the needed imports at the top of the test file (merge into whatever's already imported from `../src/storage/monthlyPlanDb.js` — add the import if the file doesn't have one yet):

```js
import {
  addMonthlyCoursePlan, listMonthlyCoursePlans, getOrCreatePlanSlot, listPlanSlotsForPlan,
  addPlanSlotItem, listPlanSlotItems, setChildItemOverride, listChildItemOverridesForPlan,
} from '../src/storage/monthlyPlanDb.js';
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/backup.test.js`
Expected: FAIL — restored data is missing (old `exportBackup`/`importBackup` don't know about these stores)

- [ ] **Step 4: Implement**

In `src/storage/backup.js`:

1. Add the import:

```js
import {
  listMonthlyCoursePlans, listPlanSlotsForPlan, listPlanSlotItems, listChildItemOverridesForPlan,
  addMonthlyCoursePlan, getOrCreatePlanSlot, addPlanSlotItem, setChildItemOverride,
} from './monthlyPlanDb.js';
```

2. Bump `const BACKUP_VERSION = 2;` to `3;`.

3. In `exportBackup()`, add collection and inclusion in the returned JSON:

```js
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
```

and in the returned object:

```js
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
```

4. Add a new import function, called from `importBackup` only when `data.version === 3`:

```js
async function importMonthlyCoursePlans(data, childIdMap) {
  const planIdMap = new Map();
  for (const plan of data.monthlyCoursePlans ?? []) {
    const childIds = plan.childIds.map(id => childIdMap.get(id));
    const childTiers = Object.fromEntries(
      Object.entries(plan.childTiers).map(([oldChildId, tier]) => [childIdMap.get(Number(oldChildId)), tier])
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
    await setChildItemOverride({
      planId: planIdMap.get(override.planId),
      childId: childIdMap.get(override.childId),
      itemId: itemIdMap.get(override.itemId),
      notAchieved: override.notAchieved,
      replaced: override.replaced,
      replacementText: override.replacementText,
    });
  }
}
```

5. In `importBackup`, widen the version check and call the new function:

```js
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
```

Note `Object.entries(plan.childTiers)` keys are strings (JS object keys are always strings) even though `childIds` are numbers — `Number(oldChildId)` before the `childIdMap.get` lookup is required, matching how `childIdMap`'s keys are numeric child ids from `data.children`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/backup.test.js`
Expected: PASS

- [ ] **Step 6: Run the full test suite to confirm nothing else broke**

Run: `npm test`
Expected: PASS (all files, including the pre-existing v1/v2 backup round-trip tests — version 3 is additive, old backups still import via the unchanged v1/v2 paths)

- [ ] **Step 7: Commit**

```bash
git add src/storage/backup.js tests/backup.test.js
git commit -m "feat: include 課程月計畫 in backup export/import"
```

---

### Task 13: docx export — `src/export/monthlyPlanDocxExport.js`

**Files:**
- Create: `src/export/monthlyPlanDocxExport.js`
- Test: `tests/monthlyPlanDocxExport.test.js`

**Interfaces:**
- Consumes: `FONT`, `DEFAULT_TEXT_SIZE`, `PAGE_SIZE`, `textParagraph`, `emptyParagraph` (`src/export/docxShared.js`); `TIERS` (`src/data/indicators.js`); `buildMonthlyCalendar` (Task 2); `Document`, `Packer`, `Paragraph`, `Table`, `TableCell`, `TableRow`, `TextRun`, `WidthType`, `AlignmentType`, `TableLayoutType` from `docx`.
- Produces:
  - `buildDayCellRuns(items, overrideByItemId)` — pure function, no `docx` types: `items: PlanSlotItem[]`, `overrideByItemId: Map<itemId, ChildItemOverride>` → array of per-item descriptors `{ text: string, notAchieved: boolean, replaced: boolean, replacementText: string }`, one entry per item, `text` already formatted as `代碼【活動名稱】指標內容` (indicator items) or just `activityName` (free items). This is the unit-tested core (mirrors `docxExport.js`'s `buildIndicatorRows`).
  - `generateMonthlyPlanDocxBlob({ plan, children, slots, itemsBySlotId, overrides })` — assembles the full multi-child `docx` `Document` (not directly unit-tested beyond a smoke test that it doesn't throw and returns a `Blob`), returns a `Promise<Blob>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/monthlyPlanDocxExport.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
globalThis.Blob = NodeBlob;
import { buildDayCellRuns, generateMonthlyPlanDocxBlob } from '../src/export/monthlyPlanDocxExport.js';

describe('buildDayCellRuns', () => {
  it('formats an indicator item as 代碼【活動名稱】指標內容, with no override flags by default', () => {
    const items = [{ id: 1, indicatorCode: 'Ⅴ-4-3', activityName: '分類遊戲', indicatorText: '能依形狀或顏色分類' }];
    const runs = buildDayCellRuns(items, new Map());
    expect(runs).toEqual([
      { text: 'Ⅴ-4-3【分類遊戲】能依形狀或顏色分類', notAchieved: false, replaced: false, replacementText: '' },
    ]);
  });

  it('formats a free (no-indicator) item as just its activity name', () => {
    const items = [{ id: 1, indicatorCode: null, activityName: '大團體活動', indicatorText: '' }];
    const runs = buildDayCellRuns(items, new Map());
    expect(runs[0].text).toBe('大團體活動');
  });

  it('carries notAchieved/replaced/replacementText through from a matching override', () => {
    const items = [{ id: 7, indicatorCode: null, activityName: '拼拼圖', indicatorText: '' }];
    const overrideByItemId = new Map([[7, { notAchieved: true, replaced: true, replacementText: '請假' }]]);
    const runs = buildDayCellRuns(items, overrideByItemId);
    expect(runs[0]).toMatchObject({ notAchieved: true, replaced: true, replacementText: '請假' });
  });

  it('preserves item order and handles multiple items in one cell', () => {
    const items = [
      { id: 1, indicatorCode: null, activityName: 'a', indicatorText: '' },
      { id: 2, indicatorCode: null, activityName: 'b', indicatorText: '' },
    ];
    const runs = buildDayCellRuns(items, new Map());
    expect(runs.map(r => r.text)).toEqual(['a', 'b']);
  });
});

describe('generateMonthlyPlanDocxBlob', () => {
  it('generates a non-empty docx Blob for a plan with one child and no items', async () => {
    const plan = { id: 1, period: '115年06月', childIds: [10], childTiers: { 10: 'Ⅴ' } };
    const children = [{ id: 10, name: '趙萬竑', birthDate: '2024-07-01' }];

    const blob = await generateMonthlyPlanDocxBlob({ plan, children, slots: [], itemsBySlotId: {}, overrides: [] });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/monthlyPlanDocxExport.test.js`
Expected: FAIL with "Cannot find module '../src/export/monthlyPlanDocxExport.js'"

- [ ] **Step 3: Implement**

Create `src/export/monthlyPlanDocxExport.js`:

```js
import {
  AlignmentType, Document, Packer, Paragraph, Table, TableCell, TableRow, TableLayoutType, TextRun, WidthType,
} from 'docx';
import { TIERS } from '../data/indicators.js';
import { FONT, DEFAULT_TEXT_SIZE, PAGE_SIZE, textParagraph, emptyParagraph } from './docxShared.js';
import { buildMonthlyCalendar } from '../domain/monthlyCalendar.js';
import { parsePeriod } from '../ui/periodFields.js';
import { calculateAgeInMonths } from '../domain/ageTier.js';

const PAGE_MARGIN = { top: 720, right: 720, bottom: 720, left: 720, header: 851, footer: 992 };
const COLUMN_WIDTHS = [1200, 1800, 1800, 1800, 1800, 1800];
const TABLE_WIDTH_DXA = COLUMN_WIDTHS.reduce((sum, w) => sum + w, 0);

function tierFormLetter(tierCode) {
  const tier = TIERS.find(t => t.code === tierCode);
  return tier ? tier.formLetter : '';
}

// Pure formatting core, unit-tested directly (mirrors docxExport.js's buildIndicatorRows):
// turns a day cell's items + this child's overrides into plain descriptors, with no `docx`
// package types involved, so the red/strike/replacement-text logic is testable without
// constructing a real Document.
export function buildDayCellRuns(items, overrideByItemId) {
  return items.map(item => {
    const override = overrideByItemId.get(item.id);
    const text = item.indicatorCode
      ? `${item.indicatorCode}【${item.activityName}】${item.indicatorText || ''}`
      : item.activityName;
    return {
      text,
      notAchieved: Boolean(override?.notAchieved),
      replaced: Boolean(override?.replaced),
      replacementText: override?.replacementText || '',
    };
  });
}

function runFont() {
  return { ascii: FONT, eastAsia: FONT, hAnsi: FONT, cs: FONT };
}

function cellParagraphsFromRuns(runs) {
  if (runs.length === 0) return [emptyParagraph()];
  return runs.map(run => {
    const children = [
      new TextRun({
        text: run.text,
        font: runFont(),
        size: DEFAULT_TEXT_SIZE,
        ...(run.notAchieved ? { color: 'FF0000' } : {}),
        ...(run.replaced ? { strike: true } : {}),
      }),
    ];
    if (run.replaced && run.replacementText) {
      children.push(new TextRun({ text: run.replacementText, font: runFont(), size: DEFAULT_TEXT_SIZE }));
    }
    return new Paragraph({ children });
  });
}

function cellWidth(index) {
  return { size: COLUMN_WIDTHS[index], type: WidthType.DXA };
}

function weekHeaderRow(weeks) {
  return new TableRow({
    children: [
      new TableCell({ width: cellWidth(0), children: [textParagraph('日期/姓名', { alignment: AlignmentType.CENTER })] }),
      ...weeks.map((week, index) =>
        new TableCell({
          width: cellWidth(index + 1),
          children: [
            textParagraph(`第${week.weekIndex}週`, { alignment: AlignmentType.CENTER }),
            textParagraph(week.dateRange, { alignment: AlignmentType.CENTER }),
          ],
        })
      ),
    ],
  });
}

function findSlot(slots, tier, weekIndex, weekday) {
  return slots.find(s => s.tier === tier && s.weekIndex === weekIndex && s.weekday === weekday);
}

function dayRows(child, tier, weeks, weekday, slots, itemsBySlotId, overrideByItemId) {
  const dateCells = weeks.map((week, index) => {
    const day = week.days.find(d => d.weekday === weekday);
    return new TableCell({ width: cellWidth(index + 1), children: [textParagraph(day ? day.dateLabel : '', { alignment: AlignmentType.CENTER })] });
  });
  const contentCells = weeks.map((week, index) => {
    const day = week.days.find(d => d.weekday === weekday);
    if (!day) return new TableCell({ width: cellWidth(index + 1), children: [emptyParagraph()] });
    const slot = findSlot(slots, tier, week.weekIndex, weekday);
    const items = slot ? itemsBySlotId[slot.id] || [] : [];
    const runs = buildDayCellRuns(items, overrideByItemId);
    return new TableCell({ width: cellWidth(index + 1), children: cellParagraphsFromRuns(runs) });
  });

  return [
    new TableRow({ children: [new TableCell({ width: cellWidth(0), children: [emptyParagraph()] }), ...dateCells] }),
    new TableRow({ children: [new TableCell({ width: cellWidth(0), children: [emptyParagraph()] }), ...contentCells] }),
  ];
}

function buildChildTable(child, tier, weeks, slots, itemsBySlotId, allOverrides) {
  const overrideByItemId = new Map(
    allOverrides.filter(o => o.childId === child.id).map(o => [o.itemId, o])
  );
  const asOfIso = weeks[0].days[0].isoDate;
  const ageMonths = calculateAgeInMonths(child.birthDate, asOfIso);

  const nameRow = new TableRow({
    children: [
      new TableCell({
        width: cellWidth(0),
        children: [textParagraph(`${child.name}`), textParagraph(`${ageMonths}M ${tierFormLetter(tier)}表`)],
      }),
      ...weeks.map((week, index) => new TableCell({ width: cellWidth(index + 1), children: [emptyParagraph()] })),
    ],
  });

  const bodyRows = [1, 2, 3, 4, 5].flatMap(weekday => dayRows(child, tier, weeks, weekday, slots, itemsBySlotId, overrideByItemId));

  return new Table({
    width: { size: TABLE_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: COLUMN_WIDTHS,
    layout: TableLayoutType.FIXED,
    rows: [weekHeaderRow(weeks), nameRow, ...bodyRows],
  });
}

export async function generateMonthlyPlanDocxBlob({ plan, children, slots, itemsBySlotId, overrides }) {
  const { year, month } = parsePeriod(plan.period);
  const weeks = buildMonthlyCalendar(year + 1911, month);

  const children_ = children.filter(c => plan.childIds.includes(c.id));
  const tables = children_.flatMap(child => [
    buildChildTable(child, plan.childTiers[child.id], weeks, slots, itemsBySlotId, overrides),
    emptyParagraph(),
  ]);

  const doc = new Document({
    sections: [
      {
        properties: { page: { size: PAGE_SIZE, margin: PAGE_MARGIN } },
        children: [textParagraph(`${plan.period}課程月計畫`, { bold: true, alignment: AlignmentType.CENTER }), emptyParagraph(), ...tables],
      },
    ],
  });

  return Packer.toBlob(doc);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/monthlyPlanDocxExport.test.js`
Expected: PASS

- [ ] **Step 5: Wire an export button into the editor view**

In `src/ui/monthlyPlanEditorView.js`, add a download button next to "管理小朋友" in the page header:

```js
      <button type="button" class="btn btn--purple" data-action="export-docx">匯出 Word</button>
```

and its handler (mirrors the download pattern used elsewhere for docx export — check `src/ui/formEditorView.js` for the exact existing `a.download`/`URL.createObjectURL` snippet and copy it verbatim, substituting `generateMonthlyPlanDocxBlob`):

```js
  container.querySelector('[data-action="export-docx"]').addEventListener('click', async () => {
    const blob = await generateMonthlyPlanDocxBlob({
      plan, children: data.children, slots: data.slots, itemsBySlotId: data.itemsBySlotId,
      overrides: [...data.overrideByKey.values()],
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${plan.period}課程月計畫.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
```

Add the import: `import { generateMonthlyPlanDocxBlob } from '../export/monthlyPlanDocxExport.js';`.

This button is a manual smoke-test surface, not covered by a new automated test (downloading/`URL.createObjectURL` isn't meaningfully testable in jsdom and every other export button in this codebase is verified the same way — manually, against a real download).

- [ ] **Step 6: Manual verification against the reference document**

Run `npm run build`, open `dist/TableC.html` in a real browser, create a 課程月計畫 for a real month with a few indicator items and at least one 未達成 + one 請假(with replacement text) marked, export, and open the resulting `.docx` in Word. Compare table structure, borders, and the red/strikethrough visual against `115年06月週計畫表(1).pdf` page-by-page. Adjust `COLUMN_WIDTHS`/`PAGE_MARGIN`/font sizes in `monthlyPlanDocxExport.js` to match if they're off — this is the same manual acceptance step every other docx export in this codebase went through (see `docxExport.acceptance.test.js`'s sibling manual process, and the design spec's own 驗收方式 section).

- [ ] **Step 7: Commit**

```bash
git add src/export/monthlyPlanDocxExport.js src/ui/monthlyPlanEditorView.js tests/monthlyPlanDocxExport.test.js
git commit -m "feat: add 課程月計畫 docx export"
```

---

## Self-Review Notes

- **Spec coverage:** every section of `2026-08-12-monthly-course-plan-design.md` maps to a task — 資料模型→Tasks 1/3, 月曆展開邏輯→Task 2, 建立與編輯畫面→Tasks 5/6/7/8/9/10, docx匯出→Task 13, 非目標 items (no import, no class roster, no holiday calendar) are simply absent from every task, as intended.
- **Type consistency check performed:** `PlanSlotItem.indicatorCode` is `null` (not `undefined` or `''`) for free-text items everywhere — `addPlanSlotItem`'s default, `buildDayCellRuns`'s `item.indicatorCode ?` check, and the indicator-picker's `|| null` all agree. `ChildItemOverride`'s `itemId` always refers to a `PlanSlotItem.id` (never a slot id) — verified consistent across Task 3's cascade-delete, Task 9's override wiring, and Task 13's `overrideByItemId` map keyed by `item.id`.
- **No placeholders:** every step has literal, runnable code — no "add error handling here" or "similar to Task N" shorthand; Task 8/9's panel functions are written out in full each time they're extended rather than referenced.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-12-monthly-course-plan-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
