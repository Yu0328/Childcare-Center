# Import round-trip fixes (pre-launch check findings)

Found by the pre-launch real-file round-trip (import real docx → export → re-import → compare every
field). Each fix is in the importer that lost data, not in the exporter.

## Changes

- **適性紀錄 點滴分享 photos**: re-importing this app's own export lost every photo. The old lookup
  assumed Word's `word/media/imageN.*` naming; the `docx` library names media by content hash and
  also embeds the header logo. Photos are now resolved per group through each drawing's
  `<a:blip r:embed>` id → `document.xml.rels` target. The old media-order fallback (with its
  warning) is kept for files where that lookup doesn't line up.
- **適性紀錄 請假／更換課程 notes**: the exporter prints a flagged occurrence as struck-through
  `請假　note` / `更換課程　note`; the importer kept the label in the note (growing a prefix every
  round-trip) and read every struck row as 請假. The label now sets the flag (`更換課程` →
  `courseChanged`, else `absent`) and is stripped from the note.
- **月計畫 legacy files**: one activity came in as 2–3 items with names like `【` or `【【name】】`.
  - A line now starts only at `<w:br/>` (the exporter's line separator), not at every Word run.
  - A code-less `【name】` paragraph right before a coded item with no name becomes that item's name.
  - Merged names lose their brackets (UI/exporter add them back).
- **Indicator codes**: one shared pattern `INDICATOR_CODE_PATTERN_SOURCE` (`src/data/indicators.js`)
  replaces four hand-copied ones; it adds Ⅶ (25個月以上 extension items, which every copy missed)
  and fullwidth `ＩＶ`-style prefixes, which `normalizeIndicatorCode` now also converts.
  `KⅤ-x-y` (seen in real files) stays unrecognized: it can't be told which tier was meant.
- **Success toasts**: a new toast replaces the one showing instead of stacking; three stacked
  toasts covered the next file's preview on a phone.

## Not changed

- 總表 Ⅳ + Ⅴ imported together store previous-tier 發展中 entries twice (once in the Ⅴ form's 備註,
  once in the Ⅳ form), but `remarkEntries` (formEditorView.js) already shows and exports them once.
- Backup restore resets `isNew`/`createdAt`; harmless, left as is.
