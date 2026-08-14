import { downloadBlob } from './downloadBlob.js';
import {
  AlignmentType,
  Document,
  Header,
  HeightRule,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableRow,
  TableCell,
  TableLayoutType,
  TextRun,
  VerticalAlign,
  VerticalMergeType,
  WidthType,
} from 'docx';
import { TIERS, getIndicator } from '../data/indicators.js';
import { calculateAgeInMonths } from '../domain/ageTier.js';
import {
  FONT,
  DEFAULT_TEXT_SIZE,
  PAGE_SIZE,
  HEADER_ICON_EMU,
  EMU_PER_PIXEL,
  textParagraph,
  emptyParagraph,
  headerIconRunAt,
  toRocDate,
} from './docxShared.js';

// Name of the institution this form is submitted for. Taken from the real C表 sample document
// (陳小安C表-2.docx). Kept as a constant so another centre adopting this tool can change it in one place.
const INSTITUTION_NAME = '屏東縣內埔鄉社區公共托育家園';

// Column widths in DXA (twips). The first 6 are copied from the real form's <w:tblGrid> (verified
// against both 陳小安C表-2.docx and a 彙整 sample, 林浩宇-C表-...彙整.docx — both agree on these
// widths). The 7th (備註) is not from either sample — it's a later addition for carrying over a
// previous tier's still-incomplete indicators — so its width is a reasonable guess (taken out of
// 課程實施記錄's share, keeping the table's total/centered width unchanged) rather than a verified
// value; revisit if a real sample with this column ever turns up.
const COLUMN_WIDTHS = [565, 1557, 992, 1984, 1560, 1643, 800];
// The real form's table is narrower than the page's text area and centered in the remaining
// space (<w:jc w:val="center"/> on the original's <w:tblPr>) rather than stretched edge to edge.
const TABLE_WIDTH_DXA = COLUMN_WIDTHS.reduce((sum, width) => sum + width, 0);
// Cell padding, copied from the original's table style (<w:tblCellMar>) — narrower than the
// library default, which was leaving enough room for two characters per line in narrow columns.
const TABLE_CELL_MARGIN_DXA = 115;

const SUBDOMAIN_SEPARATOR = '、';

// Page geometry in twips, copied from the real form's <w:sectPr> (A4 with narrow margins).
// The docx default (1" margins) is too narrow and makes the header title wrap onto a second line.
const PAGE_MARGIN = { top: 851, right: 851, bottom: 851, left: 1134, header: 851, footer: 992 };

// Header title font size in half-points: 34 half-points = 17pt, as in the original.
const HEADER_TITLE_SIZE = 34;

// Smaller than DEFAULT_TEXT_SIZE (24 = 12pt): the 幼兒姓名/出生日期/實際月齡/實施時間 line has grown
// longer since a merged form's 實施時間 can be a "115年05月-115年08月" range, and at the default
// size it wraps onto a second line. 22 half-points = 11pt keeps it on one line while staying
// close to the original size.
const CHILD_INFO_LINE_SIZE = 22;

// The original's decorative icon size floats in the left margin, offset far enough left that it
// never overlaps the title's text line — that way the title can be centered on the full page
// width, with the icon sitting in its own corner.
const HEADER_ICON_OFFSET_EMU = { horizontal: -(HEADER_ICON_EMU.width + 40000), vertical: 8890 };

// Row heights for the two-row table header, in twips — copied from the real form's <w:trHeight>.
// Word auto-fits row height to content otherwise, which renders visibly shorter/more cramped
// than the original for single-line labels like 發展領域.
const TABLE_HEADER_ROW_HEIGHTS = [438, 720];

// Signature lines printed under the table. The gap is five U+3000 ideographic spaces, as in the original.
const CAREGIVER_SIGNATURE_LINE = '托育人員：　　　　　主管簽名：';
const PARENT_SIGNATURE_LINE = '家長簽名：';

// Short, tag-like columns (發展領域/領域範疇/指標項次) are centered, matching the original —
// longer prose columns (發展活動/課程實施記錄) stay left-aligned for readability.
const CENTERED = { alignment: AlignmentType.CENTER };

function cellWidth(index) {
  return { size: COLUMN_WIDTHS[index], type: WidthType.DXA };
}

function spannedWidth(fromIndex, toIndex) {
  let size = 0;
  for (let i = fromIndex; i <= toIndex; i += 1) size += COLUMN_WIDTHS[i];
  return { size, type: WidthType.DXA };
}

// 發展領域 is printed as e.g. "1身體動作" — the numeric id plus the domain name.
function domainLabelFor(indicator) {
  return `${indicator?.domain ?? ''}${indicator?.domainName ?? ''}`;
}

// getIndicatorsForTier() walks RAW_DOMAINS in order, so all indicators of one domain are contiguous.
// Each group therefore only needs to know whether it opens a new domain; the 發展領域/領域範疇 cells
// merge from that row until the next domain starts, spanning however many indicators lie in between.
export function buildIndicatorRowGroups(indicators, entriesByIndicatorCode) {
  let previousDomainLabel = null;

  return indicators.map(indicator => {
    const entries = entriesByIndicatorCode[indicator.code] || [];

    const rows =
      entries.length === 0
        ? [{ code: indicator.code, description: indicator.description, date: '', status: null, note: '' }]
        : entries.map(entry => ({
            code: indicator.code,
            description: indicator.description,
            date: entry.date,
            status: entry.status,
            note: entry.note,
          }));

    const domainLabel = domainLabelFor(indicator);
    const isFirstGroupOfDomain = domainLabel !== previousDomainLabel;
    previousDomainLabel = domainLabel;

    return { indicator, rows, isFirstGroupOfDomain };
  });
}

export function buildIndicatorRows(indicators, entriesByIndicatorCode) {
  return buildIndicatorRowGroups(indicators, entriesByIndicatorCode).flatMap(group => group.rows);
}

// Entries are stored as YYYY-MM-DD (see storage/db.js addEntry); the printed form uses MM/DD.
function formatDateCell(row) {
  if (!row.date) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(row.date);
  const formatted = match ? `${match[2]}/${match[3]}` : row.date;
  const glyph = row.status === 'developed' ? '○' : row.status === 'developing' ? '△' : '';
  return `${formatted}${glyph}`;
}

function tierLabelFor(tierCode) {
  const tier = TIERS.find(t => t.code === tierCode);
  return tier ? tier.label : String(tierCode ?? '');
}

function headerRows() {
  const topRow = new TableRow({
    height: { value: TABLE_HEADER_ROW_HEIGHTS[0], rule: HeightRule.ATLEAST },
    children: [
      new TableCell({
        width: cellWidth(0),
        verticalMerge: VerticalMergeType.RESTART,
        verticalAlign: VerticalAlign.CENTER,
        children: [textParagraph('發展領域', { bold: true, ...CENTERED })],
      }),
      new TableCell({
        width: cellWidth(1),
        verticalMerge: VerticalMergeType.RESTART,
        verticalAlign: VerticalAlign.CENTER,
        children: [textParagraph('領域範疇', { bold: true, ...CENTERED })],
      }),
      new TableCell({
        width: spannedWidth(2, 3),
        columnSpan: 2,
        verticalAlign: VerticalAlign.CENTER,
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'D9D9D9' },
        children: [textParagraph('指標項次/發展活動', { bold: true, ...CENTERED })],
      }),
      new TableCell({
        width: spannedWidth(4, 5),
        columnSpan: 2,
        verticalAlign: VerticalAlign.CENTER,
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'D9D9D9' },
        children: [textParagraph('實施記錄', { bold: true, ...CENTERED })],
      }),
      new TableCell({
        width: cellWidth(6),
        verticalMerge: VerticalMergeType.RESTART,
        verticalAlign: VerticalAlign.CENTER,
        children: [textParagraph('備註', { bold: true, ...CENTERED })],
      }),
    ],
  });

  const secondRow = new TableRow({
    height: { value: TABLE_HEADER_ROW_HEIGHTS[1], rule: HeightRule.ATLEAST },
    children: [
      new TableCell({
        width: cellWidth(0),
        verticalMerge: VerticalMergeType.CONTINUE,
        children: [emptyParagraph()],
      }),
      new TableCell({
        width: cellWidth(1),
        verticalMerge: VerticalMergeType.CONTINUE,
        children: [emptyParagraph()],
      }),
      new TableCell({
        width: spannedWidth(2, 3),
        columnSpan: 2,
        verticalAlign: VerticalAlign.CENTER,
        children: [textParagraph('適性發展指標活動', { bold: true, ...CENTERED })],
      }),
      new TableCell({
        width: cellWidth(4),
        verticalAlign: VerticalAlign.CENTER,
        children: [
          textParagraph('課程實施日期【已發展○】', { bold: true, ...CENTERED }),
          textParagraph('【發展中△】', { bold: true, ...CENTERED }),
        ],
      }),
      new TableCell({
        width: cellWidth(5),
        verticalAlign: VerticalAlign.CENTER,
        children: [textParagraph('課程實施記錄', { bold: true, ...CENTERED })],
      }),
      new TableCell({
        width: cellWidth(6),
        verticalMerge: VerticalMergeType.CONTINUE,
        children: [emptyParagraph()],
      }),
    ],
  });

  return [topRow, secondRow];
}

function subdomainParagraphs(subdomain) {
  const parts = String(subdomain ?? '')
    .split(SUBDOMAIN_SEPARATOR)
    .filter(part => part !== '');
  if (parts.length === 0) return [emptyParagraph()];
  return parts.map(part => textParagraph(part, CENTERED));
}

// A vertically merged cell: it either restarts the merge (and carries the content) or continues a
// merge started further up (and must be empty). Columns 5-6 always carry their own per-row values.
function mergedCell(index, children, isFirstRowOfMerge) {
  return new TableCell({
    width: cellWidth(index),
    verticalAlign: VerticalAlign.CENTER,
    verticalMerge: isFirstRowOfMerge ? VerticalMergeType.RESTART : VerticalMergeType.CONTINUE,
    children: isFirstRowOfMerge ? children : [emptyParagraph()],
  });
}

// Two different merge scopes, matching the real form:
//   columns 0-1 (發展領域 / 領域範疇) merge across every row of a domain, spanning many indicators;
//   columns 2-3 (指標項次 / 發展活動) merge only across the rows of one indicator.
// Columns 0-2 are short, tag-like values and are centered; 發展活動/課程實施記錄 stay left-aligned
// prose, matching the original.
// isRemark: this row carries over a still-incomplete indicator from the child's previous tier
// (they hadn't developed into it yet) rather than a record against this form's own tier — same
// row layout as any other indicator, but its note goes in the 備註 column instead of 課程實施記錄
// (which the 備註 column always exists as, blank for every other row), so it isn't mistaken for
// this tier's own record.
function bodyRow(indicator, row, { isFirstRowOfDomain, isFirstRowOfIndicator, isRemark = false }) {
  return new TableRow({
    children: [
      mergedCell(0, [textParagraph(domainLabelFor(indicator), CENTERED)], isFirstRowOfDomain),
      mergedCell(1, subdomainParagraphs(indicator.subdomain), isFirstRowOfDomain),
      mergedCell(2, [textParagraph(row.code, CENTERED)], isFirstRowOfIndicator),
      mergedCell(3, [textParagraph(row.description)], isFirstRowOfIndicator),
      new TableCell({
        width: cellWidth(4),
        verticalAlign: VerticalAlign.CENTER,
        children: [textParagraph(formatDateCell(row), CENTERED)],
      }),
      new TableCell({
        width: cellWidth(5),
        verticalAlign: VerticalAlign.CENTER,
        children: [isRemark ? emptyParagraph() : textParagraph(row.note)],
      }),
      new TableCell({
        width: cellWidth(6),
        verticalAlign: VerticalAlign.CENTER,
        children: [isRemark ? textParagraph(row.note) : emptyParagraph()],
      }),
    ],
  });
}

// "115年01月" (ROC year + month, as entered in 紀錄年月) -> "2026-01-01" for age calculation.
// A merged form's period can be a "115年05月-115年08月" range (see aggregateCoursePlan.js) — use
// the later (rightmost) end of the range, since that's the most recent point in time and closest
// to the child's actual age when the merged total form was assembled.
// Falls back to null for anything that doesn't match, since 期 is free-text.
function periodToReferenceDate(period) {
  const trimmed = String(period ?? '').trim();
  const lastSegment = trimmed.includes('-') ? trimmed.slice(trimmed.lastIndexOf('-') + 1).trim() : trimmed;
  const match = /^(\d{1,3})年(\d{1,2})月$/.exec(lastSegment);
  if (!match) return null;
  const gregorianYear = Number(match[1]) + 1911;
  const month = String(Number(match[2])).padStart(2, '0');
  return `${gregorianYear}-${month}-01`;
}

function pageHeader({ child, form }) {
  const tierLabel = tierLabelFor(form.tier);
  const referenceDate = periodToReferenceDate(form.period);
  // tierLabel (e.g. "13-18個月") already ends in "個月" — do not append a second one here.
  const actualAgeText =
    referenceDate && child.birthDate ? `${calculateAgeInMonths(child.birthDate, referenceDate)}個月` : tierLabel;

  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          headerIconRunAt(HEADER_ICON_OFFSET_EMU),
          new TextRun({
            text: `${INSTITUTION_NAME}嬰幼兒適性發展總表${tierLabel}`,
            font: { ascii: FONT, eastAsia: FONT, hAnsi: FONT, cs: FONT },
            bold: true,
            size: HEADER_TITLE_SIZE,
          }),
        ],
      }),
      textParagraph(
        `幼兒姓名：${child.name} 出生日期：${toRocDate(child.birthDate)} 實際月齡：${actualAgeText}　實施時間：${form.period}`,
        { bold: true, size: CHILD_INFO_LINE_SIZE, ...CENTERED }
      ),
    ],
  });
}

function signatureParagraphs() {
  return [
    textParagraph(CAREGIVER_SIGNATURE_LINE, { bold: true }),
    textParagraph(PARENT_SIGNATURE_LINE, { bold: true }),
    emptyParagraph(),
  ];
}

// previousTierEntries: this child's still-developing (未完成) entries recorded against their
// previous tier's indicators — appended as extra rows after the form's own tier so a still-open
// item from before doesn't just fall out of sight once the child moves up a tier.
export async function generateDocxBlob({ child, form, indicators, entries, previousTierEntries = [] }) {
  const entriesByIndicatorCode = {};
  for (const entry of entries) {
    if (!entriesByIndicatorCode[entry.indicatorCode]) {
      entriesByIndicatorCode[entry.indicatorCode] = [];
    }
    entriesByIndicatorCode[entry.indicatorCode].push(entry);
  }

  const groups = buildIndicatorRowGroups(indicators, entriesByIndicatorCode);

  const bodyRows = groups.flatMap(({ indicator, rows, isFirstGroupOfDomain }) =>
    rows.map((row, index) =>
      bodyRow(indicator, row, {
        isFirstRowOfDomain: isFirstGroupOfDomain && index === 0,
        isFirstRowOfIndicator: index === 0,
      })
    )
  );

  const remarkEntriesByCode = {};
  for (const entry of previousTierEntries) {
    (remarkEntriesByCode[entry.indicatorCode] ??= []).push(entry);
  }
  const remarkIndicators = [...new Set(previousTierEntries.map(e => e.indicatorCode))]
    .map(getIndicator)
    .filter(Boolean);
  const remarkGroups = buildIndicatorRowGroups(remarkIndicators, remarkEntriesByCode);
  const remarkRows = remarkGroups.flatMap(({ indicator, rows, isFirstGroupOfDomain }) =>
    rows.map((row, index) =>
      bodyRow(indicator, row, {
        isFirstRowOfDomain: isFirstGroupOfDomain && index === 0,
        isFirstRowOfIndicator: index === 0,
        isRemark: true,
      })
    )
  );

  const table = new Table({
    width: { size: TABLE_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: COLUMN_WIDTHS,
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.CENTER,
    margins: { left: TABLE_CELL_MARGIN_DXA, right: TABLE_CELL_MARGIN_DXA, marginUnitType: WidthType.DXA },
    rows: [...headerRows(), ...bodyRows, ...remarkRows],
  });

  const doc = new Document({
    sections: [
      {
        properties: { page: { size: PAGE_SIZE, margin: PAGE_MARGIN } },
        headers: { default: pageHeader({ child, form }) },
        children: [table, ...signatureParagraphs()],
      },
    ],
  });

  return Packer.toBlob(doc);
}

export function downloadDocx(blob, filename) {
  downloadBlob(blob, filename);
}
