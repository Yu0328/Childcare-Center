# Line breaks in exported Word files

Found while comparing the (abandoned) export preview against real Word: a line break a teacher
types into a multi-line box disappears in the downloaded file. The exporters put the text into one
`TextRun` as-is, so the raw `\n` lands inside `<w:t>`, which Word shows as a space.

The real sample files never use soft line breaks (`<w:br/>` without a type: zero across every
file in `references/`) — separate lines are separate paragraphs. So that is what the exporters now
write, and what the importers now read back as `\n`.

## Changes

- **Export, one paragraph per line** for every multi-line field:
  - 適性紀錄: 發展紀錄 narrative and 行為觀察 narrative (each paragraph keeps the first-line
    indent), 能力指標內容 in the 課程計畫表, an occurrence's 說明 (every line keeps the red /
    strikethrough of a flagged row), 點滴分享 caption.
  - 總表: 觀察敘述 note (every line keeps the red of a flagged row).
  - 月計畫: an item's 指標內容 — this exporter already separates an item's lines with `<w:br/>`
    inside one paragraph (and its importer reads them that way), so extra lines follow the same
    convention instead of becoming paragraphs.
- **Import, lines back to `\n`** for the same fields, so export → re-import keeps every line:
  適性紀錄 能力指標內容 (every paragraph after 【活動名稱】, not only the first), 說明, caption;
  總表 note; 月計畫 指標內容 (every line after the name). Narratives already did this.
  Side effect on legacy files: a note/caption typed as several paragraphs used to be glued into one
  run-on line; it now keeps its lines.
- **Editing no longer flattens a note**: the 修改 forms for a 課程計畫 occurrence's 說明 and a 總表
  entry's 觀察敘述 used a single-line box (which silently drops line breaks — opening and saving
  flattened the note), while the matching 新增 forms use a multi-line box. Both become multi-line.
- **Screens show the line breaks**: 說明, 觀察敘述 (總表), 行為觀察 narrative and 點滴分享 caption
  in their lists render with `white-space: pre-line`, like the 發展紀錄 narrative already does.

## Left as is

- Single-line fields (names, 活動名稱, titles, 月計畫 replacement text, 總表 備註 rows) — typed into
  single-line boxes, so they can't contain a line break.
- The legacy (non-app) 月計畫 cell parser: a real legacy cell's layout is not this app's own.
- 總表 cells other than the note keep joining all text with no separator (the date cell's ○/△ and
  codes rely on it).
