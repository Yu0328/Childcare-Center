import JSZip from 'jszip';
import { TIERS, normalizeIndicatorCode, getIndicator } from '../data/indicators.js';

function flatJoinedText(xml) {
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('');
}

const PERIOD_PATTERN = /(\d{1,3})年\s*(\d{1,2})月課程計畫/;

export function parsePeriodFromTitleText(text) {
  const match = PERIOD_PATTERN.exec(text ?? '');
  if (!match) return null;
  return `${match[1]}年${match[2].padStart(2, '0')}月`;
}

export async function extractTitleText(zip, documentXml) {
  const headerNames = Object.keys(zip.files).filter(name => /^word\/header\d*\.xml$/i.test(name));
  for (const name of headerNames) {
    const xml = await zip.file(name).async('text');
    const text = flatJoinedText(xml);
    if (PERIOD_PATTERN.test(text)) return text;
  }
  const firstTableIndex = documentXml.indexOf('<w:tbl>');
  const introXml = firstTableIndex === -1 ? documentXml : documentXml.slice(0, firstTableIndex);
  return flatJoinedText(introXml);
}

function extractCellParagraphTexts(cellXml) {
  return [...cellXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map(m =>
    [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join('')
  );
}

const TIER_LETTER_TO_CODE = new Map(TIERS.filter(t => t.formLetter).map(t => [t.formLetter, t.code]));
const TIER_LABEL_TO_CODE = new Map(TIERS.map(t => [t.label, t.code]));

export function parseChildNameCell(cellXml) {
  const paragraphs = extractCellParagraphTexts(cellXml)
    .map(t => t.trim())
    .filter(Boolean);
  const name = paragraphs[0] || null;
  const joined = paragraphs.join(' ');

  let tier = null;
  const letterMatch = /([A-E])表/.exec(joined) || /\/\s*([A-E])\b/.exec(joined);
  if (letterMatch) {
    tier = TIER_LETTER_TO_CODE.get(letterMatch[1]) || null;
  } else {
    for (const [label, code] of TIER_LABEL_TO_CODE) {
      if (joined.includes(label)) {
        tier = code;
        break;
      }
    }
  }

  return { name, tier };
}

function rowCells(rowXml) {
  return [...rowXml.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map(m => m[1]);
}

export function splitChildTables(documentXml) {
  const tables = [...documentXml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map(m => m[0]);

  return tables.map(tableXml => {
    const rows = [...tableXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(m => m[0]);
    const bodyRows = rows.slice(1, 11); // skip the week-header row; up to 5 (date,content) pairs

    const nameCellXml = bodyRows[0] ? rowCells(bodyRows[0])[0] || '' : '';
    const days = [];
    for (let pairIndex = 0; pairIndex * 2 + 1 < bodyRows.length; pairIndex += 1) {
      const weekday = pairIndex + 1;
      const dateRowCells = rowCells(bodyRows[pairIndex * 2]);
      const contentRowCells = rowCells(bodyRows[pairIndex * 2 + 1]);
      for (let col = 1; col < contentRowCells.length; col += 1) {
        days.push({
          weekIndex: col,
          weekday,
          dateCellXml: dateRowCells[col] || '',
          contentCellXml: contentRowCells[col] || '',
        });
      }
    }
    return { nameCellXml, days };
  });
}

const INDICATOR_CODE_EXACT = /^(?:[ⅠⅡⅢⅣⅤⅥ]|IⅤ|III|IV|II|I|V)-\d-\d+$/;

function extractRuns(xml) {
  return [...xml.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)].map(m => {
    const runXml = m[1];
    const rPr = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(runXml)?.[1] || '';
    return {
      text: [...runXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join(''),
      hasStrike: /<w:strike\s*\/>/.test(rPr),
      hasRedColor: /<w:color\b[^>]*w:val="FF0000"/i.test(rPr),
    };
  });
}

function linesToItem(lines, flags) {
  const [first, ...rest] = lines;
  if (!INDICATOR_CODE_EXACT.test(first || '')) {
    return { indicatorCode: null, activityName: first || '', indicatorText: '', ...flags };
  }
  const indicatorCode = normalizeIndicatorCode(first);
  let activityName = '';
  let indicatorText = '';
  if (rest[0] && rest[0].startsWith('【') && rest[0].endsWith('】')) {
    activityName = rest[0].slice(1, -1);
    indicatorText = rest[1] || '';
  } else {
    indicatorText = rest[0] || '';
  }
  return { indicatorCode, activityName, indicatorText, ...flags };
}

function parseExportedItemParagraph(paragraphXml) {
  const runs = extractRuns(paragraphXml);
  if (runs.length === 0) return null;

  const hasAnyStrike = runs.some(r => r.hasStrike);
  let itemRuns = runs;
  let replacementText = '';
  if (hasAnyStrike) {
    const last = runs[runs.length - 1];
    if (!last.hasStrike) {
      replacementText = last.text;
      itemRuns = runs.slice(0, -1);
    }
  }

  const lines = itemRuns.map(r => r.text);
  const notAchieved = itemRuns.some(r => r.hasRedColor);
  const replaced = itemRuns.some(r => r.hasStrike);

  return linesToItem(lines, { notAchieved, replaced, replacementText });
}

export function parseExportedDayCellItems(contentCellXml) {
  const paragraphs = [...contentCellXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map(m => m[0]);
  return paragraphs.map(parseExportedItemParagraph).filter(Boolean);
}

const INDICATOR_CODE_ANCHOR = /(?:[ⅠⅡⅢⅣⅤⅥ]|IⅤ|III|IV|II|I|V)-\d-\d+/g;
const ABSENT_MARKER_ON_DATE = /[（(]\s*(請假|更換課程)\s*[）)]/;
const ABSENT_REPLACEMENT_PARAGRAPH = /^(請假|更換課程)$/;

function paragraphInfo(paragraphXml) {
  const runs = extractRuns(paragraphXml);
  return {
    text: runs.map(r => r.text).join(''),
    hasStrike: runs.some(r => r.hasStrike),
    hasRedColor: runs.some(r => r.hasRedColor),
  };
}

function stripNoise(text) {
  return text.replace(/OK/gi, '').trim();
}

export function parseLegacyDayCellItems(dateCellXml, contentCellXml) {
  const dateText = [...dateCellXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('');
  const dateMarkerMatch = ABSENT_MARKER_ON_DATE.exec(dateText);

  const paragraphs = [...contentCellXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
    .map(m => paragraphInfo(m[0]))
    .filter(p => p.text.trim());

  const items = [];
  for (let i = 0; i < paragraphs.length; i += 1) {
    const paragraph = paragraphs[i];
    let replacementText = '';
    const replaced = paragraph.hasStrike;

    const next = paragraphs[i + 1];
    if (paragraph.hasStrike && next && !next.hasStrike && ABSENT_REPLACEMENT_PARAGRAPH.test(next.text.trim())) {
      replacementText = next.text.trim();
      paragraphs.splice(i + 1, 1);
    }

    const notAchieved = paragraph.hasRedColor;
    const codeMatches = [...paragraph.text.matchAll(INDICATOR_CODE_ANCHOR)];

    if (codeMatches.length === 0) {
      const cleaned = stripNoise(paragraph.text);
      if (cleaned) items.push({ indicatorCode: null, activityName: cleaned, indicatorText: '', notAchieved, replaced, replacementText });
      continue;
    }

    for (let m = 0; m < codeMatches.length; m += 1) {
      // The first item's segment starts at 0 (not the code's own index) so a
      // name-first ordering's leading 【…】 bracket is captured too.
      const start = m === 0 ? 0 : codeMatches[m].index;
      const end = m + 1 < codeMatches.length ? codeMatches[m + 1].index : paragraph.text.length;
      const segment = paragraph.text.slice(start, end);
      const indicatorCode = normalizeIndicatorCode(codeMatches[m][0]);
      const bracketMatch = /【([^】]*)】/.exec(segment);
      const activityName = bracketMatch ? bracketMatch[1] : '';
      const indicatorText = stripNoise(segment.replace(codeMatches[m][0], '').replace(/【[^】]*】/, ''));
      items.push({ indicatorCode, activityName, indicatorText, notAchieved, replaced, replacementText });
    }
  }

  if (dateMarkerMatch && !items.some(item => item.replaced)) {
    for (const item of items) {
      item.replaced = true;
      item.replacementText = dateMarkerMatch[1];
    }
  }

  return items;
}
