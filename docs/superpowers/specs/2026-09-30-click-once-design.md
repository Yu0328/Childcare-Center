# One save per click (double-click guard) — design

## Problem

Every add / save / export / confirm button runs an async handler (an IndexedDB write, a docx build),
and nothing stops a second click while the first is still running. Checked in the real built app:
double-clicking 新增 on a child, a 總表, or a 總表 observation entry stores two identical records.
The same code shape is behind every other add button, the three import 確認匯入 buttons (a double
click imports the whole file twice) and 從適性紀錄彙整 (a double click merges every entry twice).

## Change

One shared wrapper, `oneAtATime(handler)` in `src/ui/oneAtATime.js`, applied to every async
click/submit handler that writes, exports or confirms:

- While a run is in flight, further clicks/submits on that handler are ignored (a submit is still
  `preventDefault`ed, so the page never navigates).
- The clicked button (for a form submit, the form's submit button) is greyed out (`disabled`) for
  the run and restored to its previous disabled state afterwards — restoring rather than forcing
  `false` keeps the backup buttons' password lock intact.
- Errors propagate unchanged; the guard releases in `finally`, so a failed save can be retried.

Covers: all add/新增 submits and saves, edit 儲存, delete ×, remove-photo, 匯出 Word, 匯出備份,
每月 export, 確認匯入 ×3, 彙整 (both steps), 選擇幼兒 save, and the sign-in buttons (no double popup).

## Left as is

- File-picker `change` handlers (匯入檔案, 匯入備份): picking a file isn't a click that repeats.
- The 月計畫 calendar cell taps: synchronous, and quick re-taps are handled by the stale-load check.
- Sync-only click handlers (open/close a form, cancel): nothing to repeat.
