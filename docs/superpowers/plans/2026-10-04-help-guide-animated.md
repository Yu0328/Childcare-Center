# 操作說明 — animated demos Implementation Plan

> Spec: `docs/superpowers/specs/2026-10-04-help-guide-design.md`, section "Revision 2".
> Executed inline (one person, content-heavy), task by task, tests first where there is logic.

**Goal:** Replace the static picture flows with prototype A's animated demos, a 手機版／電腦版
switch and collapsible chapters; add 實用技巧; fix 加到主畫面.

## Global Constraints

- Mode values: `'phone'` / `'desk'`; remembered under localStorage key `help-mode`; default `isMobile() ? 'phone' : 'desk'`.
- Labels in mini screens must match the app (desktop label in `desk`, `headerButtonLabel` short label in `phone`).
- Example names only: 王小明, 林小美.
- `prefers-reduced-motion`: demos start paused; no pulse.
- Tests: `npx vitest run tests/`.

### Task 1: `src/ui/helpMiniScreens.js` + `src/ui/helpDemo.js`

- Mini-screen pieces (pure string builders): `pick(m, desk, phone)`, `screen`, `bar`, `btn`, `cb`,
  `radio`, `field`, `tabs`, `main`, `aside`, `row`, `card`, `modal`, `toast`, `fab`, `file`,
  `menu`, `device(m, inner)`. A piece marked `hit` gets `data-hit` (the thing the pointer presses).
- `mountDemo(el, demo, { mode, reduced })` → `{ destroy() }`. Renders title, lead, device stage,
  播放／暫停, step dots, numbered caption list, note. Plays only while ≥35% visible
  (IntersectionObserver; none in jsdom → never autoplays). Loop stops when `el` is disconnected
  or `destroy()` is called. A step with `point: true` moves the pointer without tapping.
- Test `tests/helpDemo.test.js`: renders one caption per step for the given mode; first frame
  shown; clicking step 3's dot marks it current and draws step 3; `destroy` leaves no timer running.

### Task 2: `src/ui/helpView.js` rewrite

- `renderHelpView(container, { onBack, hosted = false })`. Header: ← 返回首頁 (phone ← 返回),
  title, `.help-seg` radiogroup 手機版／電腦版. Chapters: `<section class="help-ch">` with a
  header button (`aria-expanded`, `aria-controls`), app icon in its tone, title + desc, chevron;
  panel holds intro, one `.help-demo` per demo (hidden when `demo.modes` excludes the mode),
  extra html. First chapter open. Switching mode re-mounts demos in place (no full re-render).
- `reportTypeSelectView.js` exports `TYPE_SELECT_ICONS` and `UTIL_ICONS`.
- Tests rewrite `tests/helpView.test.js`: all titles; only first open; header toggles;
  switch changes `data-mode` + captions and is remembered; default from `matchMedia`;
  phone-only demo hidden in desk; ← 返回 → `onBack`; web-only note offline only.

### Task 3: `src/ui/helpContent.js`

`HELP_CHAPTERS: [{ id, title, desc, icon, tone, intro?, demos: [{ id, title, lead?, note?, modes?, webOnly?, steps: [{ cap, draw, point? }] }], html? }]`.
Chapters: 開始使用, 管理幼兒, 匯入舊的 Word 檔, 課程月計畫, 適性紀錄（家長版）, 適性總表, 實用技巧,
資料保存, 常見問題. Test `tests/helpContent.test.js`: order/ids; every step draws non-empty html
and has a caption in both modes.

### Task 4: CSS + verification + docs

Port prototype CSS into `styles.css` under `help-`/`ms-` names using the app's tokens; remove the
old `help-flow`/`help-shot`/`help-ui-*`/`help-toc` rules. Phone frame 320px wide on desktop.
Build; Playwright at 1280×800 and 390×844 in both modes: open chapters, let a demo play a full
loop, switch mode mid-play, no console errors, no horizontal overflow; screenshot and review.
Update CLAUDE.md's 操作說明 line. Commit, fast-forward push, watch deploy.
