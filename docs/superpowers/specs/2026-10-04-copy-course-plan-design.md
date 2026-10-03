# 套用其他幼兒課程計畫 — design

## Problem

Several children in the same class often get the exact same monthly 課程計畫表 in their 適性紀錄
(same activities, same indicators, same dates). Today a teacher re-enters it by hand for each child.

## Change

A button on the 課程計畫表 tab that replaces the current report's course plan with a copy of another
child's, for the same tier and the same month.

### UI (`src/ui/courseplanTabView.js`)

- Button above the course plan: 「套用其他幼兒課程計畫」 on desktop, 「套用」 on mobile, via the
  existing `headerButtonLabel(full, short)` helper.
- Clicking it opens a small picker listing every *other* ParentReport whose `tier` and `period`
  equal the current report's and that has at least one CoursePlanEntry, shown as
  「幼兒姓名（N 筆）」. A child with two such reports gets two lines. The current report is never
  listed.
- No candidates → the picker shows 「沒有同年齡層、同月份的其他幼兒課程計畫可以套用」.
- Picking one shows a confirm (same `confirm`-style injection the tab already uses for deletes):

  > 目前這份的 M 筆課程計畫，會換成「姓名」的 N 筆課程計畫。
  > 發展狀況（○／△）、請假、更換課程不會套用，請再逐筆填寫。
  > 有 K 段發展紀錄的對應課程會被取消勾選。  ← only when K > 0
  > 確定要套用嗎？

  (When the current report has 0 entries the first line drops the 「目前這份的 M 筆…會」 part:
  「會套用「姓名」的 N 筆課程計畫。」)
- The confirm-and-apply handler is wrapped in `oneAtATime` like every other write button.
- After applying: `onChange()` so the tab (and the 適性發展紀錄表 tab) re-render.

### Copy logic (`src/domain/copyCoursePlan.js`, new)

`copyCoursePlan({ targetReportId, sourceReportId })` and a dry-run helper the UI uses to fill in
M / N / K for the confirm text. Steps, in this order (copy before delete, so an interruption leaves
duplicates rather than lost data):

1. **Copy.** For each source CoursePlanEntry: new entry on the target with the same `indicatorCode`,
   `activityName`, `indicatorText`. For each of its CourseOccurrences: new occurrence with the same
   `date` and `note`; `status` = `'developed'` (○, the add form's default), `absent` = false,
   `courseChanged` = false. Fresh `uid`/`createdAt` — these are new records, not shared ones.
   Entries keep the source's relative order (create them in source order).
2. **Re-link 適性發展紀錄表.** For each of the target's DevelopmentRecordEntries, map each id in
   `courseEntryIds` to the new entry with the same `indicatorCode` + `activityName` (first match);
   drop ids with no match; dedupe. Only write records whose list actually changed. K = number of
   records that lost at least one id.
3. **Delete** the target's original CoursePlanEntries via the existing `deleteCoursePlanEntry`
   (cascades occurrences and leaves sync tombstones as usual).

Nothing on the source report is modified. 行為觀察, 點滴分享, and the 適性發展紀錄表 narratives
are untouched.

## Not doing

- Copying ○／△, 請假, 更換課程 — those are per-child.
- Other months or other tiers — dates/indicators would be wrong.
- Merging (keep existing + add missing) — "make it the same" means replace.
- An "unfilled" status — status stays ○／△ only; teachers flip ○→△ where needed.

## Testing

- `tests/copyCoursePlan.test.js` (vitest + fake-indexeddb): copied fields, reset fields, source
  untouched, old entries/occurrences gone, development-record re-link (match, no-match drop, dedupe,
  K count), empty target.
- Tab test: candidate list filters by tier + period, excludes the current report and empty ones;
  cancel on confirm changes nothing.
- Build `dist/TableC.html` and drive it with Playwright: two children, same tier/month, apply,
  check the result and the 適性發展紀錄表 tab.
