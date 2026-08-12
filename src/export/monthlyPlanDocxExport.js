import {
  AlignmentType, Document, Packer, Paragraph, Table, TableCell, TableRow, TableLayoutType, TextRun, WidthType,
} from 'docx';
import { TIERS } from '../data/indicators.js';
import { FONT, DEFAULT_TEXT_SIZE, PAGE_SIZE, textParagraph, emptyParagraph } from './docxShared.js';
import { buildMonthlyCalendar } from '../domain/monthlyCalendar.js';
import { parsePeriod } from '../ui/periodFields.js';
import { calculateAgeInMonths } from '../domain/ageTier.js';

const PAGE_MARGIN = { top: 720, right: 720, bottom: 720, left: 720, header: 851, footer: 992 };
const COLUMN_WIDTHS = [1200, 1800, 1800, 1800, 1800, 1800];
const TABLE_WIDTH_DXA = COLUMN_WIDTHS.reduce((sum, w) => sum + w, 0);

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
    return new Paragraph({ children });
  });
}

function cellWidth(index) {
  return { size: COLUMN_WIDTHS[index], type: WidthType.DXA };
}

function weekHeaderRow(weeks) {
  return new TableRow({
    children: [
      new TableCell({ width: cellWidth(0), children: [textParagraph('日期/姓名', { alignment: AlignmentType.CENTER })] }),
      ...weeks.map((week, index) =>
        new TableCell({
          width: cellWidth(index + 1),
          children: [
            textParagraph(`第${week.weekIndex}週`, { alignment: AlignmentType.CENTER }),
            textParagraph(week.dateRange, { alignment: AlignmentType.CENTER }),
          ],
        })
      ),
    ],
  });
}

function findSlot(slots, tier, weekIndex, weekday) {
  return slots.find(s => s.tier === tier && s.weekIndex === weekIndex && s.weekday === weekday);
}

function dayRows(child, tier, weeks, weekday, slots, itemsBySlotId, overrideByItemId) {
  const dateCells = weeks.map((week, index) => {
    const day = week.days.find(d => d.weekday === weekday);
    return new TableCell({ width: cellWidth(index + 1), children: [textParagraph(day ? day.dateLabel : '', { alignment: AlignmentType.CENTER })] });
  });
  const contentCells = weeks.map((week, index) => {
    const day = week.days.find(d => d.weekday === weekday);
    if (!day) return new TableCell({ width: cellWidth(index + 1), children: [emptyParagraph()] });
    const slot = findSlot(slots, tier, week.weekIndex, weekday);
    const items = slot ? itemsBySlotId[slot.id] || [] : [];
    const runs = buildDayCellRuns(items, overrideByItemId);
    return new TableCell({ width: cellWidth(index + 1), children: cellParagraphsFromRuns(runs) });
  });

  return [
    new TableRow({ children: [new TableCell({ width: cellWidth(0), children: [emptyParagraph()] }), ...dateCells] }),
    new TableRow({ children: [new TableCell({ width: cellWidth(0), children: [emptyParagraph()] }), ...contentCells] }),
  ];
}

function buildChildTable(child, tier, weeks, slots, itemsBySlotId, allOverrides) {
  const overrideByItemId = new Map(
    allOverrides.filter(o => o.childId === child.id).map(o => [o.itemId, o])
  );
  const asOfIso = weeks[0].days[0].isoDate;
  const ageMonths = calculateAgeInMonths(child.birthDate, asOfIso);

  const nameRow = new TableRow({
    children: [
      new TableCell({
        width: cellWidth(0),
        children: [textParagraph(`${child.name}`), textParagraph(`${ageMonths}M ${tierFormLetter(tier)}表`)],
      }),
      ...weeks.map((week, index) => new TableCell({ width: cellWidth(index + 1), children: [emptyParagraph()] })),
    ],
  });

  const bodyRows = [1, 2, 3, 4, 5].flatMap(weekday => dayRows(child, tier, weeks, weekday, slots, itemsBySlotId, overrideByItemId));

  return new Table({
    width: { size: TABLE_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: COLUMN_WIDTHS,
    layout: TableLayoutType.FIXED,
    rows: [weekHeaderRow(weeks), nameRow, ...bodyRows],
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
        children: [textParagraph(`${plan.period}課程月計畫`, { bold: true, alignment: AlignmentType.CENTER }), emptyParagraph(), ...tables],
      },
    ],
  });

  return Packer.toBlob(doc);
}
