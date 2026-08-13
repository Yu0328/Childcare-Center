import {
  AlignmentType, BorderStyle, Document, Header, Packer, Paragraph, ShadingType, Table, TableCell,
  TableRow, TableLayoutType, TextRun, VerticalAlign, VerticalMergeType, WidthType,
} from 'docx';
import { TIERS } from '../data/indicators.js';
import { DEFAULT_TEXT_SIZE, PAGE_SIZE, emptyParagraph, headerIconRunInFrontOfText } from './docxShared.js';
import { buildMonthlyCalendar, weekIndexLabel } from '../domain/monthlyCalendar.js';
import { parsePeriod } from '../ui/periodFields.js';
import { calculateAgeInMonths } from '../domain/ageTier.js';

// This document type ("課程月計畫") is issued with a different font variant than every other
// export's shared FONT ('標楷體') — copied verbatim from the real reference sample's <w:rFonts>
// (115年03月西瓜班月計畫-2.docx). Do not "fix" this to reuse docxShared.js's FONT; that constant
// is correct for the other document types, not this one. Because of this, this file defines its
// own textParagraph-equivalent helpers instead of importing docxShared.js's (which bake in the
// wrong font) — only font-agnostic helpers (emptyParagraph, headerIconRunInFrontOfText, PAGE_SIZE)
// are shared.
const FONT = '標楷體-港澳';

// Page margins in twips, copied from the real reference sample's <w:pgMar> — narrower than both
// 適性總表's and 適性紀錄's margins. Do not reuse either of those PAGE_MARGIN constants.
const PAGE_MARGIN = { top: 1134, right: 567, bottom: 1134, left: 567, header: 680, footer: 283 };

// The real sample's header carries this full institution + commissioning-agency line, longer than
// parentReportDocxExport.js's INSTITUTION_NAME — a different (longer) string for this document
// type, not a typo of that one.
const INSTITUTION_NAME = '屏東縣內埔鄉育英公設民營托嬰中心-屏東縣政府委託中華頭心手希望教育協會辦理';

// Title size in half-points: 32 = 16pt, copied from the real sample's <w:sz w:val="32"/> on the
// "{period}課程計畫" title run (適性總表 uses 34, 適性紀錄 uses 36 — different documents,
// different verified values, do not "align" them).
const TITLE_SIZE = 32;

// The "日期/姓名" corner header cell only, per the real sample's <w:sz w:val="18"/> on that one
// cell's runs (18 half-points = 9pt) — every other header/body cell uses the document default
// (DEFAULT_TEXT_SIZE, 24 = 12pt).
const CORNER_LABEL_SIZE = 18;

// Column widths in DXA, copied verbatim from the real sample's <w:tblGrid>: 日期/姓名 column +
// up to 5 week columns. buildMonthlyCalendar legitimately returns fewer than 5 weeks for some
// months (e.g. most Februaries), so callers must slice this to the actual week count via
// columnWidthsFor rather than assuming all 6 entries are used.
const COLUMN_WIDTHS = [995, 1977, 2268, 2126, 1985, 1879];
const TABLE_CELL_MARGIN_DXA = 100;

// Every border in the real sample's <w:tblBorders> is this same single 0.5pt (sz=4) black line,
// on all four table edges and both inside directions — a plain uniform grid, no double lines or
// shading tricks.
const TABLE_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const TABLE_BORDERS = {
  top: TABLE_BORDER, bottom: TABLE_BORDER, left: TABLE_BORDER, right: TABLE_BORDER,
  insideHorizontal: TABLE_BORDER, insideVertical: TABLE_BORDER,
};

// Per-cell border overrides for the date/content row pairs, copied from the real sample's
// per-cell <w:tcBorders> (verified via OOXML extraction — these differ from the plain
// TABLE_BORDERS grid above, which only covers the table's own default borders). All four sides
// are specified explicitly on every cell rather than partially overriding, since docx.js's merge
// behavior for unspecified sides against the table default isn't something this codebase has a
// precedent for and isn't worth relying on.
const SOLID_SIDE = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const DASHED_SIDE = { style: BorderStyle.DASHED, size: 4, color: '000000' };
const DASH_SMALL_GAP_SIDE = { style: BorderStyle.DASH_SMALL_GAP, size: 4, color: '000000' };
// Date-label cells (e.g. "3/3(二)") sit on a light gray band with a dashed line separating them
// from the content row below.
const DATE_CELL_BORDERS = { top: SOLID_SIDE, left: SOLID_SIDE, right: SOLID_SIDE, bottom: DASHED_SIDE };
const DATE_CELL_SHADING = { type: ShadingType.CLEAR, color: 'auto', fill: 'F2F2F2' };
// Content cells pick up the dashed line as their top border (shared with the date row above) and
// sit on an explicit white fill.
const CONTENT_CELL_BORDERS = { top: DASH_SMALL_GAP_SIDE, left: SOLID_SIDE, right: SOLID_SIDE, bottom: SOLID_SIDE };
const CONTENT_CELL_SHADING = { type: ShadingType.CLEAR, color: 'auto', fill: 'FFFFFF' };

// Reused for the icon's position in this document's header, tuned the same way
// parentReportDocxExport.js's HEADER_ICON_OFFSET_EMU was (visual iteration against a rendered
// sample) — the two documents share the same icon-near-title-start layout intent. This document's
// INSTITUTION_NAME is much longer than that one's, so its centered text starts much closer to the
// true left margin; the offset's magnitude is reduced accordingly so the icon doesn't overlap the
// text. Best-effort estimate — not visually verified in real Word, since this environment has no
// way to render/screenshot docx output. Confirm and re-tune against an actual export if it's off.
const HEADER_ICON_OFFSET_EMU = { horizontal: -60000, vertical: -40000 };

const WEEKDAYS = [1, 2, 3, 4, 5];
const CENTERED = { alignment: AlignmentType.CENTER };

function columnWidthsFor(weekCount) {
  return COLUMN_WIDTHS.slice(0, weekCount + 1);
}

function tableWidthDxa(widths) {
  return widths.reduce((sum, w) => sum + w, 0);
}

function tierFormLetter(tierCode) {
  const tier = TIERS.find(t => t.code === tierCode);
  return tier ? tier.formLetter : '';
}

// Pure formatting core, unit-tested directly (mirrors docxExport.js's buildIndicatorRows):
// turns a day cell's items + this child's overrides into plain descriptors, with no `docx`
// package types involved, so the red/strike/replacement-text logic is testable without
// constructing a real Document.
export function buildDayCellRuns(items, overrideByItemId) {
  return items.map(item => {
    const override = overrideByItemId.get(item.id);
    const text = item.indicatorCode
      ? `${item.indicatorCode}【${item.activityName}】${item.indicatorText || ''}`
      : item.activityName;
    return {
      text,
      notAchieved: Boolean(override?.notAchieved),
      replaced: Boolean(override?.replaced),
      replacementText: override?.replacementText || '',
    };
  });
}

function runFont() {
  return { ascii: FONT, eastAsia: FONT, hAnsi: FONT, cs: FONT };
}

function textParagraph(text, { size = DEFAULT_TEXT_SIZE, alignment, bold } = {}) {
  return new Paragraph({
    ...(alignment ? { alignment } : {}),
    children: [new TextRun({ text: String(text ?? ''), font: runFont(), size, ...(bold ? { bold: true } : {}) })],
  });
}

// Content cells are center-aligned in the real sample (verified via its per-paragraph
// <w:jc w:val="center"/>), matching the date row above them.
function cellParagraphsFromRuns(runs) {
  if (runs.length === 0) return [emptyParagraph()];
  return runs.map(run => {
    const children = [
      new TextRun({
        text: run.text,
        font: runFont(),
        size: DEFAULT_TEXT_SIZE,
        ...(run.notAchieved ? { color: 'FF0000' } : {}),
        ...(run.replaced ? { strike: true } : {}),
      }),
    ];
    if (run.replaced && run.replacementText) {
      children.push(new TextRun({ text: run.replacementText, font: runFont(), size: DEFAULT_TEXT_SIZE }));
    }
    return new Paragraph({ alignment: AlignmentType.CENTER, children });
  });
}

function cellWidth(widths, index) {
  return { size: widths[index], type: WidthType.DXA };
}

function documentHeader(period) {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          headerIconRunInFrontOfText(HEADER_ICON_OFFSET_EMU),
          new TextRun({ text: INSTITUTION_NAME, font: runFont(), size: DEFAULT_TEXT_SIZE }),
        ],
      }),
      textParagraph(`${period}課程計畫`, { size: TITLE_SIZE, alignment: AlignmentType.CENTER }),
    ],
  });
}

function weekHeaderRow(weeks, widths) {
  return new TableRow({
    children: [
      new TableCell({
        width: cellWidth(widths, 0),
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '日期/', font: runFont(), size: CORNER_LABEL_SIZE })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '姓名', font: runFont(), size: CORNER_LABEL_SIZE })] }),
        ],
      }),
      ...weeks.map((week, index) =>
        new TableCell({
          width: cellWidth(widths, index + 1),
          verticalAlign: VerticalAlign.CENTER,
          children: [
            textParagraph(`第${weekIndexLabel(week.weekIndex)}週`, CENTERED),
            textParagraph(week.dateRange, CENTERED),
          ],
        })
      ),
    ],
  });
}

function findSlot(slots, tier, weekIndex, weekday) {
  return slots.find(s => s.tier === tier && s.weekIndex === weekIndex && s.weekday === weekday);
}

// The child's name+age+tier occupies the first column once, vertically merged down through every
// date/content row pair (per the real sample's <w:vMerge>) rather than repeated per row — restart
// on the very first body row, continue (empty) on every row after it.
function nameCell(widths, isFirstBodyRow, nameContent) {
  return new TableCell({
    width: cellWidth(widths, 0),
    verticalAlign: VerticalAlign.CENTER,
    verticalMerge: isFirstBodyRow ? VerticalMergeType.RESTART : VerticalMergeType.CONTINUE,
    children: isFirstBodyRow ? nameContent : [emptyParagraph()],
  });
}

function dateRow(weeks, weekday, widths, nameContent, isFirstBodyRow) {
  const cells = weeks.map((week, index) => {
    const day = week.days.find(d => d.weekday === weekday);
    return new TableCell({
      width: cellWidth(widths, index + 1),
      verticalAlign: VerticalAlign.CENTER,
      borders: DATE_CELL_BORDERS,
      shading: DATE_CELL_SHADING,
      children: [textParagraph(day ? day.dateLabel : '', { ...CENTERED, bold: true })],
    });
  });
  return new TableRow({ children: [nameCell(widths, isFirstBodyRow, nameContent), ...cells] });
}

function contentRow(weeks, weekday, widths, tier, slots, itemsBySlotId, overrideByItemId) {
  const cells = weeks.map((week, index) => {
    const day = week.days.find(d => d.weekday === weekday);
    if (!day) {
      return new TableCell({
        width: cellWidth(widths, index + 1),
        borders: CONTENT_CELL_BORDERS,
        shading: CONTENT_CELL_SHADING,
        children: [emptyParagraph()],
      });
    }
    const slot = findSlot(slots, tier, week.weekIndex, weekday);
    const items = slot ? itemsBySlotId[slot.id] || [] : [];
    const runs = buildDayCellRuns(items, overrideByItemId);
    return new TableCell({
      width: cellWidth(widths, index + 1),
      borders: CONTENT_CELL_BORDERS,
      shading: CONTENT_CELL_SHADING,
      children: cellParagraphsFromRuns(runs),
    });
  });
  return new TableRow({ children: [nameCell(widths, false, null), ...cells] });
}

// The real sample ends every child's table with a "節氣／其他" label row, empty across every
// week — a trailing notes row in the original template. No data in this app's model backs it;
// reproduced as a static empty row purely for structural fidelity to the reference document.
function trailingNoteRow(widths) {
  return new TableRow({
    children: [
      new TableCell({
        width: cellWidth(widths, 0),
        verticalAlign: VerticalAlign.CENTER,
        children: [textParagraph('節氣', CENTERED), textParagraph('其他', CENTERED)],
      }),
      ...widths.slice(1).map(width => new TableCell({ width: { size: width, type: WidthType.DXA }, children: [emptyParagraph()] })),
    ],
  });
}

function buildChildTable(child, tier, weeks, slots, itemsBySlotId, allOverrides) {
  const widths = columnWidthsFor(weeks.length);
  const overrideByItemId = new Map(
    allOverrides.filter(o => o.childId === child.id).map(o => [o.itemId, o])
  );
  const asOfIso = weeks[0].days[0].isoDate;
  const ageMonths = calculateAgeInMonths(child.birthDate, asOfIso);
  const nameContent = [textParagraph(child.name, CENTERED), textParagraph(`${ageMonths}M　${tierFormLetter(tier)}表`, CENTERED)];

  const bodyRows = WEEKDAYS.flatMap((weekday, weekdayIndex) => [
    dateRow(weeks, weekday, widths, nameContent, weekdayIndex === 0),
    contentRow(weeks, weekday, widths, tier, slots, itemsBySlotId, overrideByItemId),
  ]);

  return new Table({
    width: { size: tableWidthDxa(widths), type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.CENTER,
    margins: { left: TABLE_CELL_MARGIN_DXA, right: TABLE_CELL_MARGIN_DXA, marginUnitType: WidthType.DXA },
    borders: TABLE_BORDERS,
    rows: [weekHeaderRow(weeks, widths), ...bodyRows, trailingNoteRow(widths)],
  });
}

export async function generateMonthlyPlanDocxBlob({ plan, children, slots, itemsBySlotId, overrides }) {
  const { year, month } = parsePeriod(plan.period);
  const weeks = buildMonthlyCalendar(year + 1911, month);

  const children_ = children.filter(c => plan.childIds.includes(c.id));
  const tables = children_.flatMap(child => [
    buildChildTable(child, plan.childTiers[child.id], weeks, slots, itemsBySlotId, overrides),
    emptyParagraph(),
  ]);

  const doc = new Document({
    sections: [
      {
        properties: { page: { size: PAGE_SIZE, margin: PAGE_MARGIN } },
        headers: { default: documentHeader(plan.period) },
        children: tables.length > 0 ? tables : [emptyParagraph()],
      },
    ],
  });

  return Packer.toBlob(doc);
}
