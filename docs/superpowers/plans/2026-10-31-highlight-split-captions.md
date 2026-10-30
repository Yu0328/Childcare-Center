# 點滴分享 分開描述＋拖移換照片順序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a 點滴分享 entry carry one description per photo group (前二＋後一／前一＋後二／各自描述), printed centered under its own photos in Word as one borderless-looking row, and let teachers drag photos to reorder them.

**Architecture:** A pure domain module (`src/domain/highlightCaptions.js`) owns the `captionGroups` rules; storage, export, import, the 今天 check and the UI all go through it. `caption` always stays the joined text so every older reader keeps working. The UI gets two small focused modules — a caption editor and a pointer-event drag-to-swap — wired into `highlightsTabView.js` for both 新增 and 編輯.

**Tech Stack:** vanilla JS, IndexedDB, `docx` 9.7.1, vitest + jsdom + fake-indexeddb, Playwright for UI check.

Spec: `docs/superpowers/specs/2026-10-31-highlight-split-captions-design.md`.

## Global Constraints

- `captionGroups: [{ size, text }]` only when split (2+ groups); sizes sum to `photos.length`. Back to one caption = the field is deleted, never `null`/`[]`.
- `caption` is always `texts.join('\n')` (empty parts skipped) when split.
- Any `captionGroups` that doesn't fit the entry's photos (`validCaptionGroups` → `null`) is read as one caption — never throws.
- Non-split entries: export XML, import result, UI, backup are byte-for-byte/field-for-field unchanged.
- UI wording (exact): 「分開描述」「改回一段描述」「前二＋後一」「前一＋後二」「各自描述」, box labels 「第 1、2 張」.
- Run tests as `npx vitest run tests/` (worktree copies). Under full-suite load a few unrelated UI tests time out at 5s; re-run those files alone before calling anything a failure.

---

### Task 1: Domain rules — `src/domain/highlightCaptions.js`

**Files:** Create `src/domain/highlightCaptions.js`, `tests/highlightCaptions.test.js`

**Produces:** `ARRANGEMENTS`, `validCaptionGroups(entry)`, `joinCaption(groups)`, `captionFields(groups)`, `arrangeCaption(texts, sizes)`, `captionGroupsAfterRemovingPhoto(groups, photoIndex)`, `groupPhotoLabels(sizes)`.

- [ ] Write tests: valid/invalid groups (sum mismatch, 1 group, bad size, missing), join skips blank parts, `captionFields` for 1 group → `{ caption }` only and 2+ → both fields, `arrangeCaption` keeps texts by position and folds extra texts into the last box, removing a photo from each position (shrink; emptied middle/last group joins previous; emptied first group joins next, text first), `groupPhotoLabels([2,1])` → `['第 1、2 張','第 3 張']`.
- [ ] Run, see fail; implement:

```js
export const ARRANGEMENTS = { 2: [[1, 1]], 3: [[2, 1], [1, 2], [1, 1, 1]] };

export function validCaptionGroups(entry) {
  const groups = entry.captionGroups;
  if (!Array.isArray(groups) || groups.length < 2) return null;
  const wellFormed = groups.every(g => g && Number.isInteger(g.size) && g.size >= 1 && typeof g.text === 'string');
  return wellFormed && groups.reduce((sum, g) => sum + g.size, 0) === (entry.photos || []).length ? groups : null;
}

const joinTexts = texts => texts.filter(text => text.trim()).join('\n');
export const joinCaption = groups => joinTexts(groups.map(g => g.text));

export function captionFields(groups) {
  if (groups.length < 2) return { caption: groups[0] ? groups[0].text : '' };
  return { caption: joinCaption(groups), captionGroups: groups.map(({ size, text }) => ({ size, text })) };
}

export function arrangeCaption(texts, sizes) {
  const groups = sizes.map((size, i) => ({ size, text: texts[i] ?? '' }));
  const last = groups[groups.length - 1];
  last.text = joinTexts([last.text, ...texts.slice(sizes.length)]);
  return groups;
}

export function captionGroupsAfterRemovingPhoto(groups, photoIndex) {
  const next = groups.map(g => ({ ...g }));
  let end = 0;
  const at = next.findIndex(g => photoIndex < (end += g.size));
  next[at].size -= 1;
  if (next[at].size > 0) return next;
  const [emptied] = next.splice(at, 1);
  if (at > 0) next[at - 1].text = joinTexts([next[at - 1].text, emptied.text]);
  else next[0].text = joinTexts([emptied.text, next[0].text]);
  return next;
}

export function groupPhotoLabels(sizes) {
  let n = 0;
  return sizes.map(size => `第 ${Array.from({ length: size }, () => ++n).join('、')} 張`);
}
```

- [ ] Tests pass; commit `feat: 點滴分享分開描述的規則`.

### Task 2: Storage — `parentReportDb.js`, `backup.js`

**Files:** Modify `src/storage/parentReportDb.js`, `src/storage/backup.js`; Test `tests/parentReportDb.test.js`, `tests/backup.test.js`

**Produces:** `addHighlightEntry({ ..., captionGroups })`; `saveHighlightEdit(id, { photoOrder, fields })` (photoOrder = stored indexes in new order; stored photos not listed keep their order at the end; `fields` from `captionFields`); `updateHighlightCaptionPart(id, partIndex, text)`; `removeHighlightPhoto` keeps groups in step.

- [ ] Tests: add with/without captionGroups (no key when absent); saveHighlightEdit reorders stored photos and drops `captionGroups` when `fields` has none; updateHighlightCaptionPart rewrites both `captionGroups[i].text` and `caption`; removeHighlightPhoto on a `[2,1]` entry removing index 2 → no `captionGroups`, caption = both texts; backup export→import keeps `captionGroups`.
- [ ] Implement:

```js
// captionGroups is dropped, never nulled, when an entry goes back to one description — see highlightCaptions.js.
function withCaptionFields(record, fields) {
  const { captionGroups, ...rest } = record;
  return { ...rest, ...fields };
}
```
`addHighlightEntry` spreads `...(captionGroups ? { captionGroups } : {})`. `removeHighlightPhoto`: `const groups = validCaptionGroups(existing)` before filtering; if groups, write `withCaptionFields(record, captionFields(captionGroupsAfterRemovingPhoto(groups, storedIndex)))`. `saveHighlightEdit`: `photos = [...photoOrder.map(i => existing.photos[i]), ...existing.photos.filter((_, i) => !photoOrder.includes(i))]`. `updateHighlightCaptionPart`: groups valid → replace part text, `captionFields(groups)`; else `{ caption: text }`. `backup.js` import passes `captionGroups: highlight.captionGroups` (export already spreads the record).
- [ ] Tests pass; commit `feat: 點滴分享分開描述的儲存與備份`.

### Task 3: Word export

**Files:** Modify `src/export/parentReportDocxExport.js` (`highlightEntryRows`); Test `tests/parentReportDocxExport.test.js`

- [ ] Tests: 3 photos + `[2,1]` → caption row has 2 `<w:tc>` with gridSpan `[4,2]`, both texts, first cell's right and second cell's left border `nil`; `[1,1,1]` → `[2,2,2]`; 2 photos `[1,1]` → `[3,3]`; invalid groups → single cell gridSpan 6 (unchanged).
- [ ] Implement: caption cells built from `cellSpecs` sliced per group (span = sum of `columnSpan`, width = sum of `widthDxa`), `borders: { ...(i > 0 && { left: NO_BORDER }), ...(i < last && { right: NO_BORDER }) }` with `NO_BORDER = { style: BorderStyle.NIL, size: 0, color: 'auto' }`, text via `textParagraphs(group.text, { bold: true, ...CENTERED })`. Non-split path untouched.
- [ ] Tests pass; commit `feat: 點滴分享分開描述匯出 Word`.

### Task 4: Word import

**Files:** Modify `src/import/parentReportDocxImport.js`, `src/ui/parentReportImportPreviewView.js`; Test `tests/parentReportDocxImport.test.js`, `tests/parentReportDocxExport.test.js` (round trip)

- [ ] Tests: hand-built XML with a 2-cell caption row (spans 4+2 under 3 photo cells spanning 2 each) → `captionGroups: [{size:2,...},{size:1,...}]` and `caption` = joined; spans that don't line up / a blank caption cell / photo cell without drawing → no `captionGroups`; existing single-caption expectations unchanged. Round trip: `buildHighlightsTable` of each arrangement → `extractHighlightPhotoGroups` gives the same groups.
- [ ] Implement `captionGroupsOf(photoRow, captionRow)` (walk caption cells, consume photo cells by gridSpan; any mismatch → `undefined`), add `...(captionGroups && { captionGroups })` to the group, carry it into both `highlightEntries` mappings, and pass `captionGroups: source.captionGroups` in the preview's `addHighlightEntry`.
- [ ] Tests pass; commit `feat: 匯入 Word 時讀回分開描述`.

### Task 5: 今天 check, conflict screen

**Files:** Modify `src/domain/findTodayWords.js`, `src/ui/todayWordCheckPopup.js`, `src/ui/conflictResolveView.js`; Tests `tests/findTodayWords.test.js`, `tests/conflictResolveView.test.js`

- [ ] Tests: split entry with 今天 in part 2 → one hit `{ kind: 'highlightPart', id, partIndex: 1, label: '點滴分享｜照片說明（第 3 張）' }`; popup save of that hit calls `updateHighlightCaptionPart`; conflict card for `captionGroups` shows label 分開描述 and the texts joined by ` ／ `.
- [ ] Implement; `SAVE[hit.kind](hit.id, field.value, hit)` with `highlightPart: (id, text, hit) => updateHighlightCaptionPart(id, hit.partIndex, text)`.
- [ ] Commit `feat: 今天檢查與同步衝突畫面支援分開描述`.

### Task 6: Drag to swap — `src/ui/photoDragSwap.js`

**Files:** Create `src/ui/photoDragSwap.js`, `tests/photoDragSwap.test.js`; CSS in `src/styles.css`

**Produces:** `wirePhotoDragSwap(root, { itemSelector, canDrag(item), onSwap(fromItem, toItem) })`.

- [ ] Tests (jsdom: `MouseEvent` named `pointer*` with `pointerType` defined, `document.elementFromPoint` stubbed): mouse drag onto another item calls `onSwap`; the click right after a drag is swallowed (label wouldn't open the picker); a plain click (no move) does not swap and is not swallowed; touch moving before the hold time does nothing (page scroll); touch held then moved swaps; `canDrag` false → nothing; pressing the × button inside an item doesn't start a drag.
- [ ] Implement with pointer events on `document` during a press, `HOLD_MS = 350` for non-mouse, `MOVE_PX = 6`, `touchmove` `preventDefault` (passive:false) while dragging, click suppression removed on the next tick, classes `photo-drag--source` / `photo-drag--target`. CSS: items `user-select:none; -webkit-touch-callout:none`, imgs `draggable="false"`, source dimmed, target outlined.
- [ ] Commit `feat: 拖移照片換順序的元件`.

### Task 7: Caption editor — `src/ui/highlightCaptionEditor.js`

**Files:** Create `src/ui/highlightCaptionEditor.js`, `tests/highlightCaptionEditor.test.js`; CSS

**Produces:** `mountCaptionEditor(root, { caption, captionGroups, getThumbs })` → `{ refresh(), value() }`; `value()` returns `captionFields(...)` result or `{ error }`.

- [ ] Tests: default one box (`data-field="caption"`), no 分開描述 button with <2 thumbs; 2 thumbs → 分開描述 gives two boxes labelled 第 1 張／第 2 張, first holds the old text; 3 thumbs → 分開描述 shows the three arrangement buttons and no boxes, `value()` → error 請選擇照片怎麼分組; pick 前二＋後一 → boxes 第 1、2 張／第 3 張; switch to 前一＋後二 keeps texts by position; 改回一段描述 joins with a line break; empty part → error 每段描述都要填寫; starting from saved `captionGroups` shows them; `refresh()` after thumbs drop from 3 to 1 goes back to one box with all text.
- [ ] Implement (state: `texts`, `sizes` (null = one), `choosing`; read boxes before every redraw; buttons are `type="button"`).
- [ ] Commit `feat: 點滴分享描述欄可以分開描述`.

### Task 8: Wire into 點滴分享 tab

**Files:** Modify `src/ui/highlightsTabView.js`, `src/styles.css`; Test `tests/highlightsTabView.test.js`

- [ ] Tests: 新增 with 3 photos, 分開描述 → 前二＋後一 → two texts → saved entry has `captionGroups`; swapping slot 0 and 2 in the 新增 form saves photos in the new order; 編輯 shows the photos, dragging reorders and 儲存 calls through to stored order + captions; 取消 restores the order; split entry card shows each part under its own photos; existing tests updated only for the edit-form selector.
- [ ] Implement: pending slot drawing in one `drawPendingSlot(i)`, thumbnail URLs cached per photo in a `WeakMap`, editor `refresh()` after every pending change, drag swap over `[data-drop-slot]` (canDrag = slot has a photo), edit form gets `[data-edit-photo]` thumbs + editor, save via `saveHighlightEdit(entry.id, { photoOrder: order.map(i => entry.photos[i].storedIndex), fields })`.
- [ ] Commit `feat: 點滴分享新增和編輯都能分開描述、拖移換照片`.

### Task 9: 操作說明 demo, docs

**Files:** Modify `src/ui/helpContent.js` (pr-highlights steps + note), `CLAUDE.md`; Test `tests/helpContent.test.js` stays green

- [ ] Steps: 分開描述 (hit) → 前二＋後一 (hit) → two 描述 fields, 新增 (hit); a drag step 按住照片拖到另一張的位置，就能換順序. Note adds 按「編輯」也能分開描述、拖移照片.
- [ ] CLAUDE.md item 2: one sentence on `captionGroups` / `highlightCaptions.js`.
- [ ] Commit `docs: 操作說明加上分開描述與拖移照片`.

### Task 10: Verification

- [ ] `npx vitest run tests/` green (re-run timed-out files alone).
- [ ] Round trip on real samples in `references/` (import → export → re-import, key-based compare of highlights).
- [ ] `npm run build`; Playwright on `dist/TableC.html`: 分開描述 on 2 and 3 photos, arrangement switch, 改回一段描述, drag swap with mouse and touch in 新增 and 編輯, file drop still fills a slot, export opens; render the exported `.docx` (Word COM → PDF) and look at the caption row: no inner line, each text under its photos.
