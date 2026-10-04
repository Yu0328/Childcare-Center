# 操作說明 (in-app user guide) — design

## Problem

Teachers learn the app by asking whoever set it up. There is no written guide, and the app has
grown (適性紀錄's four tabs, 彙整, 套用其他幼兒課程計畫, backup, Google sync…). A teacher who forgot
how a feature works has nowhere to look.

## Decisions (from discussion with the user)

- **A browsable manual, not a guided tour.** Teachers come to look something up; a table of
  contents is the fastest way to find it, and a manual doesn't break every time a button moves.
- **No screenshots.** Steps are text; every button mentioned is drawn as a small chip that looks
  like the real button (same color/shape). A few spots that are hard to find get a simplified
  CSS-drawn diagram (outlines + button positions only, no content — so no PII, tiny size).
- **Entry: a 4th big card on the home screen**, directly under 課程月計畫, same
  `type-select__option` style, warm orange (`--warm-*` tokens, unused by any home card):
  title 「操作說明」, desc 「一步一步教你使用本系統」, icon an open book with a question mark.
- **An in-app screen**, not a separate page — so the offline `TableC.html` has it too, it works
  with no network, and ← 返回 / the phone back gesture work like every other screen.
- **No search.** Eight chapters fit in a table of contents.
- **Web-only features are listed in both builds.** In the offline build their chapter/section
  carries a note 「此功能僅網頁版提供」 rather than being hidden, so teachers know it exists.
- Plain words, no jargon: 「按」 not 「點擊」, 「畫面」 not 「介面」.

## Chapters

1. 開始使用 — what each home-screen card does (diagram); 加到主畫面 for phone (iPhone Safari
   分享→加入主畫面, Android Chrome ⋮→加到主畫面) and computer (Chrome/Edge address-bar install
   icon → 安裝; offline build: keep `TableC.html` on the desktop and open it by double-click).
2. 管理幼兒 — add (name, birthdate), delete.
3. 匯入舊的 Word 檔 — 匯入檔案 on home (any of the three kinds, several files at once), preview,
   confirm.
4. 課程月計畫 — create, fill weeks/days, 請假／其他活動代替, export Word.
5. 適性紀錄（家長版）— sub-sections: 建立一份適性紀錄; 課程計畫表 (指標, 指標所屬年齡層, dates,
   ○／△, 請假／更換課程); 套用其他幼兒課程計畫; 適性發展紀錄、行為觀察; 點滴分享; 匯出 Word (incl.
   the 今天／今日 check). Diagram of the four tabs.
6. 適性總表 — create (tier auto-suggested, can change), entries, 彙整 from 適性紀錄 (new or merge
   into existing), export Word.
7. 資料保存 — 匯出備份／匯入備份 (匯入 replaces everything; back up before changing computer or
   clearing the browser; the file holds personal data — don't put it on a shared drive);
   Google 帳號同步 (web only).
8. 常見問題 — short Q&A (data gone, where the Word file went, phone vs computer data).

Exact button labels come from the current source, not memory.

## Layout

- **Desktop (wider than 640px — the app's existing breakpoint; reuse `isMobile` from `formPopup.js`):** `page-header` with ← 返回 and title
  「操作說明」; below it two columns — a sticky table of contents on the left (chapters, with
  適性紀錄's sub-sections indented), the open chapter on the right. The current chapter is
  highlighted in the TOC. Switching chapters fades the content in (skipped under
  `prefers-reduced-motion`).
- **Phone:** the screen first shows the TOC as a list; tapping a chapter shows only that chapter,
  with ‹ 上一章 ／ 下一章 › at the bottom. ← 返回 from a chapter goes back to the TOC; from the TOC,
  to home. (The back gesture follows ← 返回 automatically via app.js's existing wiring.)
- Desktop also gets 上一章／下一章 at the bottom of each chapter, so it can be read straight through.

## Content building blocks (CSS classes in `styles.css`, prefix `help-`)

- intro sentence (`help-intro`)
- numbered step cards (`help-steps` — an `<ol>`, the number drawn as a filled circle)
- button chips (`help-chip`, with modifiers matching real buttons: purple, primary, ghost, rose…)
- 小提醒 box (`help-tip`, warm yellow)
- 「此功能僅網頁版提供」 note (`help-webonly`), shown only in the offline build
- small diagrams (`help-diagram`) built from divs, e.g. the home cards, the 適性紀錄 tab row

## Code

- `src/ui/helpContent.js` (new): `HELP_CHAPTERS` — array of `{ id, title, sections?, webOnly?,
  html }`; `html` is a static string using the classes above. Pure data, no logic.
- `src/ui/helpView.js` (new): `renderHelpView(container, { onBack, hosted, chapterId })`.
  Renders TOC + chapter, handles chapter switching, phone/desktop difference via CSS
  (`isMobile()` only to decide whether ← 返回 goes to the TOC or home). Content is trusted static
  HTML (no user data), so no escaping concerns.
- `src/ui/reportTypeSelectView.js`: add the card (an `onShowHelp` callback).
- `src/app.js`: `showHelp()` route, `hosted: Boolean(gate)` passed through.
- `src/styles.css`: `.type-select__option--warm` + the `help-` rules.

## Testing

- `tests/helpView.test.js`: TOC lists all 8 chapters; choosing one shows its title and content;
  上一章／下一章 move between chapters (no 上一章 on the first, no 下一章 on the last); ← 返回 calls
  `onBack`; web-only note present when `hosted: false`, absent when `true`.
- `tests/reportTypeSelectView.test.js`: the 操作說明 card exists after 課程月計畫 and calls
  `onShowHelp`.
- A content check: every chip label in `HELP_CHAPTERS` that names a button should exist in the
  source (done once by hand during writing, not a test).
- `npm run build` + Playwright on `dist/TableC.html`: home card at desktop and 390px, open the
  guide, switch chapters, 上一章／下一章, ← 返回, screenshots reviewed for looks.

## Revision — graphical, shorter (2026-10-04, after first use)

Feedback: too wordy to scan, too many 小提醒, should be understandable at a glance.

- **Each task is a picture flow**, not a numbered text list: 2–4 small drawn screens in a row
  joined by arrows (stacked with ↓ on a phone). Each mini screen is a simplified wireframe of
  the real screen (title bar, the relevant buttons/fields only) with the button to press ringed
  in warm orange and a numbered badge. Under it, one caption of at most ~12 characters
  (「按 管理幼兒」).
- Mini-screen pieces are tiny helpers in `helpContent.js` (`shot`, `btn`, `field`, …) emitting
  `help-shot`/`help-ui-*` markup; `flow([...])` lays them out. Still CSS-only, no images.
- **小提醒 only where data can be lost**: names/birthdates can't be edited; typed text is lost
  without 新增／儲存; 匯入備份 replaces everything; back up before changing computer. Everything
  else is cut.
- Intro sentences shrink to one short line or go away. 常見問題 keeps 4 short Q&A.
- The numbered text-step and old diagram styles (`help-steps`, `help-diagram`) are removed.
