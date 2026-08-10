import {
  AlignmentType, Document, Header, HeightRule, HorizontalPositionRelativeFrom, ImageRun, Packer,
  Paragraph, ShadingType, Table, TableCell, TableRow, TableLayoutType, TextRun, TextWrappingSide,
  TextWrappingType, VerticalAlign, VerticalMergeType, VerticalPositionRelativeFrom, WidthType,
} from 'docx';
import { TIERS, DOMAINS, getIndicator } from '../data/indicators.js';
import {
  FONT, DEFAULT_TEXT_SIZE, PAGE_SIZE, HEADER_ICON_EMU, EMU_PER_PIXEL,
  textParagraph, emptyParagraph, headerIconRunInFrontOfText, toRocDate,
} from './docxShared.js';
import { calculateAgeInMonths } from '../domain/ageTier.js';

// This document type ("每月課程計畫表" / "每月嬰幼兒適性發展紀錄表") is issued under a different
// institution name than 適性總表's C表 sample — copied verbatim from the real reference PDF header.
const INSTITUTION_NAME = '屏東縣內埔鄉育英公設民營托嬰中心';

// Page margins in twips, copied from the real reference sample's <w:pgMar> — narrower and uniform
// on all four sides, unlike 適性總表's C表 margins. Do not reuse docxExport.js's PAGE_MARGIN.
const PAGE_MARGIN = { top: 720, right: 720, bottom: 720, left: 720, header: 851, footer: 992 };

// Title size in half-points: 36 half-points = 18pt (適性總表 uses 34 = 17pt — different, verified
// against the real sample, do not "fix" to match).
const TITLE_SIZE = 36;

// 課程計畫表 column widths in DXA, copied from the real sample's <w:tblGrid>: 發展領域｜指標｜
// 活動名稱/能力指標｜課程實施日期｜說明.
const COURSE_PLAN_COLUMN_WIDTHS = [1489, 1122, 2966, 1570, 3616];
const COURSE_PLAN_TABLE_WIDTH_DXA = COURSE_PLAN_COLUMN_WIDTHS.reduce((sum, w) => sum + w, 0);
const TABLE_CELL_MARGIN_DXA = 115;

// Domain cell shading fills, read directly from the real sample's <w:shd w:fill="...">, keyed by
// the same domain id (1-5) used in src/data/indicators.js. Do not invent different colors — these
// are the actual template's colors, not a UI aesthetic choice.
const DOMAIN_FILL_COLORS = { 1: 'FBE4D5', 2: 'FFE1FF', 3: 'FFF2CC', 4: 'BDD6EE', 5: '9CC2E5' };

// Every full-width section header bar in the SECOND table (適性發展紀錄表 domain bars, 行為觀察
// bars, and the 點滴分享 bar) is the same single fill in the real samples — verified against the
// reference sample's OOXML, where all six such bar rows carry w:fill="F7CAAC", and confirmed by
// pixel-sampling the rendered reference PDF. The per-domain DOMAIN_FILL_COLORS palette above
// applies ONLY to the 課程計畫表 table's 發展領域 column; do not reuse it for these bars.
const SECTION_HEADER_FILL = 'F7CAAC';

// "19-24個月" (as stored in TIERS[].label) -> "(19~24 個月)", matching the real sample's title
// formatting exactly (tilde instead of hyphen, a space before 個月, wrapped in parentheses).
function parentReportTierLabel(tierCode) {
  const tier = TIERS.find(t => t.code === tierCode);
  if (!tier) return '';
  return `(${tier.label.replace(/(\d+)-(\d+)個月/, '$1~$2 個月')})`;
}

// Mirrors docxExport.js's buildIndicatorRowGroups: groups CoursePlanEntries so the 發展領域 column
// can merge across every entry that shares a domain, and the 指標/活動名稱 columns can merge across
// every occurrence row of one entry. Domain is looked up via the entry's own indicatorCode (not
// stored redundantly on the entry) so it always reflects the current indicator reference data.
// Sort key helper for buildCoursePlanRowGroups: entries whose indicator code doesn't resolve
// (shouldn't normally happen) sort to the end rather than throwing or corrupting the ordering.
const UNRESOLVED_SORT_KEY = Infinity;

function coursePlanSortKey(entry) {
  const indicator = getIndicator(entry.indicatorCode);
  if (!indicator) return { domain: UNRESOLVED_SORT_KEY, index: UNRESOLVED_SORT_KEY };
  const index = Number(entry.indicatorCode.split('-').pop());
  return { domain: indicator.domain, index: Number.isNaN(index) ? UNRESOLVED_SORT_KEY : index };
}

export function buildCoursePlanRowGroups(entries, occurrencesByEntryId) {
  // Fix 3: entries can arrive in arbitrary (e.g. IndexedDB insertion) order with domains
  // interleaved. The vertical-merge grouping below assumes same-domain entries are already
  // contiguous, so sort a COPY (never mutate the caller's array) by domain, then by indicator
  // number within the domain, before grouping.
  const sortedEntries = [...entries].sort((a, b) => {
    const keyA = coursePlanSortKey(a);
    const keyB = coursePlanSortKey(b);
    return keyA.domain !== keyB.domain ? keyA.domain - keyB.domain : keyA.index - keyB.index;
  });

  let previousDomain = null;

  return sortedEntries.map(entry => {
    const indicator = getIndicator(entry.indicatorCode);
    const domain = indicator ? indicator.domain : null;
    const isFirstEntryOfDomain = domain !== previousDomain;
    previousDomain = domain;

    const occurrences = occurrencesByEntryId[entry.id] || [];
    const rows =
      occurrences.length === 0
        ? [{ date: '', status: null, absent: false, note: '' }]
        : occurrences.map(o => ({ date: o.date, status: o.status, absent: o.absent, note: o.note }));

    return { entry, indicator, domain, rows, isFirstEntryOfDomain };
  });
}

const CENTERED = { alignment: AlignmentType.CENTER };

function cellWidth(index) {
  return { size: COURSE_PLAN_COLUMN_WIDTHS[index], type: WidthType.DXA };
}

function coursePlanHeaderRow() {
  // The 課程實施日期 header is four separate short paragraphs in the real sample, not one long
  // string left to wrap: at this column's width (1570 DXA) a single string wraps mid-word into
  // "課程實施日／期【已發展／○】" instead of the sample's clean 課程／實施日期／【已發展○】／【發展中△】.
  const labels = ['發展領域', '指標', '活動名稱/能力指標', '課程\n實施日期\n【已發展○】\n【發展中△】', '說明'];
  return new TableRow({
    children: labels.map((label, index) =>
      new TableCell({
        width: cellWidth(index),
        verticalAlign: VerticalAlign.CENTER,
        children: label.split('\n').map(line => textParagraph(line, CENTERED)),
      })
    ),
  });
}

function mergedCell(index, children, isFirstRowOfMerge, extra = {}) {
  return new TableCell({
    width: cellWidth(index),
    verticalAlign: VerticalAlign.CENTER,
    verticalMerge: isFirstRowOfMerge ? VerticalMergeType.RESTART : VerticalMergeType.CONTINUE,
    children: isFirstRowOfMerge ? children : [emptyParagraph()],
    ...extra,
  });
}

// achieved/"developing" occurrences print a plain "MM/DD" + status glyph; an absent occurrence
// instead prints the same "MM/DD" (no glyph) with a strikethrough run, per the real sample.
function occurrenceDateRun(row) {
  if (!row.date) return new TextRun({ text: '', font: { ascii: FONT, eastAsia: FONT, hAnsi: FONT, cs: FONT }, size: DEFAULT_TEXT_SIZE });
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(row.date);
  const formatted = match ? `${match[2]}/${match[3]}` : row.date;
  const glyph = row.absent ? '' : row.status === 'developed' ? '○' : row.status === 'developing' ? '△' : '';
  return new TextRun({
    text: `${formatted}${glyph}`,
    font: { ascii: FONT, eastAsia: FONT, hAnsi: FONT, cs: FONT },
    size: DEFAULT_TEXT_SIZE,
    ...(row.absent ? { strike: true } : {}),
  });
}

function occurrenceNoteRun(row) {
  return new TextRun({
    text: String(row.note ?? ''),
    font: { ascii: FONT, eastAsia: FONT, hAnsi: FONT, cs: FONT },
    size: DEFAULT_TEXT_SIZE,
    ...(row.absent ? { strike: true } : {}),
  });
}

function coursePlanBodyRow(group, row, { isFirstRowOfDomain, isFirstRowOfEntry }) {
  const domainName = group.indicator ? group.indicator.domainName : '';
  const description = group.entry.indicatorText || '';
  // Fix 2: domain shading spans the entire row in the real sample, not just the 發展領域 column —
  // applied to all five columns, including the two vertically-merged columns (1指標, 2活動名稱)
  // that previously had none.
  const domainShading = { shading: { type: ShadingType.CLEAR, color: 'auto', fill: DOMAIN_FILL_COLORS[group.domain] || 'FFFFFF' } };

  return new TableRow({
    children: [
      mergedCell(0, [textParagraph(domainName, { bold: true, ...CENTERED })], isFirstRowOfDomain, domainShading),
      mergedCell(1, [textParagraph(group.entry.indicatorCode, CENTERED)], isFirstRowOfEntry, domainShading),
      mergedCell(2, [
        textParagraph(`【${group.entry.activityName}】`, CENTERED),
        textParagraph(description, CENTERED),
      ], isFirstRowOfEntry, domainShading),
      new TableCell({
        width: cellWidth(3),
        verticalAlign: VerticalAlign.CENTER,
        ...domainShading,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [occurrenceDateRun(row)] })],
      }),
      new TableCell({
        width: cellWidth(4),
        verticalAlign: VerticalAlign.CENTER,
        ...domainShading,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [occurrenceNoteRun(row)] })],
      }),
    ],
  });
}

export function buildCoursePlanTable(entries, occurrencesByEntryId) {
  const groups = buildCoursePlanRowGroups(entries, occurrencesByEntryId);

  const bodyRows = groups.flatMap((group, groupIndex) =>
    group.rows.map((row, rowIndex) =>
      coursePlanBodyRow(group, row, {
        isFirstRowOfDomain: group.isFirstEntryOfDomain && rowIndex === 0,
        isFirstRowOfEntry: rowIndex === 0,
      })
    )
  );

  return new Table({
    width: { size: COURSE_PLAN_TABLE_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: COURSE_PLAN_COLUMN_WIDTHS,
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.CENTER,
    margins: { left: TABLE_CELL_MARGIN_DXA, right: TABLE_CELL_MARGIN_DXA, marginUnitType: WidthType.DXA },
    rows: [coursePlanHeaderRow(), ...bodyRows],
  });
}

export function groupEntriesByDomainInFirstAppearanceOrder(entries) {
  const order = [];
  const byDomain = new Map();
  for (const entry of entries) {
    if (!byDomain.has(entry.domain)) {
      byDomain.set(entry.domain, []);
      order.push(entry.domain);
    }
    byDomain.get(entry.domain).push(entry);
  }
  return order.map(domain => ({ domain, entries: byDomain.get(domain) }));
}

function fullWidthCell(children, fill) {
  return new TableCell({
    width: { size: COURSE_PLAN_TABLE_WIDTH_DXA, type: WidthType.DXA },
    ...(fill ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill } } : {}),
    children,
  });
}

function domainHeaderRow(label, fill) {
  return new TableRow({ children: [fullWidthCell([textParagraph(label, { bold: true, ...CENTERED })], fill)] });
}

// First-line indent (each paragraph's first line indented, matching the essay-style prose in the
// real sample) — 480 twips ≈ two 標楷體 full-width characters at 12pt.
function narrativeParagraph(text) {
  return new Paragraph({
    indent: { firstLine: 480 },
    children: [new TextRun({ text: String(text ?? ''), font: { ascii: FONT, eastAsia: FONT, hAnsi: FONT, cs: FONT }, size: DEFAULT_TEXT_SIZE })],
  });
}

function referencedIndicatorLines(courseEntryIds, coursePlanEntriesById) {
  return courseEntryIds
    .map(id => coursePlanEntriesById.get(id))
    .filter(Boolean)
    .map(entry => {
      const indicator = getIndicator(entry.indicatorCode);
      return textParagraph(`${entry.indicatorCode}　${indicator ? indicator.description : ''}`);
    });
}

export function buildDevelopmentRecordTable(developmentRecordEntries, behaviorObservations, coursePlanEntries) {
  const coursePlanEntriesById = new Map(coursePlanEntries.map(e => [e.id, e]));
  const domainGroups = groupEntriesByDomainInFirstAppearanceOrder(developmentRecordEntries);

  const rows = domainGroups.flatMap(({ domain, entries }) => {
    const domainName = DOMAINS.find(d => d.id === domain)?.name;
    return [
      domainHeaderRow(domainName || '', SECTION_HEADER_FILL),
      new TableRow({
        children: [
          fullWidthCell(
            entries.flatMap(entry => [
              ...referencedIndicatorLines(entry.courseEntryIds, coursePlanEntriesById),
              narrativeParagraph(entry.narrative),
            ])
          ),
        ],
      }),
    ];
  });

  const behaviorRows = behaviorObservations.flatMap(observation => [
    domainHeaderRow(`行為觀察－${observation.title}`, SECTION_HEADER_FILL),
    new TableRow({ children: [fullWidthCell([narrativeParagraph(observation.narrative)])] }),
  ]);

  return new Table({
    width: { size: COURSE_PLAN_TABLE_WIDTH_DXA, type: WidthType.DXA },
    // Explicit columnWidths (rather than docx's default of inferring one from the widest row) is
    // required here: when both developmentRecordEntries and behaviorObservations are empty (a
    // parent report section with no data yet), rows is [], and docx's inference does
    // Array(Math.max(...[])) === Array(-Infinity), which throws RangeError: Invalid array length.
    columnWidths: [COURSE_PLAN_TABLE_WIDTH_DXA],
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.CENTER,
    margins: { left: TABLE_CELL_MARGIN_DXA, right: TABLE_CELL_MARGIN_DXA, marginUnitType: WidthType.DXA },
    rows: [...rows, ...behaviorRows],
  });
}

// Fix M: an entry's photo row used to always render 3 cells (missing photos became empty
// placeholder cells, an empty gap in the printed page). Now it renders exactly
// entry.photos.length cells, evenly filling the full row width.
//
// The table's <w:tblGrid> is declared ONCE (via HIGHLIGHT_COLUMN_WIDTHS below) and shared by
// EVERY row in the table per OOXML rules - the header bar, every entry's photo row and caption
// row, and the 家長回饋 rows all reference the same grid, even though entries have different
// photo counts. A first attempt kept the grid at 3 columns (matching the old fixed 3-photo
// layout) and tried to force an even 50/50 split for a 2-photo row purely via each cell's own
// explicit `width`, on the theory that Word "generally respects a cell's own explicit width".
// Empirically (rendered to PDF via Word COM and visually inspected - see Fix M's report) that
// was WRONG for a 2-of-3 vs 1-of-3 gridSpan split: Word resolved the actual cell boundary
// somewhere between the tcW-implied 50% and the gridSpan-implied 66.7%, so the wider-looking
// cell's declared-half-width image left a visible gap before the border, and the narrower cell's
// image got auto-shrunk to fit - neither photo actually filled its cell.
//
// The reliable fix is to never ask Word to reconcile a mismatch between a cell's own width and
// its gridSpan's grid-column-sum in the first place: use a 6-column grid instead of 3. 6 divides
// evenly by every supported photo count (1, 2, 3), so every cell's declared `width` can be set to
// EXACTLY the sum of the grid columns its columnSpan covers - no mismatch, no reconciliation, no
// gap. 1 photo -> columnSpan 6 (all of it, unchanged full-width behavior); 2 photos -> columnSpan
// 3 + 3 (an exact half each); 3 photos -> columnSpan 2 + 2 + 2 (an exact third each, pixel-for-
// pixel equivalent to the old fixed 3-column layout). Every other cell in this table that used to
// span the old grid's 3 columns (header bar, caption row, 家長回饋 rows) must now span all 6.
const HIGHLIGHT_GRID_COLUMN_COUNT = 6;
const HIGHLIGHT_COLUMN_WIDTHS = (() => {
  const base = Math.floor(COURSE_PLAN_TABLE_WIDTH_DXA / HIGHLIGHT_GRID_COLUMN_COUNT);
  const widths = Array(HIGHLIGHT_GRID_COLUMN_COUNT).fill(base);
  widths[HIGHLIGHT_GRID_COLUMN_COUNT - 1] += COURSE_PLAN_TABLE_WIDTH_DXA - base * HIGHLIGHT_GRID_COLUMN_COUNT;
  return widths;
})();
const DXA_PER_PIXEL = 1440 / 96; // 1 inch = 1440 twips = 96 CSS/OOXML reference pixels

// For an entry with `photoCount` photos (1, 2, or 3), splits the 6-column grid into `photoCount`
// equal-size groups of adjacent columns and returns each cell's columnSpan plus its width in DXA
// (the exact sum of the grid columns that group covers, per the reasoning above).
function highlightPhotoCellSpecs(photoCount) {
  const groupSize = HIGHLIGHT_GRID_COLUMN_COUNT / photoCount;
  return Array.from({ length: photoCount }, (_, i) => {
    const columns = HIGHLIGHT_COLUMN_WIDTHS.slice(i * groupSize, (i + 1) * groupSize);
    return { columnSpan: columns.length, widthDxa: columns.reduce((sum, w) => sum + w, 0) };
  });
}

// Blob.prototype.arrayBuffer() is universally supported in real browsers, but jsdom's Blob
// polyfill (used by this project's test suite) does not implement it — only FileReader works
// there. Prefer the fast native path and fall back to FileReader so this also works under jsdom.
function blobToArrayBuffer(blob) {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

// cellWidthDxa is the ACTUAL width this cell will render at for this row (varies by how many
// photos the entry has - see highlightEntryRows), not always the 3-column width, so the embedded
// image's transformation is sized to match rather than leaving blank space in a wider cell.
// columnSpan is omitted (undefined) for the 0-photo placeholder-cell case, preserving the
// pre-Fix-M behavior of 3 plain 1-grid-column cells.
async function highlightPhotoCell(photo, cellWidthDxa, columnSpan) {
  if (!photo) {
    return new TableCell({ width: { size: cellWidthDxa, type: WidthType.DXA }, columnSpan, children: [emptyParagraph()] });
  }
  const data = await blobToArrayBuffer(photo.blob);
  const displayWidthPx = cellWidthDxa / DXA_PER_PIXEL;
  const displayHeightPx = photo.width ? displayWidthPx * (photo.height / photo.width) : displayWidthPx;

  return new TableCell({
    width: { size: cellWidthDxa, type: WidthType.DXA },
    columnSpan,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: 'jpg',
            data,
            transformation: { width: displayWidthPx, height: displayHeightPx },
          }),
        ],
      }),
    ],
  });
}

async function highlightEntryRows(entry) {
  const photoCount = entry.photos.length;
  // Pre-existing edge case: legacy/imported data can have an entry with 0 photos even though the
  // UI itself requires at least one (see highlightsTabView.js's "請至少上傳一張照片" guard, added
  // after some data already existed without it). Preserve 3 empty placeholder cells for that case
  // - laid out on the same 2-grid-column-per-cell split as a real 3-photo row, so the row's
  // columnSpans still sum to the shared 6-column grid like every other row in the table - rather
  // than dividing COURSE_PLAN_TABLE_WIDTH_DXA by zero below.
  const cellSpecs = highlightPhotoCellSpecs(photoCount === 0 ? 3 : photoCount);
  const photoCells = photoCount === 0
    ? await Promise.all(cellSpecs.map(spec => highlightPhotoCell(undefined, spec.widthDxa, spec.columnSpan)))
    : await Promise.all(entry.photos.map((photo, i) => highlightPhotoCell(photo, cellSpecs[i].widthDxa, cellSpecs[i].columnSpan)));
  return [
    new TableRow({ children: photoCells }),
    new TableRow({
      children: [
        new TableCell({
          columnSpan: HIGHLIGHT_GRID_COLUMN_COUNT,
          width: { size: COURSE_PLAN_TABLE_WIDTH_DXA, type: WidthType.DXA },
          children: [textParagraph(entry.caption, { bold: true, ...CENTERED })],
        }),
      ],
    }),
  ];
}

// The design spec requires a 家長回饋／簽名欄 block ("簽名欄留空白，供列印後手寫"). In both real
// samples it is the tail of the SAME table as 點滴分享: an F7CAAC bar reading 家長回饋, then one
// full-width cell holding five empty paragraphs (the blank handwriting area — this is what gives
// the cell its height; the samples set no explicit trHeight) closed by a 家長簽名： line.
export function parentFeedbackRows() {
  return [
    new TableRow({
      children: [
        new TableCell({
          columnSpan: HIGHLIGHT_GRID_COLUMN_COUNT,
          width: { size: COURSE_PLAN_TABLE_WIDTH_DXA, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: SECTION_HEADER_FILL },
          children: [textParagraph('家長回饋', { bold: true, ...CENTERED })],
        }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({
          columnSpan: HIGHLIGHT_GRID_COLUMN_COUNT,
          width: { size: COURSE_PLAN_TABLE_WIDTH_DXA, type: WidthType.DXA },
          children: [
            ...Array.from({ length: 5 }, () => emptyParagraph()),
            textParagraph('家長簽名：', { bold: true }),
          ],
        }),
      ],
    }),
  ];
}

export async function buildHighlightsTable(highlightEntries) {
  const headerRow = new TableRow({
    children: [
      new TableCell({
        columnSpan: HIGHLIGHT_GRID_COLUMN_COUNT,
        width: { size: COURSE_PLAN_TABLE_WIDTH_DXA, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: SECTION_HEADER_FILL },
        children: [textParagraph('點滴分享', { bold: true, ...CENTERED })],
      }),
    ],
  });

  const entryRowGroups = await Promise.all(highlightEntries.map(highlightEntryRows));

  return new Table({
    width: { size: COURSE_PLAN_TABLE_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: HIGHLIGHT_COLUMN_WIDTHS,
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.CENTER,
    margins: { left: TABLE_CELL_MARGIN_DXA, right: TABLE_CELL_MARGIN_DXA, marginUnitType: WidthType.DXA },
    rows: [headerRow, ...entryRowGroups.flat(), ...parentFeedbackRows()],
  });
}

// Positions the icon (via headerIconRunInFrontOfText's "in front of text" wrapping, which lets the
// icon float freely over the text instead of pushing it away) near the start of the centered title
// — the first character, "屏" of INSTITUTION_NAME — rather than far off to the left as
// docxExport.js's 適性總表 header does. Chosen by visual iteration against a rendered sample (see
// Fix B's report), not derived by calculation: exact glyph-start position depends on Word's own
// font rendering, which can't be computed exactly from docx.js's declarative model.
const HEADER_ICON_OFFSET_EMU = { horizontal: -325000, vertical: -40000 };

// The real samples carry two different titles: 每月課程計畫表 + the tier label over the first
// form, and 每月嬰幼兒適性發展紀錄表 (no tier label) over the second one, which starts on a fresh
// page. That is why this document is built as two sections with a header each, rather than one.
function pageHeader({ child, report, title }) {
  const referenceDate = /^\d{1,3}年\d{1,2}月$/.test(report.period)
    ? (() => {
        const [, y, m] = /^(\d{1,3})年(\d{1,2})月$/.exec(report.period);
        return `${Number(y) + 1911}-${String(Number(m)).padStart(2, '0')}-01`;
      })()
    : null;
  const actualAgeText =
    referenceDate && child.birthDate ? `${calculateAgeInMonths(child.birthDate, referenceDate)}個月` : '';

  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          headerIconRunInFrontOfText(HEADER_ICON_OFFSET_EMU),
          new TextRun({
            text: `${INSTITUTION_NAME}${title}`,
            font: { ascii: FONT, eastAsia: FONT, hAnsi: FONT, cs: FONT },
            bold: true,
            size: TITLE_SIZE,
          }),
        ],
      }),
      textParagraph(
        `幼兒姓名：${child.name} 出生年月日：${toRocDate(child.birthDate)} 實際月齡：${actualAgeText}　紀錄時間：${report.period}`,
        { bold: true, ...CENTERED }
      ),
    ],
  });
}

// 家長簽名 lives inside the 家長回饋 cell (see parentFeedbackRows); only the staff signature line
// sits outside the table, as a single left-aligned body paragraph — matching both real samples.
function signatureParagraphs() {
  return [
    textParagraph('托育人員：　　　　　主任簽名：', { bold: true }),
    emptyParagraph(),
  ];
}

export async function generateParentReportDocxBlob({
  child, report, coursePlanEntries, courseOccurrencesByEntryId,
  developmentRecordEntries, behaviorObservations, highlightEntries,
}) {
  const coursePlanTable = buildCoursePlanTable(coursePlanEntries, courseOccurrencesByEntryId);
  const developmentRecordTable = buildDevelopmentRecordTable(developmentRecordEntries, behaviorObservations, coursePlanEntries);
  const highlightsTable = await buildHighlightsTable(highlightEntries);

  const sectionProperties = { page: { size: PAGE_SIZE, margin: PAGE_MARGIN } };
  const coursePlanTitle = `每月課程計畫表${parentReportTierLabel(report.tier)}`;

  const doc = new Document({
    sections: [
      {
        properties: sectionProperties,
        headers: { default: pageHeader({ child, report, title: coursePlanTitle }) },
        children: [coursePlanTable],
      },
      {
        // A second section starts on a new page by default, which is what puts 適性發展紀錄表 at
        // the top of its own page under its own title, exactly as in the real samples.
        properties: sectionProperties,
        headers: { default: pageHeader({ child, report, title: '每月嬰幼兒適性發展紀錄表' }) },
        children: [
          developmentRecordTable,
          highlightsTable,
          ...signatureParagraphs(),
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}

export function downloadParentReportDocx(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
