# 匯出前檢查標紅底 — plan

Spec: `docs/superpowers/specs/2026-10-29-today-word-marks-design.md`

1. **Test first** — `tests/parentReportEditorView.test.js`'s 今天 check block: the popup shows one
   `<mark>` per hit; after typing over a field (input event) its marks are gone.
2. **Shared word list** — export `TODAY_WORDS` from `src/domain/findTodayWords.js` so the popup
   marks exactly the words the scan finds.
3. **Popup** — `todayWordCheckPopup.js`: wrap each field in `.today-check__field` with a
   `.today-check__marks` mirror before it; on `input` re-render the mirror, on `scroll` copy
   scrollTop/scrollLeft.
4. **CSS** — `styles.css` next to `.today-check__*`: mirror absolutely fills the wrapper with the
   field's padding/border/font/line-height, transparent text, `pre-wrap` (input: `pre`); field
   background transparent (also on focus), wrapper carries the background.
5. **Verify** — `npx vitest run tests/`, `npm run build`, Playwright screenshots desktop + phone.
