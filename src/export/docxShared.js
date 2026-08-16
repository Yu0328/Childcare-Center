import {
  HorizontalPositionRelativeFrom,
  ImageRun,
  Paragraph,
  TextRun,
  TextWrappingSide,
  TextWrappingType,
  VerticalPositionRelativeFrom,
} from 'docx';

// Standard Taiwanese official-document font, matching every original form sample.
export const FONT = '標楷體';

// Default run size in half-points (24 = 12pt), matching every original form sample's <w:docDefaults>.
export const DEFAULT_TEXT_SIZE = 24;

// Page size in twips, A4 — shared by every exported document type. Page *margins* differ per
// document type (see each export module) and are NOT shared here.
export const PAGE_SIZE = { width: 11906, height: 16838 };

// The institution badge icon size, in EMU (copied from the 陳小安C表-2.docx sample's <wp:extent>).
export const HEADER_ICON_EMU = { width: 439420, height: 448310 };
export const EMU_PER_PIXEL = 9525; // docx's ImageRun transformation takes pixels and multiplies by this.

// word/media/image1.png extracted from the real C表 sample: a 122x124 PNG badge shown beside every
// header title in this app's exported documents. Inlined as base64 so the built single-file app
// stays self-contained.
// The value below is a placeholder for THIS PLAN DOCUMENT ONLY, to avoid repeating a multi-KB
// base64 string twice in this file. Do not type this placeholder into the real source file —
// see Step 2, which copies the real value verbatim from the existing docxExport.js.
export const HEADER_ICON_BASE64 =
  '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';

function runFont() {
  return { ascii: FONT, eastAsia: FONT, hAnsi: FONT, cs: FONT };
}

export function textParagraph(text, { bold = false, size = DEFAULT_TEXT_SIZE, alignment, color } = {}) {
  return new Paragraph({
    ...(alignment ? { alignment } : {}),
    children: [
      new TextRun({
        text: String(text ?? ''),
        font: runFont(),
        size,
        ...(bold ? { bold: true } : {}),
        ...(color ? { color } : {}),
      }),
    ],
  });
}

export function emptyParagraph() {
  return new Paragraph({ children: [] });
}

// A floating header icon at an arbitrary offset — used with a document-type-specific offset so
// the title can stay centered on the full page width regardless of that document's own margins.
export function headerIconRunAt(offsetEmu) {
  return new ImageRun({
    type: 'png',
    data: HEADER_ICON_BASE64,
    altText: { name: 'image1.png', title: 'image1.png', description: '機構標誌' },
    transformation: {
      width: HEADER_ICON_EMU.width / EMU_PER_PIXEL,
      height: HEADER_ICON_EMU.height / EMU_PER_PIXEL,
    },
    floating: {
      allowOverlap: true,
      layoutInCell: true,
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.COLUMN, offset: offsetEmu.horizontal },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: offsetEmu.vertical },
      wrap: { type: TextWrappingType.SQUARE, side: TextWrappingSide.BOTH_SIDES },
    },
  });
}

// A floating header icon using Word's "文字在前" (In Front of Text) layout: the image floats
// freely on top of the text instead of pushing it away (contrast headerIconRunAt's "四周型"/Square
// wrapping, which reserves space around the icon so text never overlaps it). Used only by
// parentReportDocxExport.js's header, which wants the icon positioned close to/overlapping the
// start of the title rather than pushed far to the side — headerIconRunAt's existing behavior,
// and 適性總表's (docxExport.js) approved output, are untouched by this function's existence.
//
// docx's Anchor renders `wrap: { type: TextWrappingType.NONE }` as an OOXML <wp:wrapNone/> element
// (no text-wrapping avoidance at all), and separately renders the floating `behindDocument` flag
// as the <wp:anchor behindDoc="..."> attribute — the same wrap type covers both "In Front of Text"
// and "Behind Text" in Word's UI; the only difference is behindDoc, which we explicitly set false
// here for "in front" (docx's own IFloating default is already false, but this is spelled out
// since front/behind ordering is the entire point of this function).
export function headerIconRunInFrontOfText(offsetEmu) {
  return new ImageRun({
    type: 'png',
    data: HEADER_ICON_BASE64,
    altText: { name: 'image1.png', title: 'image1.png', description: '機構標誌' },
    transformation: {
      width: HEADER_ICON_EMU.width / EMU_PER_PIXEL,
      height: HEADER_ICON_EMU.height / EMU_PER_PIXEL,
    },
    floating: {
      allowOverlap: true,
      layoutInCell: true,
      behindDocument: false,
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.COLUMN, offset: offsetEmu.horizontal },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: offsetEmu.vertical },
      wrap: { type: TextWrappingType.NONE },
    },
  });
}

// 2024-11-01 -> 113/11/01
export function toRocDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate ?? ''));
  if (!match) return String(isoDate ?? '');
  return `${Number(match[1]) - 1911}/${match[2]}/${match[3]}`;
}
