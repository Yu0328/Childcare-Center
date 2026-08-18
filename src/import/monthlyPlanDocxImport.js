import JSZip from 'jszip';
import { TIERS, normalizeIndicatorCode, getIndicator } from '../data/indicators.js';

function flatJoinedText(xml) {
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('');
}

// "畫" is optional: a real legacy file (西瓜班-01月計畫.docx) has the title paragraph itself
// typo'd as "...課程計" with the trailing character missing, not a parsing artifact.
const PERIOD_PATTERN = /(\d{1,3})年\s*(\d{1,2})月課程計畫?/;

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

// Some legacy files type the tier letter as fullwidth (e.g. "Ｃ" U+FF23) instead of ASCII "C".
function normalizeFullwidthLetters(text) {
  return text.replace(/[Ａ-Ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

export function parseChildNameCell(cellXml) {
  const paragraphs = extractCellParagraphTexts(cellXml)
    .map(t => t.trim())
    .filter(Boolean);

  // A hand-typed legacy cell can wrap the name across multiple paragraphs, one CJK character per
  // line (real file: 西瓜班-01月計畫.docx, "鍾晴妍" as "鍾"/"晴"/"妍" paragraphs) — accumulate
  // leading pure-CJK paragraphs into the name, since the age/tier marker that always follows
  // contains a digit or ASCII letter.
  const PURE_CJK = /^[一-鿿]+$/;
  let nameParagraphCount = 0;
  while (nameParagraphCount < paragraphs.length && PURE_CJK.test(paragraphs[nameParagraphCount])) {
    nameParagraphCount += 1;
  }
  const name = nameParagraphCount > 0 ? paragraphs.slice(0, nameParagraphCount).join('') : null;
  const joined = normalizeFullwidthLetters(paragraphs.join(' '));

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

// A single-run legacy paragraph (e.g. "Ⅲ-1-2【換一隻手】文字") that isn't an
// exact code-only line falls into parseExportedDayCellItems's free-text
// fallback just like a real no-code activity (e.g. "大團體活動") would — both
// come back as a non-empty array, so a bare length check can't tell them
// apart.
const INDICATOR_CODE_SUBSTRING = /(?:[ⅠⅡⅢⅣⅤⅥ]|IⅤ|III|IV|II|I|V)-\d-\d+/;

// Task 12 real-file finding: some legacy documents write each entry as three
// separate paragraphs (bare code / name / description) instead of combining
// them with 【】 brackets in one paragraph, so the legacy per-paragraph code
// splitter produces one orphaned item per paragraph instead of one per entry.
// A code-only item (nothing else on its own paragraph) immediately followed
// by up to two code-less items absorbs them as its name/text, mirroring the
// single-paragraph shape.
//
// Review-round-2 fix: this must ONLY run on legacy-parsed output. A
// precise-parsed cell can legitimately contain a real code-only item (this
// app's own editor allows saving one — see monthlyPlanEditorView.js — and the
// exporter round-trips it as a single-line paragraph with no name/text) sitting
// right next to an unrelated free-activity item. Applying this merge there
// would silently graft the free activity's text onto the coded item and
// delete the free activity as its own entry — precise items are already
// complete by construction when correctly parsed, so they never need this.
function mergeCodeOnlySequentialItems(items) {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item.indicatorCode || item.activityName || item.indicatorText) continue;
    const nameItem = items[i + 1];
    if (!nameItem || nameItem.indicatorCode) continue;
    item.activityName = nameItem.activityName;
    items.splice(i + 1, 1);
    const textItem = items[i + 1];
    if (textItem && !textItem.indicatorCode) {
      item.indicatorText = textItem.activityName;
      items.splice(i + 1, 1);
    }
  }
  return items;
}

function legacyItems(dateCellXml, contentCellXml) {
  return mergeCodeOnlySequentialItems(parseLegacyDayCellItems(dateCellXml, contentCellXml));
}

export function parseDayCellItems(dateCellXml, contentCellXml) {
  const precise = parseExportedDayCellItems(contentCellXml);
  const looksMisparsed = precise.some(item => item.indicatorCode === null && INDICATOR_CODE_SUBSTRING.test(item.activityName));
  // Task 12 real-file finding: a hand-edited legacy cell can have Word run
  // fragmentation that scatters a code across multiple runs (e.g. spell-check
  // history splits it mid-string), so no single "line" (== one run, the
  // precise parser's own-export assumption) ever contains the full code and
  // the leftover-substring check above never fires. Catching that requires
  // comparing against code matches found on the cell's whole flattened text
  // (ignoring run boundaries) rather than per-run.
  //
  // Review-round-2 fix: a legitimate own-export item's activityName/
  // indicatorText free text can itself contain a code-shaped substring (e.g.
  // a note mentioning another indicator's code in prose) — that shouldn't
  // count as "missed", since the precise parser already correctly attributed
  // it to a real item. Subtract code-shaped matches found inside already-
  // recognized items' own text fields before comparing.
  const preciseCodeCount = precise.filter(item => item.indicatorCode).length;
  const rawCodeCount = [...flatJoinedText(contentCellXml).matchAll(INDICATOR_CODE_ANCHOR)].length;
  const alreadyAttributedCodeCount = precise.reduce(
    (sum, item) => sum + [...(item.activityName + item.indicatorText).matchAll(INDICATOR_CODE_ANCHOR)].length,
    0
  );
  const missedCodes = rawCodeCount - alreadyAttributedCodeCount > preciseCodeCount;
  if (precise.length > 0 && !looksMisparsed && !missedCodes) return precise;
  return legacyItems(dateCellXml, contentCellXml);
}

export function buildSlotsAndOverrides(children) {
  const canonicalByTier = new Map();
  for (const child of children) {
    if (child.tier && !canonicalByTier.has(child.tier)) canonicalByTier.set(child.tier, child);
  }

  const slotsByTier = new Map();
  for (const [tier, canonical] of canonicalByTier) {
    slotsByTier.set(
      tier,
      canonical.days.map(day => ({
        weekIndex: day.weekIndex,
        weekday: day.weekday,
        items: day.items.map(({ indicatorCode, activityName, indicatorText }) => ({ indicatorCode, activityName, indicatorText })),
      }))
    );
  }

  const childrenWithOverrides = children.map(child => {
    const overrides = [];
    for (const day of child.days) {
      day.items.forEach((item, itemIndex) => {
        if (item.notAchieved || item.replaced) {
          overrides.push({
            weekIndex: day.weekIndex,
            weekday: day.weekday,
            itemIndex,
            notAchieved: item.notAchieved,
            replaced: item.replaced,
            replacementText: item.replacementText || '',
          });
        }
      });
    }
    return { name: child.name, tier: child.tier, overrides };
  });

  return { slotsByTier, children: childrenWithOverrides };
}

export async function parseMonthlyPlanDocxImport(data) {
  const zip = await JSZip.loadAsync(data);
  const documentXml = await zip.file('word/document.xml').async('text');
  const warnings = [];

  const titleText = await extractTitleText(zip, documentXml);
  const period = parsePeriodFromTitleText(titleText);
  if (!period) warnings.push('無法從檔案中判斷課程計畫的年月，請手動選擇');

  const tables = splitChildTables(documentXml);
  const parsedChildren = tables.map(table => {
    const { name, tier } = parseChildNameCell(table.nameCellXml);
    const days = table.days.map(day => ({
      weekIndex: day.weekIndex,
      weekday: day.weekday,
      items: parseDayCellItems(day.dateCellXml, day.contentCellXml),
    }));
    return { name, tier, days };
  });

  for (const child of parsedChildren) {
    if (!child.name) warnings.push('偵測到一位無法判斷姓名的小朋友，請於預覽畫面手動確認');
    if (!child.tier) warnings.push(`無法判斷「${child.name || '（未知姓名）'}」的月齡階段，請手動選擇`);
  }

  const { slotsByTier, children: childrenWithOverrides } = buildSlotsAndOverrides(parsedChildren);

  const hasUnresolvedIndicator = [...slotsByTier.values()]
    .flat()
    .flatMap(slot => slot.items)
    .some(item => item.indicatorCode && !getIndicator(item.indicatorCode));
  if (hasUnresolvedIndicator) {
    warnings.push('部分指標代碼無法對應到系統內建的指標，這些項目匯入後可能無法正確顯示，建議確認後再匯入');
  }

  return {
    period,
    children: childrenWithOverrides,
    slotsByTier: Object.fromEntries(slotsByTier),
    warnings,
  };
}
