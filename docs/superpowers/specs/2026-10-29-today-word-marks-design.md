# 匯出前檢查：「今天」「今日」標紅底 — design

## Problem

The 匯出前 check popup (`src/ui/todayWordCheckPopup.js`, see `2026-10-04-today-word-check-design.md`)
lists every field holding 今天／今日, but inside a long narrative the teacher still has to hunt for
the word itself.

## Change

Inside each of the popup's fields, every 今天／今日 gets a light-red background, like a
highlighter stroke. The text stays the field's own black text — only the background is drawn.
The marks follow typing live: reword a 今天 and its mark disappears at once, so a field with no
marks left is a field that's done.

- A `<textarea>`/`<input>` can't color part of its text, so each field sits on top of a mirror
  layer (`aria-hidden`) holding the same text with `<mark>` around each hit, text transparent.
  The field's own background is transparent so the marks show through.
- The mirror copies the field's padding, border width, font, line-height and wrapping, and follows
  the field's scroll position (textarea vertical, the 行為觀察 標題's single-line input horizontal).
- Rejected: a separate read-only preview above each field (takes twice the room); red text
  instead of red background (a slightly misaligned mirror would garble the text; a misaligned
  background only shifts a colored box).
- Nothing else changes: which fields are scanned, when the popup opens, its buttons and saving.

## Testing

- vitest: marks appear for each hit and disappear after the field is edited.
- Playwright on `dist/TableC.html`, desktop and phone width: marks line up with the words,
  including a long, wrapping, scrolling narrative.
- Safari 15 (the MacBook Air) can't be tested here — the user checks it there.
