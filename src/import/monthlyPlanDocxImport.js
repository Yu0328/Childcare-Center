import JSZip from 'jszip';
import { TIERS } from '../data/indicators.js';

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
