# 操作說明 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An in-app 操作說明 screen (table of contents + chapters) reached from a 4th home card.

**Architecture:** `helpContent.js` holds the chapters as static data; `helpView.js` renders TOC +
one chapter and switches chapters by re-rendering itself; `app.js` routes to it like any other
screen. Phone vs desktop is CSS plus one `isMobile()` check for where ← 返回 goes.

**Tech Stack:** vanilla JS ES modules, esbuild, vitest + jsdom.

Spec: `docs/superpowers/specs/2026-10-04-help-guide-design.md`.

## Global Constraints

- Breakpoint: phone = `max-width: 640px`; reuse `isMobile` from `src/ui/formPopup.js`.
- Warm tokens: `--warm-tint #fbe9d2`, `--warm-accent #b5691b`, `--warm-border #f0cd9c` (already in `styles.css`).
- Wording: 「按」 not 「點擊」, 「畫面」 not 「介面」. Button chips use the label exactly as the source renders it.
- Web-only note text: 「此功能僅網頁版提供」, removed when `hosted` is true.
- Run tests with `npx vitest run tests/` (a bare run can pick up other worktrees' copies).

---

### Task 1: Home card 操作說明

**Files:**
- Modify: `src/ui/reportTypeSelectView.js`
- Modify: `src/styles.css` (after the `.type-select__option--neutral` rules)
- Test: `tests/reportTypeSelectView.test.js`

**Interfaces:**
- Produces: `renderReportTypeSelectView(container, { onSelectType, onManageChildren, onShowHelp })`; the card is `button[data-action="show-help"]`, the last child of `.type-select`.

- [ ] **Step 1: Failing test** — add to the `describe` in `tests/reportTypeSelectView.test.js`:

```js
  it('shows a 操作說明 card after 課程月計畫 that calls onShowHelp', async () => {
    const container = document.createElement('div');
    let called = false;
    await renderReportTypeSelectView(container, { onSelectType: () => {}, onShowHelp: () => { called = true; } });

    const cards = [...container.querySelectorAll('.type-select > button')];
    expect(cards.map(card => card.dataset.type || card.dataset.action)).toEqual([
      'assessment', 'parent-report', 'monthly-plan', 'show-help',
    ]);
    expect(cards[3].textContent).toContain('操作說明');
    cards[3].click();
    expect(called).toBe(true);
  });
```

- [ ] **Step 2:** `npx vitest run tests/reportTypeSelectView.test.js` → FAIL.

- [ ] **Step 3: Implement.** In `TYPE_SELECT_ICONS`'s neighbour `UTIL_ICONS`, add:

```js
  // open book with a question mark
  'show-help':
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5.5A1.5 1.5 0 0 1 3.5 4H9a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5h-6A1.5 1.5 0 0 1 2 16Z"/><path d="M22 5.5A1.5 1.5 0 0 0 20.5 4H15a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5h6A1.5 1.5 0 0 0 22 16Z"/><path d="M15.6 8.6a1.4 1.4 0 1 1 2 1.3c-.4.2-.6.5-.6.9v.3"/><path d="M17 13.4h.01"/></svg>',
```

Change the signature to `{ onSelectType, onManageChildren, onShowHelp }`, and after the
`TYPE_SELECT_OPTIONS.map(...).join('')}` inside `.type-select` add:

```js
        <button type="button" class="type-select__option type-select__option--warm" data-action="show-help">
          <span class="type-select__icon">${UTIL_ICONS['show-help']}</span>
          <span class="type-select__text">
            <span class="type-select__title">操作說明</span>
            <span class="type-select__desc">一步一步教你使用本系統</span>
          </span>
          <span class="type-select__go" aria-hidden="true">${CHEVRON}</span>
        </button>
```

Wire it: `container.querySelector('[data-action="show-help"]').addEventListener('click', () => onShowHelp?.());`
and change the `backToList` re-render to pass `{ onSelectType, onManageChildren, onShowHelp }`.

CSS:

```css
/* 操作說明 — the warm accent, a hue none of the form cards use. */
.type-select__option--warm {
  background: var(--warm-tint);
  border-color: var(--warm-tint);
}
.type-select__option--warm .type-select__icon {
  background: var(--surface);
  color: var(--warm-accent);
}
.type-select__option--warm:hover {
  border-color: var(--warm-accent);
  box-shadow: 0 12px 26px rgba(181, 105, 27, 0.22);
}
.type-select__option--warm:hover .type-select__go {
  color: var(--warm-accent);
}
```

- [ ] **Step 4:** `npx vitest run tests/reportTypeSelectView.test.js` → PASS.
- [ ] **Step 5:** commit `feat: 操作說明 card on the home screen`.

---

### Task 2: helpView + content skeleton + route

**Files:**
- Create: `src/ui/helpContent.js`, `src/ui/helpView.js`
- Modify: `src/app.js` (add `showHelp`, pass `onShowHelp`), `src/styles.css` (append `help-` rules)
- Test: `tests/helpView.test.js`, `tests/helpContent.test.js`

**Interfaces:**
- Consumes: `onShowHelp` from Task 1; `isMobile` from `src/ui/formPopup.js`.
- Produces: `HELP_CHAPTERS: Array<{ id: string, title: string, sections?: Array<{ id, title }>, html: string }>`;
  `renderHelpView(container, { onBack, hosted = false, chapterId = null, sectionId = null }) → Promise<void>`.
  Section headings in `html` are `<h3 class="help-section-title" id="help-section-${id}">`.

Behaviour of `renderHelpView`:
- Desktop: shows TOC (`nav.help-toc`) and the chapter (`article.help-chapter`); `chapterId` null → first chapter.
- Phone: `chapterId` null → TOC only; otherwise chapter only.
- TOC items are `button[data-chapter]` (sub-sections also carry `data-section`); the current chapter's button has `aria-current="true"`.
- Bottom of a chapter: `button[data-nav="prev"]` 「‹ 上一章」 (not on the first chapter) and `button[data-nav="next"]` 「下一章 ›」 (not on the last).
- Header ← 返回 is `button[data-action="back"]`: phone + chapter open → re-render TOC; otherwise `onBack()`.
- Switching re-renders via `renderHelpView(container, { ...same opts, chapterId, sectionId })`, then scrolls the section into view (`scrollIntoView?.()`) or the page to the top (`window.scrollTo?.(0, 0)` guarded with `typeof`).
- `hosted` true → every `.help-webonly` element removed.

- [ ] **Step 1: Failing tests.** `tests/helpContent.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { HELP_CHAPTERS } from '../src/ui/helpContent.js';

describe('HELP_CHAPTERS', () => {
  it('has the 8 chapters in order, with unique ids', () => {
    expect(HELP_CHAPTERS.map(c => c.title)).toEqual([
      '開始使用', '管理幼兒', '匯入舊的 Word 檔', '課程月計畫', '適性紀錄（家長版）', '適性總表', '資料保存', '常見問題',
    ]);
    expect(new Set(HELP_CHAPTERS.map(c => c.id)).size).toBe(8);
  });

  it('every listed section has a matching heading in its chapter', () => {
    for (const chapter of HELP_CHAPTERS) {
      for (const section of chapter.sections || []) {
        expect(chapter.html).toContain(`id="help-section-${section.id}"`);
      }
    }
  });
});
```

`tests/helpView.test.js` (desktop by default — jsdom has no `matchMedia`, so `isMobile()` is false; the phone case stubs it):

```js
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHelpView } from '../src/ui/helpView.js';
import { HELP_CHAPTERS } from '../src/ui/helpContent.js';

const phone = () => vi.stubGlobal('matchMedia', () => ({ matches: true }));
afterEach(() => vi.unstubAllGlobals());

describe('renderHelpView', () => {
  it('desktop: lists every chapter and opens the first', async () => {
    const container = document.createElement('div');
    await renderHelpView(container, { onBack: () => {} });
    const toc = [...container.querySelectorAll('.help-toc [data-chapter]:not([data-section])')];
    expect(toc.map(b => b.textContent.trim())).toEqual(HELP_CHAPTERS.map(c => c.title));
    expect(container.querySelector('.help-chapter h2').textContent).toBe(HELP_CHAPTERS[0].title);
    expect(toc[0].getAttribute('aria-current')).toBe('true');
  });

  it('choosing a chapter shows it', async () => {
    const container = document.createElement('div');
    await renderHelpView(container, { onBack: () => {} });
    container.querySelector(`[data-chapter="${HELP_CHAPTERS[3].id}"]`).click();
    await vi.waitFor(() => expect(container.querySelector('.help-chapter h2').textContent).toBe(HELP_CHAPTERS[3].title));
  });

  it('上一章／下一章 move between chapters, absent at the ends', async () => {
    const container = document.createElement('div');
    await renderHelpView(container, { onBack: () => {} });
    expect(container.querySelector('[data-nav="prev"]')).toBeNull();
    container.querySelector('[data-nav="next"]').click();
    await vi.waitFor(() => expect(container.querySelector('.help-chapter h2').textContent).toBe(HELP_CHAPTERS[1].title));
    container.querySelector('[data-nav="prev"]').click();
    await vi.waitFor(() => expect(container.querySelector('.help-chapter h2').textContent).toBe(HELP_CHAPTERS[0].title));

    const last = HELP_CHAPTERS.at(-1).id;
    await renderHelpView(container, { onBack: () => {}, chapterId: last });
    expect(container.querySelector('[data-nav="next"]')).toBeNull();
  });

  it('desktop ← 返回 calls onBack', async () => {
    const container = document.createElement('div');
    let backed = false;
    await renderHelpView(container, { onBack: () => { backed = true; } });
    container.querySelector('[data-action="back"]').click();
    expect(backed).toBe(true);
  });

  it('phone: TOC first, chapter alone, ← 返回 goes back to the TOC', async () => {
    phone();
    const container = document.createElement('div');
    let backed = false;
    await renderHelpView(container, { onBack: () => { backed = true; } });
    expect(container.querySelector('.help-chapter')).toBeNull();
    container.querySelector(`[data-chapter="${HELP_CHAPTERS[1].id}"]`).click();
    await vi.waitFor(() => expect(container.querySelector('.help-chapter')).not.toBeNull());
    expect(container.querySelector('.help-toc')).toBeNull();
    container.querySelector('[data-action="back"]').click();
    await vi.waitFor(() => expect(container.querySelector('.help-toc')).not.toBeNull());
    expect(backed).toBe(false);
  });

  it('keeps the 此功能僅網頁版提供 note only in the offline build', async () => {
    const id = HELP_CHAPTERS.find(c => c.html.includes('help-webonly')).id;
    const offline = document.createElement('div');
    await renderHelpView(offline, { onBack: () => {}, chapterId: id });
    expect(offline.textContent).toContain('此功能僅網頁版提供');
    const hosted = document.createElement('div');
    await renderHelpView(hosted, { onBack: () => {}, chapterId: id, hosted: true });
    expect(hosted.textContent).not.toContain('此功能僅網頁版提供');
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/helpView.test.js tests/helpContent.test.js` → FAIL (modules missing).

- [ ] **Step 3: `src/ui/helpContent.js`** — the 8 chapters with the ids `start`, `children`, `import`,
`monthly-plan`, `parent-report`, `assessment`, `backup`, `faq`; titles exactly as in the test.
`parent-report` lists sections `create`, `course-plan`, `copy-plan`, `records`, `highlights`,
`export`. `start` and `backup` contain a `<p class="help-webonly">此功能僅網頁版提供</p>` in their
web-only parts. Real wording is Task 3; here each chapter's `html` may be a one-paragraph stub
plus its section headings.

- [ ] **Step 4: `src/ui/helpView.js`:**

```js
import { HELP_CHAPTERS } from './helpContent.js';
import { headerButtonLabel } from './headerButtonLabel.js';
import { isMobile } from './formPopup.js';

// Content is static help text from helpContent.js — no user data — so it goes in as HTML.
export async function renderHelpView(container, { onBack, hosted = false, chapterId = null, sectionId = null }) {
  const phone = isMobile();
  const index = HELP_CHAPTERS.findIndex(chapter => chapter.id === chapterId);
  // Desktop always has a chapter open; a phone shows the table of contents until one is chosen.
  const current = index >= 0 ? index : phone ? -1 : 0;
  const chapter = HELP_CHAPTERS[current];
  const rerender = (nextChapterId, nextSectionId = null) =>
    renderHelpView(container, { onBack, hosted, chapterId: nextChapterId, sectionId: nextSectionId });

  const tocHtml = `
    <nav class="help-toc" aria-label="目錄">
      <ol class="help-toc__list">
        ${HELP_CHAPTERS.map(
          (item, i) => `
            <li>
              <button type="button" class="help-toc__item" data-chapter="${item.id}"${i === current ? ' aria-current="true"' : ''}>
                <span class="help-toc__num">${i + 1}</span>${item.title}
              </button>
              ${
                item.sections
                  ? `<ol class="help-toc__sub">${item.sections
                      .map(
                        section =>
                          `<li><button type="button" class="help-toc__subitem" data-chapter="${item.id}" data-section="${section.id}">${section.title}</button></li>`
                      )
                      .join('')}</ol>`
                  : ''
              }
            </li>`
        ).join('')}
      </ol>
    </nav>`;

  const chapterHtml = chapter
    ? `
    <article class="help-chapter">
      <h2 class="help-chapter__title"><span class="help-chapter__num">${current + 1}</span>${chapter.title}</h2>
      ${chapter.html}
      <div class="help-chapter__nav">
        ${current > 0 ? `<button type="button" class="btn btn--ghost" data-nav="prev">‹ 上一章</button>` : '<span></span>'}
        ${current < HELP_CHAPTERS.length - 1 ? `<button type="button" class="btn btn--ghost" data-nav="next">下一章 ›</button>` : ''}
      </div>
    </article>`
    : '';

  container.innerHTML = `
    <div class="page-header page-header--editor">
      <button type="button" class="btn btn--ghost" data-action="back">${headerButtonLabel(phone && chapter ? '← 返回目錄' : '← 返回首頁', '← 返回')}</button>
      <h2 class="page-header__title">操作說明</h2>
    </div>
    <div class="help-layout">
      ${phone && chapter ? '' : tocHtml}
      ${chapterHtml}
    </div>
  `;

  if (hosted) container.querySelectorAll('.help-webonly').forEach(note => note.remove());

  container.querySelector('[data-action="back"]').addEventListener('click', () => {
    if (phone && chapter) rerender(null);
    else onBack();
  });
  container.querySelectorAll('[data-chapter]').forEach(button =>
    button.addEventListener('click', () => rerender(button.dataset.chapter, button.dataset.section || null))
  );
  container.querySelector('[data-nav="prev"]')?.addEventListener('click', () => rerender(HELP_CHAPTERS[current - 1].id));
  container.querySelector('[data-nav="next"]')?.addEventListener('click', () => rerender(HELP_CHAPTERS[current + 1].id));

  const target = sectionId && container.querySelector(`#help-section-${sectionId}`);
  if (target) target.scrollIntoView?.({ block: 'start' });
  else if (chapterId && typeof window.scrollTo === 'function') window.scrollTo(0, 0);
}
```

(`isMobile` must be exported from `formPopup.js` — it already is.) If jsdom's `window.scrollTo`
logs "not implemented", guard with `try { ... } catch {}` rather than adding a stub.

- [ ] **Step 5: route in `src/app.js`.** Import `renderHelpView`; in `showReportTypeSelect`'s
options add `onShowHelp: showHelp`; add

```js
  function showHelp() {
    runView(() => renderHelpView(container, { onBack: showReportTypeSelect, hosted: Boolean(gate) }));
  }
```

- [ ] **Step 6: CSS** — append to `styles.css`:

```css
/* ── 操作說明 ─────────────────────────────────────────────── */
.help-layout {
  display: grid;
  grid-template-columns: 15rem minmax(0, 1fr);
  gap: 1.5rem;
  align-items: start;
}
.help-toc {
  position: sticky;
  top: 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 0.75rem;
}
.help-toc__list, .help-toc__sub { list-style: none; margin: 0; padding: 0; }
.help-toc__sub { margin: 0.15rem 0 0.35rem 2.1rem; }
.help-toc__item, .help-toc__subitem {
  display: flex; align-items: center; gap: 0.6rem; width: 100%;
  border: 0; background: none; font: inherit; color: var(--text-primary);
  text-align: left; cursor: pointer; border-radius: 10px;
}
.help-toc__item { padding: 0.55rem 0.6rem; font-weight: 600; }
.help-toc__subitem { padding: 0.3rem 0.6rem; font-size: 0.9rem; color: var(--text-secondary); }
.help-toc__item:hover, .help-toc__subitem:hover { background: var(--warm-tint); }
.help-toc__item[aria-current='true'] { background: var(--warm-tint); color: var(--warm-accent); }
.help-toc__num, .help-chapter__num {
  display: inline-grid; place-items: center; flex: none;
  width: 1.6rem; height: 1.6rem; border-radius: 50%;
  background: var(--warm-tint); color: var(--warm-accent); font-size: 0.85rem; font-weight: 700;
}
.help-toc__item[aria-current='true'] .help-toc__num { background: var(--warm-accent); color: #fff; }

.help-chapter {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1.5rem 1.75rem;
  animation: help-fade-in 0.25s ease-out;
}
@keyframes help-fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .help-chapter { animation: none; } }
.help-chapter__title { display: flex; align-items: center; gap: 0.6rem; margin: 0 0 0.75rem; font-size: 1.35rem; }
.help-chapter__num { width: 2rem; height: 2rem; font-size: 1rem; background: var(--warm-accent); color: #fff; }
.help-section-title { margin: 1.75rem 0 0.6rem; padding-top: 1.25rem; border-top: 1px dashed var(--border); font-size: 1.1rem; scroll-margin-top: 1rem; }
.help-intro { color: var(--text-secondary); margin: 0 0 1rem; line-height: 1.7; }
.help-chapter p, .help-chapter li { line-height: 1.75; }

.help-steps { list-style: none; counter-reset: help-step; margin: 0.5rem 0 1rem; padding: 0; display: grid; gap: 0.6rem; }
.help-steps > li {
  counter-increment: help-step; position: relative;
  padding: 0.75rem 1rem 0.75rem 3.25rem;
  background: var(--page-bg); border-radius: 12px;
}
.help-steps > li::before {
  content: counter(help-step); position: absolute; left: 0.85rem; top: 0.75rem;
  display: grid; place-items: center; width: 1.7rem; height: 1.7rem; border-radius: 50%;
  background: var(--brand); color: #fff; font-weight: 700; font-size: 0.9rem;
}

.help-chip {
  display: inline-block; padding: 0.05rem 0.6rem; margin: 0 0.1rem;
  border-radius: 999px; font-size: 0.88em; font-weight: 600; white-space: nowrap;
  border: 1px solid var(--border-strong); background: var(--surface); color: var(--text-primary);
  vertical-align: 0.05em;
}
.help-chip--primary { background: var(--brand); border-color: var(--brand); color: #fff; }
.help-chip--purple { background: var(--edit-tint); border-color: var(--edit-border); color: var(--edit-accent); }
.help-chip--rose { background: var(--domain-5-tint); border-color: var(--domain-5-tint); color: var(--domain-5-accent); }
.help-chip--brand { background: var(--brand-tint); border-color: var(--brand-tint); color: var(--brand-dark); }
.help-chip--green { background: var(--filled-tint); border-color: var(--filled-border); color: var(--filled-accent); }
.help-chip--danger { background: var(--delete-bg); border-color: var(--delete-bg); color: var(--delete-fg); }

.help-tip {
  margin: 1rem 0; padding: 0.75rem 1rem 0.75rem 2.6rem; position: relative;
  background: #fff7dc; border: 1px solid #f1dc9a; border-radius: 12px; color: #6b5310;
}
.help-tip::before { content: '💡'; position: absolute; left: 0.85rem; top: 0.7rem; }
.help-webonly {
  display: inline-block; margin: 0.25rem 0 0.75rem; padding: 0.2rem 0.7rem;
  border-radius: 999px; background: var(--neutral-tint); color: var(--text-secondary); font-size: 0.85rem;
}

.help-diagram {
  margin: 0.75rem 0 1.25rem; padding: 1rem; border: 1px dashed var(--border-strong);
  border-radius: 14px; background: var(--page-bg); display: grid; gap: 0.5rem;
  max-width: 26rem; font-size: 0.85rem;
}
.help-diagram__row { display: flex; gap: 0.5rem; }
.help-diagram__box {
  flex: 1; padding: 0.5rem 0.6rem; border-radius: 10px; text-align: center;
  background: var(--surface); border: 1px solid var(--border); color: var(--text-secondary);
}
.help-diagram__box--hl { outline: 2px solid var(--warm-accent); outline-offset: 2px; color: var(--text-primary); font-weight: 600; }
.help-diagram__caption { color: var(--text-muted); font-size: 0.8rem; text-align: center; }

.help-chapter__nav { display: flex; justify-content: space-between; margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border); }

.help-faq dt { font-weight: 700; margin-top: 1rem; }
.help-faq dd { margin: 0.25rem 0 0; color: var(--text-secondary); line-height: 1.75; }

@media (max-width: 640px) {
  .help-layout { grid-template-columns: 1fr; }
  .help-toc { position: static; }
  .help-chapter { padding: 1.1rem 1rem; border-radius: 14px; }
  .help-steps > li { padding-left: 3rem; }
}
```

Check the custom properties used here exist (`--surface`, `--domain-5-tint`, `--domain-5-accent`, `--neutral-tint`); if one doesn't, use the nearest existing token.

- [ ] **Step 7:** `npx vitest run tests/` → all PASS.
- [ ] **Step 8:** commit `feat: 操作說明 screen (table of contents + chapters)`.

---

### Task 3: Write the chapters

**Files:** Modify `src/ui/helpContent.js`.

Replace the stubs with the real text for the chapters listed in the spec, using only the
building blocks `help-intro`, `help-steps`, `help-chip(--variant)`, `help-tip`, `help-webonly`,
`help-diagram`, `help-faq`. Every chip label must match the label the source actually renders
(desktop label; mention the short phone label only where it differs a lot). Diagrams: the home
screen (in 開始使用) and the 適性紀錄 tab row (in 適性紀錄). No real child names — use 王小明.

- [ ] **Step 1:** write the content.
- [ ] **Step 2:** `npx vitest run tests/` → PASS (section ids still match).
- [ ] **Step 3:** commit `docs: 操作說明 chapter text`.

---

### Task 4: Verify in the real build + docs

- [ ] `npm run build`; drive `dist/TableC.html` with Playwright (`npm install --no-save playwright`) at 1280×800 and 390×844: unlock, home card visible under 課程月計畫, open 操作說明, switch chapters via TOC and 上一章／下一章, a sub-section link scrolls to it, ← 返回 (phone: to TOC, then home). Screenshot and look at each.
- [ ] `npm run build:web` and check `site/index.html` contains 「操作說明」.
- [ ] Add one line on 操作說明 to `CLAUDE.md`'s "What this project is" list; commit.
