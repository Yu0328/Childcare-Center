# UI polish, round 2

Follow-up to `2026-09-24-ui-visual-polish-design.md`, from a second visual review.

## Changes

- **匯出 Word** is `btn--purple` everywhere (總表, 適性紀錄, 月計畫 already was).
- **總表 editor, desktop (>640px)**: a tab bar (five domains + 備註) like 適性紀錄's, showing one domain card at a time with its indicators in an auto-fill grid. The active tab survives re-render (read from the old DOM before `innerHTML`). The active card is forced `open` because the tab hides its `<summary>`. Mobile keeps the stacked collapsible cards; the tab bar is hidden there.
- **適性發展紀錄 entries**: the referenced-indicator list gets a dashed divider below it; the narrative uses `white-space: pre-line` so its stored line breaks show as paragraphs.
- **總表 import preview**: the ○/△ mark sits next to its ROC date instead of floating before a dash; 「至」 lines up under the record-period column. On phones every `panel-form__row` becomes one column (the two-column row pushed the date dropdowns past the card edge).
- **Birthdate dropdowns**: years labelled in ROC (`113年`); option values stay Gregorian, so nothing stored changes.
- **月計畫 import preview**: existing-child options show a ROC birthdate. On submit, every blank name/birthdate box of an included new child is outlined red and the first is scrolled into view; editing a box clears its outline.
- **新 badge**: larger and bordered.
- **Status options** (已發展/發展中/請假/更換課程): pill toggles instead of bare radio buttons; the native radio stays in the DOM (visually hidden) for keyboard and tests.
- **Child list**: no fixed max-height (the last row was half cut off); the side add-child form is sticky instead.
