# 套用其他幼兒課程計畫 — header button + popup panel — design

Follow-up to `2026-10-04-copy-course-plan-design.md`. The feature works; this changes only where
the button sits and how the child is picked.

## Problem

The button is a small outline pill above the 課程計畫表 with the candidates as a second row of
pills beside it. It should look like the 匯出 Word button and sit next to it, and picking a child
should feel like the 課程月計畫 editor's 管理幼兒 panel.

## Change

### Header button (`src/ui/parentReportEditorView.js`)

- On the 課程計畫表 tab only, the header's right side becomes a `.page-header__actions` group:
  `[套用其他幼兒課程計畫] [匯出 Word]`, both `btn btn--purple`, labels via
  `headerButtonLabel('套用其他幼兒課程計畫', '套用')` / the existing `('匯出 Word', '匯出')` —
  same pattern as `monthlyPlanEditorView.js`'s 管理幼兒 + 匯出 Word.
- Other three tabs: header unchanged (匯出 Word only).
- The editor passes the button element to the panel module (below); the tab view no longer knows
  about copying.

### Panel (`src/ui/copyCoursePlanPanel.js`, new)

`renderCopyCoursePlanPanel(host, { trigger, report, onChange, confirmCopy })` — renders a
`<dialog class="form-popup">` (via `nestedEntryFormDialog(html, true)`, so it pops up centered on
desktop too — the tab's right column is taken by 新增課程計畫項目) and wires it to `trigger` with
`wireNestedEntryForm`. `confirmCopy` defaults to `window.confirm` (injectable for tests).

Contents, same `panel-form` styling as 管理幼兒:

- Title 「套用其他幼兒課程計畫」.
- One radio per candidate from `findCopySources(report)`: 「林小明（2 筆）」. None selected at
  first; 套用 is disabled until one is picked.
- Buttons 「套用」 (primary) + 「取消」 (outline; closes the dialog).
- No candidates → 「沒有同年齡層、同月份的其他幼兒課程計畫可以套用」 and a single 「關閉」 button.
- 套用 (wrapped in `oneAtATime`): `planCoursePlanCopy` → the existing confirm text (moved
  unchanged from `courseplanTabView.js`'s `copyConfirmMessage`) → if confirmed,
  `copyCoursePlan`, close the dialog, `onChange()`. If cancelled, the panel stays open.
  Failure → 「套用失敗，請再試一次」 in the panel's error line.

### Removed

From `courseplanTabView.js`: the `.copy-plan` row, its wiring, `copyConfirmMessage`, and the
`headerButtonLabel` / `copyCoursePlan.js` imports. From `styles.css`: the `.copy-plan*` rules.
`src/domain/copyCoursePlan.js` is untouched.

## Testing

- `tests/copyCoursePlanPanel.test.js`: candidate radios + counts; empty message + 關閉 only;
  套用 disabled until a radio is picked; confirm text; cancel keeps data and the dialog open;
  confirm replaces the plan, closes, calls `onChange`; double click runs one copy. (The copy tests
  move here from `courseplanTabView.test.js`.)
- `tests/parentReportEditorView.test.js`: the 套用 button is in the header on the 課程計畫表 tab
  and absent on the other tabs.
- `npm run build` + Playwright: header at desktop width and 390px (「套用」「匯出」 side by side,
  「← 返回」 on the left), open the panel, pick, confirm, result correct.
