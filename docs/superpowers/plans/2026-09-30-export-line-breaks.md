# Line breaks in exported Word files — Implementation Plan

**Goal:** A line break typed into a multi-line field survives export to Word, re-import, editing,
and on-screen display. Spec: `docs/superpowers/specs/2026-09-30-export-line-breaks-design.md`.

**Architecture:** `\n` → one paragraph per line in the 適性紀錄/總表 exporters (the real samples'
own convention); `\n` → extra `<w:br/>` lines in the 月計畫 exporter (its existing item
convention). Each importer joins those paragraphs/lines back with `\n` for the same fields.

## Global Constraints

- Real files in `references/` never use a plain `<w:br/>`; separate lines are separate paragraphs.
- Flagged rows keep their look on every line (red; 適性紀錄 also strikethrough).
- Narrative paragraphs keep `indent: { firstLine: 480 }`.

### Task 1: 適性紀錄 export + import

- `src/export/docxShared.js`: add `textParagraphs(text, opts)` → `String(text ?? '').split('\n')
  .map(line => textParagraph(line, opts))`.
- `src/export/parentReportDocxExport.js`: indicatorText, caption → `...textParagraphs(...)`;
  `narrativeParagraph` → `narrativeParagraphs` (one indented paragraph per line); occurrence note
  cell → one centered paragraph per line of `formatNoteText(row)`, each run keeping strike/color.
- `src/import/parentReportDocxImport.js`: `indicatorText` = paragraphs after the first joined with
  `\n`; note and caption = cell paragraphs joined with `\n` (each via `textOf`, trimmed).
- Tests (`tests/parentReportDocxExport.test.js`, `tests/parentReportDocxImport.test.js`): export of
  multi-line narrative/note/indicatorText/caption yields N paragraphs with no `\n` inside `<w:t>`;
  generate → parse round trip returns the same `\n` strings.

### Task 2: 總表 export + import

- `src/export/docxExport.js`: note cells (both body-row builders) → `...textParagraphs(formatNoteCell(row), { color })`.
- `src/import/docxImport.js`: note cell text = paragraphs joined with `\n`; other cells unchanged.
- Tests: `tests/docxExport.test.js` paragraph count; generate → `parseDocxImport` round trip.

### Task 3: 月計畫 export + import

- `src/export/monthlyPlanDocxExport.js` `buildDayCellRuns`: `lines` built from
  `item.indicatorText.split('\n')` (spread) so each typed line becomes its own `<w:br/>` line.
- `src/import/monthlyPlanDocxImport.js` `linesToItem`: indicatorText = remaining lines joined `\n`.
- Tests: `buildDayCellRuns` lines; round trip in `tests/monthlyPlanDocxImport.acceptance.test.js`.

### Task 4: UI

- `src/ui/courseplanTabView.js:81`, `src/ui/formEditorView.js:72`: edit note `<input>` →
  `<textarea>` (same class/data attributes, content escaped as element text).
- `src/styles.css` `.entry-row__note`: `white-space: pre-line`.
- Tests: view test that an edited-then-saved note keeps its `\n`.

### Task 5: Verify

- `npx vitest run tests/`, `npm run build`.
- Round trip on every real file in `references/`: import → export → re-import, compare every field
  by key/multiset; fields must match except where the original held multi-paragraph notes/captions
  (now `\n` instead of glued — list them).
- Open a multi-line export in real Word (COM), confirm paragraph count per cell.
