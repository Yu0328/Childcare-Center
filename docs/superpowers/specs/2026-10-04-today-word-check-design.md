# 匯出前檢查「今天」「今日」 — design

## Problem

Teachers write 適性紀錄 notes on the day, so 「今天」「今日」 read naturally then — but a parent
reading the exported Word file at month's end can't tell which day that was. Teachers want a
chance to fix those sentences before exporting.

## Change

The 適性紀錄 editor's 匯出 button scans the report's teacher-typed text for 「今天」 or 「今日」
first.

- **No match** → export exactly as today. No message, no popup.
- **Match** → don't export yet; open a popup listing every matching field for editing.

### Fields scanned

| 區塊 | Field | Saved via |
|---|---|---|
| 課程計畫表 | each CourseOccurrence's `note` (說明) | `updateCourseOccurrence(id, { note })` |
| 適性發展紀錄表 | each DevelopmentRecordEntry's `narrative` | `updateDevelopmentRecordEntry(id, { narrative })` |
| 行為觀察 | each BehaviorObservation's `title` and `narrative` | `updateBehaviorObservation(id, { title / narrative })` |
| 點滴分享 | each HighlightEntry's `caption` | `updateHighlightEntry(id, { caption })` |

Only what the teacher typed is scanned. Text the exporter adds itself (indicator reference lines,
section headings) is not. Words are fixed: `['今天', '今日']`, a plain substring match. 「昨天」
and similar words are deliberately not included.

### Scan logic (`src/domain/findTodayWords.js`, new)

`findTodayWords({ coursePlanEntries, courseOccurrencesByEntryId, developmentRecordEntries,
behaviorObservations, highlightEntries })` takes the same data `exportReport` already loads and
returns a list of hits, in tab order and then in the same order as the lists:

```js
{ kind: 'occurrence' | 'developmentRecord' | 'observationTitle' | 'observationNarrative' | 'highlight',
  id, label, text }
```

`label` is where the field came from, for display:
- 「課程計畫表｜<activityName>｜<date> 說明」
- 「適性發展紀錄表｜<domain>」
- 「行為觀察｜標題」 / 「行為觀察｜<title>｜內容」
- 「點滴分享｜照片說明」

Pure function, no DB access.

### Popup (`src/ui/parentReportEditorView.js` + a small new view file if it grows)

Reuses the existing `<dialog class="form-popup">` look and `lockBodyScroll`/`unlockBodyScroll`/
`closeOnBackdropClick` from `formPopup.js`. On desktop and mobile alike it opens with `showModal()`.

- Top line: 「以下內容含有『今天』或『今日』，可以在這裡修改」
- One block per hit: the `label`, then a text box holding the full original text. Titles use a
  one-line `<input>`; every other field uses a `<textarea>`.
- Three buttons:
  - **儲存並匯出**: save every changed field, then export and download as today.
  - **只儲存**: save every changed field, close, don't export.
  - **取消** (and ×, backdrop, Escape): save nothing, export nothing.
- Only fields whose text actually changed are written. Leaving a field as-is means keep it.
- Both save buttons are wrapped in `oneAtATime`. A save failure shows
  「儲存失敗，請再試一次」 inside the popup, which stays open (no partial export). An export
  failure after a successful save uses the existing `匯出失敗，請再試一次（…）` line.
- After either save button: re-render the editor (same as the tabs' `onChange`) so the current
  tab shows the saved text.

Because edits are saved back, an already-fixed field won't come up again on the next export.

### Look and feel

Must read as part of the same app, built only from existing classes and color tokens. No new
colors, no new button styles.

- **Window**: the existing `.form-popup` modal (same backdrop, rounded corners, × close button,
  85vh max height with its own scroll, body scroll locked). It's wider than the add-form popups,
  `min(92vw, 640px)` through one modifier class, because narratives are long. Phones keep the
  same 90vw width as the other popups.
- **Top line**: same size and color as the existing hint text (`--text-secondary`), not an
  error red. Nothing is wrong; the teacher is just being offered a fix.
- **Each hit**: one `.entry-form` card (light background, border, 10px radius), same as the tabs'
  編輯 forms. Inside it, `label` uses the `.panel-form__field` label style the edit forms already
  use, and the input or textarea inherits the existing focus style.
- **Buttons**, right-aligned in an `.entry-form__actions` row pinned to the bottom of the window
  so they stay reachable while the list scrolls:
  - 儲存並匯出: `btn btn--primary` (main action, same as every 儲存)
  - 只儲存: `btn btn--outline`
  - 取消: `btn btn--ghost`
  On phones the row wraps, and 儲存並匯出 stays first.
- **Check**: Playwright screenshots at desktop (1280px) and phone (390px) widths, compared side by
  side with an existing 編輯 popup. Shown to the user for approval before merging.

## Not doing

- Extra words (昨天, 明天, 剛剛…). Add them to the word list later if teachers ask.
- Highlighting the matched word inside the text box. A plain textarea can't, and the label plus
  top line already say what to look for.
- The same check on 總表 or 月計畫 exports.

## Testing

- `tests/findTodayWords.test.js`: every field kind with 今天 and with 今日, no-hit case, empty or
  missing fields, label text, ordering.
- Editor view test (jsdom + fake-indexeddb): no hit → downloads with no dialog; hit → dialog with the
  right blocks; 只儲存 writes only changed fields and doesn't download; 儲存並匯出 writes then
  downloads; 取消 writes nothing.
- Build `dist/TableC.html` and drive it with Playwright: a report with 今天 in two tabs, edit one,
  儲存並匯出, check the tab shows the new text and a second 匯出 downloads with no popup.
