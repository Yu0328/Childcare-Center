# 點滴分享：分開描述＋拖移換照片順序 — design

## Problem

A 點滴分享 entry holds 1–3 photos and exactly one 描述. In Word the 描述 sits in one full-width
cell under the photo row (`highlightEntryRows`, `src/export/parentReportDocxExport.js`). Teachers
sometimes want one description for two of the photos and another for the third, each centered
under its own photos. Photo order also can't be changed — the only way is to delete and re-upload.

## Change (as agreed with the user)

1. **Default unchanged**: one 描述 box, whatever the photo count. Nothing to choose.
2. **「分開描述」 button** beside the 描述 box, shown only with 2+ photos. Tapping it:
   - 3 photos → shows the arrangement buttons, each with a small drawing:
     `▢▢│▢ 前二＋後一`, `▢│▢▢ 前一＋後二`, `▢│▢│▢ 各自描述`. None preselected until tapped;
     one tap picks it and shows that many 描述 boxes.
   - 2 photos → only one possible split, so it goes straight to two boxes.
   - Each box is labelled with the photos it belongs to (small thumbnails of those photos, plus
     「第 1、2 張」 text), so the teacher sees which text goes where.
   - A 「改回一段描述」 button joins the parts, in order, with a line break into the single box —
     no text is lost.
   - Switching arrangement (e.g. 前二＋後一 → 前一＋後二) keeps the boxes' text by position: the
     first box's text stays in the first box.
   - Every box is required, as the single box is today.
3. **Word export**: the caption row becomes one cell per group, each spanning its photos' grid
   columns (the table already uses a 6-column grid — a 3-photo row is 2+2+2, so 前二＋後一 is a
   4+2 caption row; a 2-photo row is 3+3). Each part keeps the table's normal line between it and
   the next (first built borderless; the user asked for the line back), and each text wraps and
   centers inside its own part. A long text
   simply makes the row taller (both cells share the row height).
4. **拖移換照片順序**: press and drag a photo onto another photo's place to swap them — mouse drag
   on a computer, press-and-hold then drag on a phone (pointer events, not the HTML drag-and-drop
   the upload slots already use for dropping files from the computer; the two must both keep
   working, and a drag must not open the file picker). Works in the 新增 form and in an existing
   entry's 編輯 form.
5. **Descriptions follow position, not photos**: the arrangement stays, say, 前二＋後一 after a
   drag; the thumbnails labelling each box update at once to show the new pairing.
6. Both 新增 and 編輯 support 分開描述 and dragging, so a teacher who decides later doesn't have to
   delete and redo the entry. The 編輯 form gains the entry's photo row (draggable) above the
   描述 area; save writes the new order and descriptions together.

## Data

A highlight entry keeps `caption` (string) and gains one optional field:

- `captionGroups: [{ size, text }]` — present only when split. `size`s are the group's photo
  counts left to right and sum to `photos.length` (`[2,1]`, `[1,2]`, `[1,1,1]`, `[1,1]`).
- When `captionGroups` is present it is the source of truth, and `caption` is always written as
  the texts joined by `\n`. That keeps every existing reader working unchanged — the entry list's
  delete confirm and aria labels, sync's natural key (`syncStores.js`), the conflict screen, an
  older open copy of the app that hasn't reloaded yet, and backups restored into one.
- One small domain module (`src/domain/highlightCaptions.js`) owns the rules, so the UI, popup,
  importer and storage never hand-roll them:
  - `splitCaption(text, sizes)` / `joinCaption(groups)` — building and undoing a split.
  - `withCaptionGroups(groups)` → `{ caption, captionGroups }` for 2+ groups, or just
    `{ caption }` for one — the one way any code writes captions. Going back to a single caption
    deletes the `captionGroups` field from the record (never stores `null`/`[]`).
  - `captionGroupsAfterRemovingPhoto(groups, index)` — see below.
- Old entries have no `captionGroups` and behave exactly as today.

**Removing a photo from a split entry** (the × on a saved thumbnail): the group holding that
photo shrinks by one. A group that reaches 0 photos has its text appended (new line) to the
previous group's text, or the next one's if it was first. If only one group is left, the entry
goes back to a single `caption`. Text is never dropped.

**Reordering saved photos** happens only inside the 編輯 form and is written on 儲存, together
with the descriptions, as the `photos` array in its new order (取消 discards it). The thumbnails
on the list card stay non-draggable; their × still removes a photo at once, as today.

**新增 form with an empty slot in between** (e.g. slots 1 and 3 filled): the arrangement counts
the filled photos left to right, ignoring empty slots — the same order they are saved in. Sync merges `photos` as a union by
`photoUid` in the local side's order, so a reorder on one device survives a merge; two devices
reordering differently at once end with one device's order — acceptable, nothing is lost.
`captionGroups` is a normal field in the three-way merge; the conflict screen labels it
「分開描述」 and shows its texts (not 「2 項」).

## Other places that read captions

- **今天／今日 check** (`findTodayWords.js`, `todayWordCheckPopup.js`): a split entry reports one
  hit per part that contains the word (label 「點滴分享｜照片說明（第 1、2 張）」), and saving a
  reworded part goes through `withCaptionGroups`, so `caption` stays in step.
- **Entry list card**: a split entry shows its parts under the thumbnails, each under its own
  photos (same grouping as Word), instead of the single caption line.
- **Backup**: export already writes whole records; import (`importParentReports` in `backup.js`)
  lists fields explicitly and must pass `captionGroups` through.
- **Word import** (`extractHighlightPhotoGroups`): a caption row with several text cells is read
  as a split — each cell's `gridSpan` divided by the photo cells' span gives its group `size`. If
  the sizes don't add up to the photo count, fall back to one caption (texts joined by line
  breaks). Real sample files (one merged caption cell) parse exactly as today.
- **Import preview** and copying a report's course plan don't touch highlights beyond passing the
  record through.
- **操作說明 demo** (`helpContent.js` 點滴分享 task): add steps for 「分開描述」 → pick
  `▢▢│▢` → two boxes, and one for dragging a photo; phone mode uses the same labels.

## Testing

- Unit: `highlightCaptions.js` rules (split, join, switch arrangement, remove photo from each
  group position, back to single).
- Export: a split entry's caption row has the right cell spans and the normal lines between them; a non-split
  entry's XML is unchanged.
- Round trip (CLAUDE.md standard): real sample file → import → export → re-import compares equal;
  plus an app-made entry for each arrangement → export → import → same `captionGroups`.
- Backup export → import keeps `captionGroups`; sync merge test for reorder + caption edit on
  different devices.
- UI: build `dist/TableC.html` and drive it with Playwright — 分開描述 on 2 and 3 photos, switch
  arrangement, 改回一段描述, drag to swap in 新增 and 編輯 (mouse and touch), file drop onto a
  slot still works, export opens with the expected layout.

## Out of scope

- Groups of non-adjacent photos (reorder first instead).
- More than 3 photos per entry.
