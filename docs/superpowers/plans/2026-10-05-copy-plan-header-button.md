# 套用 header button + popup panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move 「套用其他幼兒課程計畫」 from a pill row above the 課程計畫表 into the 適性紀錄 editor header (purple, left of 匯出 Word, 課程計畫表 tab only), and pick the source child in a popup panel with radios + 套用/取消.

**Architecture:** New `src/ui/copyCoursePlanPanel.js` owns the popup (markup, radios, confirm, apply) on top of the unchanged `src/domain/copyCoursePlan.js`. `parentReportEditorView.js` renders the header button and calls the panel. The old row is removed from `courseplanTabView.js`. Spec: `docs/superpowers/specs/2026-10-05-copy-plan-header-button-design.md`.

**Tech Stack:** Vanilla JS, IndexedDB, vitest + jsdom + fake-indexeddb, esbuild, Playwright (manual check only).

## Global Constraints

- Header button: `btn btn--purple`, `headerButtonLabel('套用其他幼兒課程計畫', '套用')`, inside `.page-header__actions` together with the existing 匯出 Word button, 套用 first (left). Only when `activeTab === 'coursePlan'`.
- Panel title 「套用其他幼兒課程計畫」; one radio per candidate labelled 「林小明（2 筆）」; none pre-selected; 套用 disabled until one is picked; buttons 「套用」 + 「取消」.
- No candidates → 「沒有同年齡層、同月份的其他幼兒課程計畫可以套用」 and only a 「關閉」 button.
- Popup on every screen size (`nestedEntryFormDialog(html, true)`).
- Confirm text unchanged from today's `copyConfirmMessage`. Confirm OK → copy, close dialog, `onChange()`. Cancel → nothing changes, dialog stays open. Failure → 「套用失敗，請再試一次」.
- 套用 handler wrapped in `oneAtATime`.
- `src/domain/copyCoursePlan.js` is not modified.
- Fixture names only (陳小安 / 林小明 / 王小華). Tests: `npx vitest run tests/<file>` while iterating, `npx vitest run tests/` before committing — never bare `npx vitest run`.

---

### Task 1: `copyCoursePlanPanel.js`

**Files:**
- Create: `src/ui/copyCoursePlanPanel.js`
- Test: `tests/copyCoursePlanPanel.test.js`

**Interfaces:**
- Consumes: `findCopySources`, `planCoursePlanCopy`, `copyCoursePlan` (`src/domain/copyCoursePlan.js`); `nestedEntryFormDialog`, `wireNestedEntryForm` (`src/ui/formPopup.js`); `oneAtATime`; `escapeHtml`.
- Produces: `renderCopyCoursePlanPanel(host, { trigger, report, onChange, confirmCopy }) → Promise<void>` — fills `host` with the dialog and wires `trigger` to open it. DOM hooks: `[data-copy-plan-form]`, `input[name="copy-plan-source"]`, `[data-action="close-copy-plan"]`, `[data-error="copy"]`.

- [ ] **Step 0:** `npm ci` (fresh worktree, no node_modules).

- [ ] **Step 1: Write the failing tests** — create `tests/copyCoursePlanPanel.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import { addParentReport, addCoursePlanEntry, listCoursePlanEntriesForReport } from '../src/storage/parentReportDb.js';
import { renderCopyCoursePlanPanel } from '../src/ui/copyCoursePlanPanel.js';
import { waitFor } from './helpers.js';

describe('renderCopyCoursePlanPanel', () => {
  let report;
  let other;
  let opened;
  let closed;
  const originalShowModal = HTMLDialogElement.prototype.showModal;
  const originalClose = HTMLDialogElement.prototype.close;

  beforeEach(async () => {
    await clearAllData();
    const child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    const otherChild = await addChild({ name: '林小明', birthDate: '2024-07-01' });
    report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
    other = await addParentReport({ childId: otherChild.id, tier: 'Ⅴ', period: '115年06月' });
    opened = 0;
    closed = 0;
    // jsdom has no real modal dialogs — same stubbing as formPopup.test.js.
    HTMLDialogElement.prototype.showModal = function () { opened += 1; this.open = true; };
    HTMLDialogElement.prototype.close = function () { closed += 1; this.open = false; this.dispatchEvent(new Event('close')); };
  });

  afterEach(() => {
    HTMLDialogElement.prototype.showModal = originalShowModal;
    HTMLDialogElement.prototype.close = originalClose;
  });

  async function setup(options = {}) {
    const host = document.createElement('div');
    const trigger = document.createElement('button');
    await renderCopyCoursePlanPanel(host, { trigger, report, onChange: () => {}, ...options });
    return { host, trigger, form: host.querySelector('[data-copy-plan-form]') };
  }

  const submit = form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

  it('opens as a popup from the trigger, titled and listing candidates as unselected radios', async () => {
    await addCoursePlanEntry({ reportId: other.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    const { trigger, form } = await setup();

    expect(form.closest('dialog.form-popup')).not.toBeNull();
    trigger.click();
    expect(opened).toBe(1);
    expect(form.querySelector('.panel-form__title').textContent).toBe('套用其他幼兒課程計畫');
    const radio = form.querySelector(`input[name="copy-plan-source"][value="${other.id}"]`);
    expect(radio.checked).toBe(false);
    expect(radio.closest('label').textContent.trim()).toBe('林小明（1 筆）');
  });

  it('shows an empty message and only a 關閉 button when no one can be copied from', async () => {
    const { form } = await setup();

    expect(form.textContent).toContain('沒有同年齡層、同月份的其他幼兒課程計畫可以套用');
    expect(form.querySelector('[type="submit"]')).toBeNull();
    form.querySelector('[data-action="close-copy-plan"]').click();
    expect(form.querySelector('[data-action="close-copy-plan"]').textContent).toBe('關閉');
    expect(closed).toBe(1);
  });

  it('keeps 套用 disabled until a child is picked; 取消 closes', async () => {
    await addCoursePlanEntry({ reportId: other.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    const { form } = await setup();
    const apply = form.querySelector('[type="submit"]');

    expect(apply.textContent).toBe('套用');
    expect(apply.disabled).toBe(true);
    form.querySelector(`input[value="${other.id}"]`).click();
    expect(apply.disabled).toBe(false);

    const cancel = form.querySelector('[data-action="close-copy-plan"]');
    expect(cancel.textContent).toBe('取消');
    cancel.click();
    expect(closed).toBe(1);
  });

  it('cancelling the confirm changes nothing and leaves the panel open', async () => {
    await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-2-1', activityName: '舊活動' });
    await addCoursePlanEntry({ reportId: other.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    let message = null;
    let changed = false;
    const { form } = await setup({ onChange: () => { changed = true; }, confirmCopy: m => { message = m; return false; } });

    form.querySelector(`input[value="${other.id}"]`).click();
    submit(form);
    await waitFor(() => message !== null);

    expect(message).toContain('目前這份的 1 筆課程計畫，會換成「林小明」的 1 筆課程計畫。');
    expect((await listCoursePlanEntriesForReport(report.id)).map(e => e.activityName)).toEqual(['舊活動']);
    expect(closed).toBe(0);
    expect(changed).toBe(false);
  });

  it('confirming replaces the course plan, closes the panel and re-renders', async () => {
    await addCoursePlanEntry({ reportId: other.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    let message = null;
    let changed = false;
    const { form } = await setup({ onChange: () => { changed = true; }, confirmCopy: m => { message = m; return true; } });

    form.querySelector(`input[value="${other.id}"]`).click();
    submit(form);
    await waitFor(() => changed);

    expect(message).toContain('會套用「林小明」的 1 筆課程計畫。');
    expect((await listCoursePlanEntriesForReport(report.id)).map(e => e.activityName)).toEqual(['畫畫']);
    expect(closed).toBe(1);
  });

  it('a double submit runs only one copy', async () => {
    await addCoursePlanEntry({ reportId: other.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    let changed = false;
    const { form } = await setup({ onChange: () => { changed = true; }, confirmCopy: () => true });

    form.querySelector(`input[value="${other.id}"]`).click();
    submit(form);
    submit(form);
    await waitFor(() => changed);
    await new Promise(resolve => setTimeout(resolve, 50));

    expect((await listCoursePlanEntriesForReport(report.id)).map(e => e.activityName)).toEqual(['畫畫']);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/copyCoursePlanPanel.test.js` → FAIL, cannot resolve `../src/ui/copyCoursePlanPanel.js`.

- [ ] **Step 3: Implement** — create `src/ui/copyCoursePlanPanel.js`:

```js
import { escapeHtml } from './escapeHtml.js';
import { nestedEntryFormDialog, wireNestedEntryForm } from './formPopup.js';
import { oneAtATime } from './oneAtATime.js';
import { findCopySources, planCoursePlanCopy, copyCoursePlan } from '../domain/copyCoursePlan.js';

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

// The 適性紀錄 header's 「套用其他幼兒課程計畫」 button opens this — same panel-form look as 課程月計畫's
// 管理幼兒. Always a popup, desktop too: the 課程計畫表 tab's right column is its 新增 form.
export async function renderCopyCoursePlanPanel(
  host,
  { trigger, report, onChange, confirmCopy = message => (typeof confirm === 'function' ? confirm(message) : false) }
) {
  const sources = await findCopySources(report);
  host.innerHTML = nestedEntryFormDialog(`
    <form class="panel-form" data-copy-plan-form>
      <h3 class="panel-form__title">套用其他幼兒課程計畫</h3>
      ${sources.length === 0
        ? '<p>沒有同年齡層、同月份的其他幼兒課程計畫可以套用</p>'
        : `<fieldset class="panel-form__field">
            <legend>幼兒</legend>
            ${sources.map(source => `
              <label class="panel-form__checkbox-row">
                <input type="radio" name="copy-plan-source" value="${escapeHtml(source.report.id)}"> ${escapeHtml(source.childName)}（${source.entryCount} 筆）
              </label>`).join('')}
          </fieldset>`}
      <div class="entry-form__actions">
        ${sources.length === 0 ? '' : '<button type="submit" class="btn btn--primary btn--small" disabled>套用</button>'}
        <button type="button" class="btn btn--outline btn--small" data-action="close-copy-plan">${sources.length === 0 ? '關閉' : '取消'}</button>
      </div>
      <p class="field-error" data-error="copy"></p>
    </form>
  `, true);

  const form = host.querySelector('[data-copy-plan-form]');
  const dialog = form.closest('dialog');
  wireNestedEntryForm(trigger, form);
  form.querySelector('[data-action="close-copy-plan"]').addEventListener('click', () => dialog.close());

  const selectedSource = () => {
    const checked = form.querySelector('input[name="copy-plan-source"]:checked');
    return checked && sources.find(source => String(source.report.id) === checked.value);
  };
  form.addEventListener('change', () => {
    form.querySelector('[type="submit"]').disabled = !selectedSource();
  });

  form.addEventListener('submit', oneAtATime(async event => {
    event.preventDefault();
    const source = selectedSource();
    if (!source) return;
    const ids = { targetReportId: report.id, sourceReportId: source.report.id };
    try {
      const counts = await planCoursePlanCopy(ids);
      // Cancel keeps the panel open so another child can be picked.
      if (!confirmCopy(copyConfirmMessage({ childName: source.childName, ...counts }))) return;
      await copyCoursePlan(ids);
    } catch (err) {
      form.querySelector('[data-error="copy"]').textContent = '套用失敗，請再試一次';
      return;
    }
    dialog.close();
    onChange();
  }));
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/copyCoursePlanPanel.test.js` → 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/ui/copyCoursePlanPanel.js tests/copyCoursePlanPanel.test.js
git commit -m "feat: 套用其他幼兒課程計畫 popup panel"
```

---

### Task 2: Header button; remove the old row

**Files:**
- Modify: `src/ui/parentReportEditorView.js` (imports; header markup; wiring before the tab render)
- Modify: `src/ui/courseplanTabView.js` (remove copy row, wiring, `copyConfirmMessage`, the `headerButtonLabel` and `copyCoursePlan.js` imports, the `copySources` fetch)
- Modify: `src/styles.css` (remove the `/* 課程計畫表's 套用其他幼兒課程計畫 button ... */` comment and every `.copy-plan*` rule)
- Modify: `tests/courseplanTabView.test.js` (delete the whole `describe('renderCoursePlanTab — 套用其他幼兒課程計畫', …)` block — its cases now live in `tests/copyCoursePlanPanel.test.js`)
- Test: `tests/parentReportEditorView.test.js`

**Interfaces:**
- Consumes: `renderCopyCoursePlanPanel(host, { trigger, report, onChange })` from Task 1.
- Produces: header hook `[data-action="copy-course-plan"]`, panel host `[data-copy-plan-host]`.

- [ ] **Step 1: Write the failing test** — append inside the existing `describe('renderParentReportEditorView', …)` in `tests/parentReportEditorView.test.js`:

```js
  it('puts 套用其他幼兒課程計畫 left of 匯出 Word on the 課程計畫表 tab only', async () => {
    const container = document.createElement('div');
    await renderParentReportEditorView(container, { child, report, onBack: () => {} });

    const actions = container.querySelector('.page-header .page-header__actions');
    const [copyButton, exportButton] = actions.querySelectorAll('button');
    expect(copyButton.dataset.action).toBe('copy-course-plan');
    expect(copyButton.classList.contains('btn--purple')).toBe(true);
    expect(copyButton.querySelector('.btn__label-full').textContent).toBe('套用其他幼兒課程計畫');
    expect(copyButton.querySelector('.btn__label-short').textContent).toBe('套用');
    expect(exportButton.dataset.action).toBe('export');
    expect(container.querySelector('[data-copy-plan-form]')).not.toBeNull();

    for (const activeTab of ['developmentRecord', 'behaviorObservation', 'highlights']) {
      const other = document.createElement('div');
      await renderParentReportEditorView(other, { child, report, onBack: () => {}, activeTab });
      expect(other.querySelector('[data-action="copy-course-plan"]')).toBeNull();
      expect(other.querySelector('[data-copy-plan-form]')).toBeNull();
      expect(other.querySelector('.page-header [data-action="export"]')).not.toBeNull();
    }
  });
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/parentReportEditorView.test.js` → the new test FAILS (no `.page-header__actions`).

- [ ] **Step 3: Implement**

In `src/ui/parentReportEditorView.js` add the import:

```js
import { renderCopyCoursePlanPanel } from './copyCoursePlanPanel.js';
```

Replace the header block inside `container.innerHTML` — the single export button line — so the template becomes:

```js
  const isCoursePlan = activeTab === 'coursePlan';
  const exportButton = `<button type="button" class="btn btn--purple" data-action="export">${headerButtonLabel('匯出 Word', '匯出')}</button>`;

  container.innerHTML = `
    <div class="page-header page-header--editor">
      <button type="button" class="btn btn--ghost" data-action="back">${headerButtonLabel('← 返回適性紀錄列表', '← 返回')}</button>
      <h2 class="page-header__title">${escapeHtml(child.name)}　${escapeHtml(report.tier)} 階段<span class="page-header__period">${escapeHtml(report.period)}</span></h2>
      ${isCoursePlan
        ? `<div class="page-header__actions">
            <button type="button" class="btn btn--purple" data-action="copy-course-plan">${headerButtonLabel('套用其他幼兒課程計畫', '套用')}</button>
            ${exportButton}
          </div>`
        : exportButton}
    </div>
    ${isCoursePlan ? '<div data-copy-plan-host></div>' : ''}
    <p class="field-error field-error--center" data-error="export"></p>
    ...rest unchanged (tabs + tab panel)...
  `;
```

(`isCoursePlan` / `exportButton` go right above `container.innerHTML`.)

At the end of the function, wire the panel before rendering the tab (`onChange` is already defined there):

```js
  const onChange = () => keepScroll(() => renderParentReportEditorView(container, { child, report, onBack, activeTab }));
  if (isCoursePlan) {
    // Only 課程計畫表 is replaced by 套用, so the button and its panel live on that tab only.
    await renderCopyCoursePlanPanel(container.querySelector('[data-copy-plan-host]'), {
      trigger: container.querySelector('[data-action="copy-course-plan"]'), report, onChange,
    });
  }
  await activeTabConfig.render(panel, { report, onChange });
```

In `src/ui/courseplanTabView.js` remove: the `headerButtonLabel` import line, the `findCopySources, planCoursePlanCopy, copyCoursePlan` import line, the whole `copyConfirmMessage` function, the `const copySources = await findCopySources(report);` line, the `<div class="copy-plan">…</div>` block in the template, and the copy wiring block (from `const copyPicker = …` through the `for (const button of container.querySelectorAll('[data-copy-from]')) …` line). Leave the `confirmDelete` option (still used by deletes). Check with `grep -n "copy\|headerButtonLabel" src/ui/courseplanTabView.js` → no matches.

In `src/styles.css` remove the `.copy-plan` block (its leading comment, `.copy-plan`, `.copy-plan__picker`, `.copy-plan__picker[hidden]`, `.copy-plan__empty`, `.copy-plan .field-error:empty`). Check: `grep -n "copy-plan" src/styles.css` → no matches.

In `tests/courseplanTabView.test.js` delete the `describe('renderCoursePlanTab — 套用其他幼兒課程計畫', …)` block entirely. If that leaves an import unused, remove it.

- [ ] **Step 4: Run** — `npx vitest run tests/` → all pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/parentReportEditorView.js src/ui/courseplanTabView.js src/styles.css tests/courseplanTabView.test.js tests/parentReportEditorView.test.js
git commit -m "feat: 套用 moves to the 適性紀錄 header next to 匯出 Word"
```

---

### Task 3: Real-browser check

No repo files change (screenshots and scripts go to `$CLAUDE_JOB_DIR/tmp`).

- [ ] **Step 1:** `npm run build`; `npm install --no-save playwright`; open `dist/TableC.html` with localStorage `c-form-unlocked` preset to the password hash in `src/auth/passwordGate.js` (`PASSWORD_HASH`), so the gate is skipped.
- [ ] **Step 2:** Create two children (陳小安, 林小明) each with a 適性紀錄 of the same tier and month; give 林小明 two course-plan rows with dates.
- [ ] **Step 3:** On 陳小安's 課程計畫表 at 1200px: header shows 「← 返回適性紀錄列表」 left, title centered, 「套用其他幼兒課程計畫」「匯出 Word」 right, both purple, same height. Screenshot. Switch to 適性發展紀錄表 → only 匯出 Word. Screenshot.
- [ ] **Step 4:** Click 套用 → centered popup, title, radio 「林小明（2 筆）」, 套用 greyed. Screenshot. Pick → 套用 enabled → accept confirm → popup closes, rows are 林小明's with ○.
- [ ] **Step 5:** At 390px: title on its own line, 「← 返回」 left and 「套用」「匯出」 right on the next line, nothing overlapping. Open the popup. Screenshots.
- [ ] **Step 6:** Report each check's result and screenshot paths. A real visual problem goes back as a finding (no fix in this task).
