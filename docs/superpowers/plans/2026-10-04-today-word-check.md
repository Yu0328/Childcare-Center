# 匯出前檢查「今天」「今日」 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before exporting a 適性紀錄, find teacher-typed text containing 今天/今日 and let the teacher edit it (saved back) in a popup; export straight away when there's none.

**Architecture:** A pure scanner (`src/domain/findTodayWords.js`) turns the data `exportReport` already loads into a list of hits. `src/ui/todayWordCheckPopup.js` builds a modal `<dialog class="form-popup form-popup--wide">` from those hits and resolves to `'export' | 'saved' | 'cancel'` after saving changed fields. `parentReportEditorView.js`'s 匯出 handler wires them together.

**Tech Stack:** vanilla JS ES modules, IndexedDB via `src/storage/parentReportDb.js`, vitest + jsdom + fake-indexeddb, esbuild, Playwright (screenshots only, `npm install --no-save playwright`).

Spec: `docs/superpowers/specs/2026-10-04-today-word-check-design.md`

## Global Constraints

- Words: exactly `['今天', '今日']`, plain substring match.
- Top line copy, verbatim: `以下內容含有『今天』或『今日』，可以在這裡修改`
- Button copy, verbatim: `儲存並匯出`, `只儲存`, `取消`. Save error copy: `儲存失敗，請再試一次`.
- No new colors or button styles: only existing classes (`form-popup`, `entry-form`, `panel-form__field`, `entry-form__actions`, `btn btn--primary|--outline|--ghost`) plus one width modifier `form-popup--wide`.
- No hit → behavior identical to today (no dialog, no message).
- Only fields whose text changed are written.
- Run tests scoped: `npx vitest run tests/` (a bare run also picks up other worktrees' copies).

---

### Task 1: Scanner

**Files:**
- Create: `src/domain/findTodayWords.js`
- Test: `tests/findTodayWords.test.js`

**Interfaces:**
- Produces: `findTodayWords({ coursePlanEntries, courseOccurrencesByEntryId, developmentRecordEntries, behaviorObservations, highlightEntries }) → Array<{ kind, id, label, text }>`, where `kind` ∈ `'occurrence' | 'developmentRecord' | 'observationTitle' | 'observationNarrative' | 'highlight'`. Ordering: course plan (entry order, then occurrence order), then development records, then observations (title before narrative per observation), then highlights.

- [ ] **Step 1: Write the failing test** `tests/findTodayWords.test.js`

```js
import { describe, it, expect } from 'vitest';
import { findTodayWords } from '../src/domain/findTodayWords.js';
import { DOMAINS } from '../src/data/indicators.js';

const empty = {
  coursePlanEntries: [], courseOccurrencesByEntryId: {},
  developmentRecordEntries: [], behaviorObservations: [], highlightEntries: [],
};

describe('findTodayWords', () => {
  it('returns nothing when no field mentions 今天/今日', () => {
    expect(findTodayWords({
      ...empty,
      coursePlanEntries: [{ id: 'e1', activityName: '積木' }],
      courseOccurrencesByEntryId: { e1: [{ id: 'o1', date: '2026-10-03', note: '玩積木' }] },
      behaviorObservations: [{ id: 'b1', title: '分享', narrative: undefined }],
    })).toEqual([]);
  });

  it('finds every field kind, in tab order, with labels', () => {
    const domain = DOMAINS[0];
    const hits = findTodayWords({
      coursePlanEntries: [{ id: 'e1', activityName: '積木遊戲' }],
      courseOccurrencesByEntryId: { e1: [
        { id: 'o1', date: '2026-10-03', note: '今天很專心' },
        { id: 'o2', date: '2026-10-04', note: '沒有' },
      ] },
      developmentRecordEntries: [{ id: 'd1', domain: domain.id, narrative: '今日表現穩定' }],
      behaviorObservations: [{ id: 'b1', title: '今天的分享', narrative: '他今日主動幫忙' }],
      highlightEntries: [{ id: 'h1', caption: '今天去公園' }],
    });
    expect(hits).toEqual([
      { kind: 'occurrence', id: 'o1', label: '課程計畫表｜積木遊戲｜115.10.03 說明', text: '今天很專心' },
      { kind: 'developmentRecord', id: 'd1', label: `適性發展紀錄表｜${domain.name}`, text: '今日表現穩定' },
      { kind: 'observationTitle', id: 'b1', label: '行為觀察｜標題', text: '今天的分享' },
      { kind: 'observationNarrative', id: 'b1', label: '行為觀察｜今天的分享｜內容', text: '他今日主動幫忙' },
      { kind: 'highlight', id: 'h1', label: '點滴分享｜照片說明', text: '今天去公園' },
    ]);
  });
});
```

Before writing the expected date label, check `toRocDate('2026-10-03')` in `src/export/docxShared.js:129` and use whatever it actually returns (the label must match what the 課程計畫表 tab shows).

- [ ] **Step 2: Run it, expect FAIL** (module not found): `npx vitest run tests/findTodayWords.test.js`

- [ ] **Step 3: Implement** `src/domain/findTodayWords.js`

```js
import { DOMAINS } from '../data/indicators.js';
import { toRocDate } from '../export/docxShared.js';

// Words a parent reading the exported file at month's end can't pin to a date — see
// docs/superpowers/specs/2026-10-04-today-word-check-design.md.
const TODAY_WORDS = ['今天', '今日'];
const hasTodayWord = text => typeof text === 'string' && TODAY_WORDS.some(word => text.includes(word));

export function findTodayWords({
  coursePlanEntries, courseOccurrencesByEntryId, developmentRecordEntries, behaviorObservations, highlightEntries,
}) {
  const hits = [];
  const add = (kind, id, label, text) => { if (hasTodayWord(text)) hits.push({ kind, id, label, text }); };
  for (const entry of coursePlanEntries) {
    for (const occurrence of courseOccurrencesByEntryId[entry.id] || []) {
      add('occurrence', occurrence.id, `課程計畫表｜${entry.activityName}｜${toRocDate(occurrence.date)} 說明`, occurrence.note);
    }
  }
  for (const record of developmentRecordEntries) {
    const domainName = DOMAINS.find(d => d.id === record.domain)?.name || '';
    add('developmentRecord', record.id, `適性發展紀錄表｜${domainName}`, record.narrative);
  }
  for (const observation of behaviorObservations) {
    add('observationTitle', observation.id, '行為觀察｜標題', observation.title);
    add('observationNarrative', observation.id, `行為觀察｜${observation.title}｜內容`, observation.narrative);
  }
  for (const highlight of highlightEntries) {
    add('highlight', highlight.id, '點滴分享｜照片說明', highlight.caption);
  }
  return hits;
}
```

- [ ] **Step 4: Run, expect PASS:** `npx vitest run tests/findTodayWords.test.js`
- [ ] **Step 5: Commit** `git add src/domain/findTodayWords.js tests/findTodayWords.test.js && git commit -m "feat: find 今天/今日 in a 適性紀錄's typed text"`

---

### Task 2: Check popup + wire into 匯出

**Files:**
- Create: `src/ui/todayWordCheckPopup.js`
- Modify: `src/ui/parentReportEditorView.js` (`exportReport` and the `[data-action="export"]` handler, lines 19-71)
- Modify: `src/styles.css` (add `.form-popup--wide` and sticky actions right after the `.form-popup::backdrop` rule, ~line 1008)
- Test: `tests/parentReportEditorView.test.js` (append a new `describe`)

**Interfaces:**
- Consumes: `findTodayWords(data)` from Task 1.
- Produces: `openTodayWordCheck(hits) → Promise<'export' | 'saved' | 'cancel'>`. It appends the dialog to `document.body`, saves changed fields itself, and removes the dialog when it settles.

- [ ] **Step 1: Write failing tests** appended to `tests/parentReportEditorView.test.js`. jsdom has no `showModal`; stub it the way `tests/formPopup.test.js:87` does. Mock the docx generator the way `tests/monthlyPlanEditorView.test.js:14` does, so export is a cheap spy:

```js
import { vi } from 'vitest';
import {
  addCoursePlanEntry, addCourseOccurrence, listCourseOccurrencesForEntry,
  addBehaviorObservation, listBehaviorObservationsForReport,
} from '../src/storage/parentReportDb.js';
import { downloadParentReportDocx } from '../src/export/parentReportDocxExport.js';

vi.mock('../src/export/parentReportDocxExport.js', () => ({
  generateParentReportDocxBlob: vi.fn().mockResolvedValue(new Blob(['x'])),
  downloadParentReportDocx: vi.fn(),
}));

describe('匯出: 今天/今日 check', () => {
  let child, report, container, entry, occurrence, observation;

  beforeEach(async () => {
    await clearAllData();
    vi.mocked(downloadParentReportDocx).mockClear();
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
    child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
    entry = await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-1-1', activityName: '積木遊戲' });
    occurrence = await addCourseOccurrence({ entryId: entry.id, date: '2026-06-03', status: 'developed', absent: false, note: '今天很專心' });
    observation = await addBehaviorObservation({ reportId: report.id, title: '分享', narrative: '今日主動幫忙' });
    container = document.createElement('div');
    document.body.appendChild(container);
    await renderParentReportEditorView(container, { child, report, onBack: () => {} });
  });

  afterEach(() => {
    container.remove();
    document.querySelectorAll('dialog.today-check').forEach(d => d.remove());
  });

  const openCheck = async () => {
    container.querySelector('[data-action="export"]').click();
    await waitFor(() => document.querySelector('dialog.today-check'));
    return document.querySelector('dialog.today-check');
  };

  it('exports straight away with no popup when nothing mentions 今天/今日', async () => {
    await clearAllData();
    child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
    await renderParentReportEditorView(container, { child, report, onBack: () => {} });
    container.querySelector('[data-action="export"]').click();
    await waitFor(() => vi.mocked(downloadParentReportDocx).mock.calls.length === 1);
    expect(document.querySelector('dialog.today-check')).toBeNull();
  });

  it('lists each matching field with its label and text', async () => {
    const dialog = await openCheck();
    expect(dialog.textContent).toContain('以下內容含有『今天』或『今日』，可以在這裡修改');
    const fields = [...dialog.querySelectorAll('[data-today-field]')];
    expect(fields.map(f => f.value)).toEqual(['今天很專心', '今日主動幫忙']);
    expect(dialog.textContent).toContain('課程計畫表｜積木遊戲');
    expect(dialog.textContent).toContain('行為觀察｜分享｜內容');
    expect(vi.mocked(downloadParentReportDocx)).not.toHaveBeenCalled();
  });

  it('只儲存 saves only changed fields and does not export', async () => {
    const dialog = await openCheck();
    dialog.querySelectorAll('[data-today-field]')[0].value = '6/3很專心';
    dialog.querySelector('[data-today-action="save"]').click();
    await waitFor(() => !document.querySelector('dialog.today-check'));
    expect((await listCourseOccurrencesForEntry(entry.id))[0].note).toBe('6/3很專心');
    const [savedObservation] = await listBehaviorObservationsForReport(report.id);
    expect(savedObservation.narrative).toBe('今日主動幫忙');
    expect(savedObservation.updatedAt).toBe(observation.updatedAt); // untouched field not rewritten
    expect(vi.mocked(downloadParentReportDocx)).not.toHaveBeenCalled();
  });

  it('儲存並匯出 saves, then exports', async () => {
    const dialog = await openCheck();
    dialog.querySelectorAll('[data-today-field]')[1].value = '主動幫忙';
    dialog.querySelector('[data-today-action="save-export"]').click();
    await waitFor(() => vi.mocked(downloadParentReportDocx).mock.calls.length === 1);
    expect((await listBehaviorObservationsForReport(report.id))[0].narrative).toBe('主動幫忙');
  });

  it('取消 saves nothing and does not export', async () => {
    const dialog = await openCheck();
    dialog.querySelectorAll('[data-today-field]')[0].value = '改了';
    dialog.querySelector('[data-today-action="cancel"]').click();
    await waitFor(() => !document.querySelector('dialog.today-check'));
    expect((await listCourseOccurrencesForEntry(entry.id))[0].note).toBe('今天很專心');
    expect(vi.mocked(downloadParentReportDocx)).not.toHaveBeenCalled();
  });
});
```

Merge the new imports into the file's existing import lines (`vi`, `afterEach` into the vitest import). The `vi.mock` is hoisted and also applies to the file's existing tests, which never export, so it's harmless. If `addBehaviorObservation`'s record has no `updatedAt` when none is passed, drop that one assertion and instead check that an unchanged field was not written by spying `updateBehaviorObservation` with `vi.spyOn` on the module namespace. Pick whichever works and keep it.

- [ ] **Step 2: Run, expect FAIL:** `npx vitest run tests/parentReportEditorView.test.js`

- [ ] **Step 3: Implement** `src/ui/todayWordCheckPopup.js`

```js
import { escapeHtml } from './escapeHtml.js';
import { oneAtATime } from './oneAtATime.js';
import { lockBodyScroll, unlockBodyScroll, closeOnBackdropClick } from './formPopup.js';
import {
  updateCourseOccurrence, updateDevelopmentRecordEntry, updateBehaviorObservation, updateHighlightEntry,
} from '../storage/parentReportDb.js';

const SAVE = {
  occurrence: (id, text) => updateCourseOccurrence(id, { note: text }),
  developmentRecord: (id, text) => updateDevelopmentRecordEntry(id, { narrative: text }),
  observationTitle: (id, text) => updateBehaviorObservation(id, { title: text }),
  observationNarrative: (id, text) => updateBehaviorObservation(id, { narrative: text }),
  highlight: (id, text) => updateHighlightEntry(id, { caption: text }),
};

// Shown by the 適性紀錄 匯出 button when findTodayWords() finds anything — lets the teacher reword
// each 今天/今日 before a parent reads it out of context. Edits are saved back to the records.
// Resolves 'export' (saved, caller should export), 'saved' (saved only), or 'cancel'.
export function openTodayWordCheck(hits) {
  const dialog = document.createElement('dialog');
  dialog.className = 'form-popup form-popup--wide today-check';
  dialog.innerHTML = `
    <button type="button" class="form-popup__close" data-action="close-form-popup" aria-label="關閉">×</button>
    <div class="entry-form today-check__body">
      <p class="today-check__hint">以下內容含有『今天』或『今日』，可以在這裡修改</p>
      ${hits.map((hit, index) => `
        <label class="panel-form__field">${escapeHtml(hit.label)}
          ${hit.kind === 'observationTitle'
            ? `<input data-today-field="${index}" value="${escapeHtml(hit.text)}">`
            : `<textarea data-today-field="${index}">${escapeHtml(hit.text)}</textarea>`}
        </label>
      `).join('')}
      <p class="field-error" data-error></p>
      <div class="entry-form__actions today-check__actions">
        <button type="button" class="btn btn--primary btn--small" data-today-action="save-export">儲存並匯出</button>
        <button type="button" class="btn btn--outline btn--small" data-today-action="save">只儲存</button>
        <button type="button" class="btn btn--ghost btn--small" data-today-action="cancel">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  return new Promise(resolve => {
    let result = 'cancel';
    const save = outcome => oneAtATime(async () => {
      try {
        for (const field of dialog.querySelectorAll('[data-today-field]')) {
          const hit = hits[Number(field.dataset.todayField)];
          if (field.value !== hit.text) await SAVE[hit.kind](hit.id, field.value);
        }
      } catch {
        dialog.querySelector('[data-error]').textContent = '儲存失敗，請再試一次';
        return;
      }
      result = outcome;
      dialog.close();
    });
    dialog.querySelector('[data-today-action="save-export"]').addEventListener('click', save('export'));
    dialog.querySelector('[data-today-action="save"]').addEventListener('click', save('saved'));
    dialog.querySelector('[data-today-action="cancel"]').addEventListener('click', () => dialog.close());
    dialog.querySelector('[data-action="close-form-popup"]').addEventListener('click', () => dialog.close());
    closeOnBackdropClick(dialog);
    // Covers every way out — the buttons above, ×, backdrop click, and Escape.
    dialog.addEventListener('close', () => {
      unlockBodyScroll();
      dialog.remove();
      resolve(result);
    });
    dialog.showModal();
    lockBodyScroll();
  });
}
```

Check `oneAtATime`'s signature in `src/ui/oneAtATime.js` first. If it wraps a function and returns a handler (as `parentReportEditorView.js:62` uses it), the code above is right as written.

- [ ] **Step 4: Wire into** `src/ui/parentReportEditorView.js`. Split `exportReport` into load + generate so the scan reuses the same loaded data:

```js
async function loadReportData(report) {
  const coursePlanEntries = await listCoursePlanEntriesForReport(report.id);
  const courseOccurrencesByEntryId = {};
  for (const entry of coursePlanEntries) {
    courseOccurrencesByEntryId[entry.id] = await listCourseOccurrencesForEntry(entry.id);
  }
  return {
    coursePlanEntries, courseOccurrencesByEntryId,
    developmentRecordEntries: await listDevelopmentRecordEntriesForReport(report.id),
    behaviorObservations: await listBehaviorObservationsForReport(report.id),
    highlightEntries: await listHighlightEntriesForReport(report.id),
  };
}
```

Replace the export click handler body:

```js
  container.querySelector('[data-action="export"]').addEventListener('click', oneAtATime(async () => {
    const errorEl = container.querySelector('[data-error="export"]');
    try {
      let data = await loadReportData(report);
      const hits = findTodayWords(data);
      if (hits.length) {
        const outcome = await openTodayWordCheck(hits);
        if (outcome === 'cancel') return;
        // Re-render so the open tab shows the saved wording.
        keepScroll(() => renderParentReportEditorView(container, { child, report, onBack, activeTab }));
        if (outcome === 'saved') return;
        data = await loadReportData(report);
      }
      const blob = await generateParentReportDocxBlob({ child, report, ...data });
      downloadParentReportDocx(blob, `${child.name}-適性紀錄-${report.period}.docx`);
      if (errorEl) errorEl.textContent = '';
    } catch (err) {
      if (errorEl) errorEl.textContent = `匯出失敗，請再試一次（${err?.message || err}）`;
    }
  }));
```

Add imports for `findTodayWords` and `openTodayWordCheck`, and delete the old `exportReport`.

- [ ] **Step 5: Add CSS** in `src/styles.css`, right after `.form-popup::backdrop { … }`:

```css
/* 匯出前「今天」check popup — wider than the add/edit popups because it holds whole narratives;
   phones fall back to the shared 90vw. Actions stick to the bottom so they stay reachable while a
   long list scrolls. */
.form-popup--wide:modal {
  width: min(92vw, 640px);
}
.form-popup--wide:modal .form-popup__close {
  display: block;
}
.today-check__body {
  padding-top: 2.4rem; /* clears the × button */
}
.today-check__hint {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-secondary);
}
.today-check__actions {
  position: sticky;
  bottom: -0.9rem; /* cancel .entry-form's bottom padding so the row sits flush */
  padding-bottom: 0.9rem;
  background: var(--page-bg);
  justify-content: flex-end;
  flex-wrap: wrap;
}
```

Check `.entry-form__actions` at `src/styles.css:1939` and the phone-width `.form-popup` block at ~1048. If phones override `.form-popup:modal` width with a selector that's more specific than `.form-popup--wide:modal`, make sure phones still end up at 90vw. Adjust the selector, not the colors.

- [ ] **Step 6: Run, expect PASS:** `npx vitest run tests/` (whole suite, so the existing editor/export tests still pass)
- [ ] **Step 7: Commit** `git add src/ui/todayWordCheckPopup.js src/ui/parentReportEditorView.js src/styles.css tests/parentReportEditorView.test.js && git commit -m "feat: check 適性紀錄 for 今天/今日 before 匯出"`

---

### Task 3: Real-browser check, screenshots, docs

**Files:**
- Modify: `CLAUDE.md` (one sentence in the 適性紀錄 item of "What this project is")
- Scratch (not committed): a Playwright script under `$CLAUDE_JOB_DIR/tmp`

- [ ] **Step 1:** `npm run build`, then `npm install --no-save playwright`.
- [ ] **Step 2:** Playwright script against `dist/TableC.html`: pass the password gate, create a child + 適性紀錄, add a 課程計畫 occurrence note `今天很專心` and a 行為觀察 narrative `今日主動幫忙`. Then:
  - 匯出 → popup shows both. Screenshot at 1280×800 and 390×844 (`today-check-desktop.png`, `today-check-phone.png`).
  - Edit the first field, 儲存並匯出 → a download event fires, and the 課程計畫表 tab shows the new text.
  - Edit the second field, 只儲存 → no download.
  - 匯出 again → download fires with no popup.
  - Also screenshot an existing 編輯 popup at 390×844 for side-by-side comparison.
- [ ] **Step 3:** Look at the screenshots. Check that the colors, corners, and buttons match the 編輯 popup, nothing overflows sideways on the phone, and the buttons stay visible at the bottom. Fix CSS and re-shoot if not.
- [ ] **Step 4:** CLAUDE.md, append to item 2 (適性紀錄): `匯出 first scans the teacher-typed text for 今天／今日 (src/domain/findTodayWords.js); any hit opens a popup to reword them (saved back) before exporting, none exports silently as before.`
- [ ] **Step 5:** Commit `git add CLAUDE.md && git commit -m "docs: note 匯出 今天 check"`. Show the screenshots to the user for approval before merging.
