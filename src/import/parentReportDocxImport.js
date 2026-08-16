import JSZip from 'jszip';
import { DOMAINS, getIndicator, normalizeIndicatorCode } from '../data/indicators.js';

function cellsForRow(rowXml) {
  return [...rowXml.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map(match => match[1]);
}

function rowsOf(tableXml) {
  return [...tableXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(match => match[0]);
}

function paragraphsOf(cellXml) {
  return [...cellXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map(match => match[0]);
}

function textOf(fragmentXml) {
  return [...fragmentXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('').trim();
}

// Joins <w:t> runs WITHIN each paragraph with '' (no separator) — Word can legitimately split a
// single logical value (e.g. a two-digit month "03") across adjacent <w:r> runs for internal
// font/formatting reasons, and joining those with a space would turn "03" into "0 3", which then
// fails digit-only regexes like parseHeaderInfo's period pattern. Paragraphs themselves are still
// joined with a space, since genuinely separate paragraph-level fields (e.g. "幼兒姓名：陳小安"
// ending one paragraph and "出生年月日：..." starting the next) need a separator so their text
// doesn't run together into one unparseable blob. Mirrors parseRecordBlocks' paragraph-splitting.
function paragraphJoinedText(xml) {
  return [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
    .map(p => [...p[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join(''))
    .join(' ')
    .trim();
}

// Flat, paragraph-unaware scan of every <w:t> in the XML, joined with spaces. This is the
// original, simpler extraction paragraphJoinedText replaced for run-joining purposes — but it is
// tolerant of nested content (e.g. a decorative <w:txbxContent> textbox) that paragraphJoinedText's
// non-greedy `<w:p\b[\s\S]*?<\/w:p>` regex is not: when a header paragraph contains a nested
// textbox (which has its own inner <w:p>...</w:p>) followed by more text runs within that SAME
// outer paragraph, the non-greedy match stops at the textbox's inner </w:p> and silently drops
// everything after it — including, potentially, the 幼兒姓名 info itself. Kept as a fallback below
// for exactly that case.
function flatJoinedText(xml) {
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join(' ');
}

// A cell continues a vertical merge if it carries a bare <w:vMerge/> (the shorthand real Word
// sometimes uses, where a missing w:val defaults to "continue" per the OOXML spec) OR an explicit
// <w:vMerge w:val="continue"/> — the form this app's own docx export (via the `docx` npm library)
// always writes, and the only form it ever writes for a continuation cell. Recognizing only the
// bare shorthand meant re-importing a file this app itself had exported turned every occurrence
// after an entry's first into a phantom new entry with a blank indicator code (verified: any
// course-plan entry with 2+ occurrences was silently corrupted on export→re-import).
function isVMergeContinue(cellXml) {
  return /<w:vMerge\s*\/>/.test(cellXml) || /<w:vMerge(?!\s+w:val)/.test(cellXml) || /<w:vMerge\s+w:val="continue"\s*\/>/.test(cellXml);
}

// A cell counts as struck-through if ANY of its runs carries <w:strike/> — the export always
// strikes the whole cell's text as one run, but this stays lenient about run-splitting.
//
// Bug fix: <w:pPr><w:rPr>...</w:pPr> (the paragraph MARK's own run properties, controlling only
// the invisible pilcrow at the paragraph's end) is stripped out before testing. Word can leave a
// <w:strike/> there as a leftover from earlier edits without it being present on any actual
// visible-text run — that residue does not make the cell look struck through in Word, so it must
// not be read as absent here either (verified against a real sample file where this happened on
// 5 of 26 rows).
function isStruck(cellXml) {
  return /<w:strike\s*\/>/.test(cellXml.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/g, ''));
}

// "06/11" -> "06-11" (kept without a year — see Task 20's note on why year inference is deferred
// to the preview step, exactly like docxImport.js's existing 適性總表 importer).
function normalizeMonthDay(raw) {
  const match = /^(\d{1,2})\/(\d{1,2})/.exec(raw);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

export function parseCoursePlanTable(documentXml) {
  const bodyRows = rowsOf(documentXml).slice(1); // row 0 is the fixed header
  const entries = [];
  const occurrencesByEntryIndex = {};

  let currentEntryIndex = -1;

  for (const rowXml of bodyRows) {
    const cells = cellsForRow(rowXml);
    if (cells.length < 5) continue;

    const [domainCell, codeCell, activityCell, dateCell, noteCell] = cells;

    if (!isVMergeContinue(codeCell)) {
      const indicatorCode = normalizeIndicatorCode(textOf(codeCell));
      const activityParagraphs = paragraphsOf(activityCell);
      const activityNameRaw = activityParagraphs[0] ? textOf(activityParagraphs[0]) : '';
      const activityName = activityNameRaw.replace(/^【|】$/g, '');
      const indicatorText = activityParagraphs[1] ? textOf(activityParagraphs[1]) : '';
      entries.push({ indicatorCode, activityName, indicatorText });
      currentEntryIndex += 1;
      occurrencesByEntryIndex[currentEntryIndex] = [];
    }

    if (currentEntryIndex < 0) continue; // malformed row before any entry started

    const dateText = textOf(dateCell);
    const date = normalizeMonthDay(dateText);
    if (!date) continue; // an unfilled placeholder row

    const absent = isStruck(dateCell);
    const status = absent ? null : dateText.includes('○') ? 'developed' : dateText.includes('△') ? 'developing' : null;

    occurrencesByEntryIndex[currentEntryIndex].push({ date, status, absent, note: textOf(noteCell) });
  }

  return { entries, occurrencesByEntryIndex };
}

// ROC "113.06.20" or "113/06/20" -> "2024-06-20". The real reference sample's own header
// phrasing uses dots (unlike 適性總表's slash-separated 出生日期), but a real legacy file can use
// slashes instead — both separators are accepted here (verified: a slash-separated file otherwise
// fails to parse and silently drops the birth date).
function rocDotDateToIso(rocDate) {
  const match = /^(\d{1,3})[./](\d{1,2})[./](\d{1,2})$/.exec(rocDate.trim());
  if (!match) return null;
  const [, rocYear, month, day] = match;
  return `${Number(rocYear) + 1911}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function parseHeaderInfo(headerText) {
  const nameMatch = /幼兒姓名[：:]\s*([^\s　出]+)/.exec(headerText);
  const birthMatch = /出生年月日[：:]\s*(\d{1,3}[./]\d{1,2}[./]\d{1,2})/.exec(headerText);
  const periodMatch = /紀錄時間[：:]\s*(\d{1,3})\s*年\s*(\d{1,2})\s*月/.exec(headerText);

  return {
    name: nameMatch ? nameMatch[1] : null,
    birthDate: birthMatch ? rocDotDateToIso(birthMatch[1]) : null,
    period: periodMatch ? `${periodMatch[1]}年${periodMatch[2].padStart(2, '0')}月` : null,
  };
}

// The second table (適性發展紀錄表 + 行為觀察 + 點滴分享, all sharing one 6-column grid in the
// real sample) is a flat sequence of full-width shaded "header" rows and plain "content" rows.
// This function pairs them positionally — row 0 is a header, row 1 its content, row 2 the next
// header, etc. — without yet deciding what each header *means* (domain name vs. behavior-
// observation title vs. 點滴分享); Task 21 does that classification once it has DOMAINS and the
// already-parsed 課程計畫表 entries available to cross-reference against.
export function parseRecordBlocks(tableXml) {
  const rows = [...tableXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(m => m[0]);
  const blocks = [];

  for (let i = 0; i < rows.length; i += 2) {
    const headerRow = rows[i];
    const contentRow = rows[i + 1];
    if (!contentRow) break;

    const label = [...headerRow.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('').trim();
    const paragraphs = [...contentRow.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map(p =>
      [...p[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('')
    );
    const rawText = paragraphs.join('\n').trim();

    if (label && rawText) blocks.push({ label, rawText });
  }

  return blocks;
}

// Within the 點滴分享 section: a photo row is any row whose cells contain no text (only
// <w:drawing> elements, if any); the row immediately after each non-empty run of photo rows is
// that group's caption row. A photo row with zero drawings (all three slots empty) is skipped
// entirely rather than emitted as a 0-photo group.
export function extractHighlightPhotoGroups(highlightsTableXml) {
  // startIdx lands on the "點滴分享" text itself, which sits *inside* that header row's <w:tr> —
  // so scoping to it already excludes that row's opening tag, meaning the very next <w:tr\b>
  // match in `scoped` is the first photo row, not the header row. No extra slice needed here.
  const startIdx = highlightsTableXml.indexOf('點滴分享');
  const scoped = startIdx === -1 ? highlightsTableXml : highlightsTableXml.slice(startIdx);
  const rows = [...scoped.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(m => m[0]);

  const groups = [];
  for (let i = 0; i < rows.length; i += 2) {
    const photoRow = rows[i];
    const captionRow = rows[i + 1];
    if (!captionRow) break;

    const photoCount = (photoRow.match(/<w:drawing\s*\/>|<w:drawing>/g) || []).length;
    const caption = [...captionRow.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('').trim();
    if (photoCount > 0 && caption) groups.push({ photoCount, caption });
  }
  return groups;
}

// This document type's badge/logo images precede the body/highlight photos in the imageN numeric
// sequence, but the real-world templates in circulation embed them in (at least) two different
// ways: some put them in a real header part (word/header*.xml); the actual reference sample
// (verified against a real legacy file, no header/footer parts at all) instead embeds them as
// plain inline <w:drawing> elements directly in word/document.xml's body, positioned before the
// 點滴分享 section. Either way they land at the front of the imageN numbering, so both counts are
// computed independently and summed below — a document using one variant has zero drawings of the
// other kind, so the sum never double-counts in practice.
//
// Counting <w:drawing> elements via regex — rather than resolving relationship IDs — stays
// consistent with this file's existing lightweight approach. Known residual risk this does NOT
// attempt to solve: a legacy .docx with Word's "different odd/even" or "different first page"
// header options enabled could have the SAME badge image repeated across multiple header parts
// (header1.xml/header2.xml/header3.xml), each containing its own <w:drawing>, while Word still
// only saves ONE physical file for it in word/media — which would inflate this count above the
// actual number of front-loaded media files. Fully solving that needs relationship-ID resolution,
// which this design intentionally avoids for simplicity. As a low-effort guard against that
// silently eating into real 點滴分享 photos, the total skip is capped at the number of media files
// actually present (see extractSortedMediaImages) — worst case that degrades to "no photos
// recovered" (same as the existing "more photos detected than media" warning path), not silently
// wrong photo assignments.
async function countHeaderFooterDrawings(zip) {
  const partNames = Object.keys(zip.files).filter(name => /^word\/(header|footer)\d*\.xml$/i.test(name));
  const xmls = await Promise.all(partNames.map(name => zip.file(name).async('text')));
  return xmls.reduce((total, xml) => total + (xml.match(/<w:drawing\s*\/>|<w:drawing>/g) || []).length, 0);
}

function countInlineDrawingsBeforeHighlights(documentXml) {
  const highlightsIndex = documentXml.indexOf('點滴分享');
  const scoped = highlightsIndex === -1 ? documentXml : documentXml.slice(0, highlightsIndex);
  return (scoped.match(/<w:drawing\s*\/>|<w:drawing>/g) || []).length;
}

async function extractSortedMediaImages(zip, documentXml) {
  const mediaNames = Object.keys(zip.files)
    .filter(name => /^word\/media\/image\d+\.(png|jpe?g)$/i.test(name))
    .sort((a, b) => {
      const numA = Number(/image(\d+)\./.exec(a)[1]);
      const numB = Number(/image(\d+)\./.exec(b)[1]);
      return numA - numB;
    });
  const headerFooterDrawingCount = await countHeaderFooterDrawings(zip);
  const inlineBeforeHighlightsCount = countInlineDrawingsBeforeHighlights(documentXml);
  const skipCount = Math.min(headerFooterDrawingCount + inlineBeforeHighlightsCount, mediaNames.length);
  const bodyMediaNames = mediaNames.slice(skipCount);
  return Promise.all(bodyMediaNames.map(async name => zip.file(name).async('blob')));
}

// The domain-block classifier: a block's label is either one of the 5 known domain names (→ a
// 適性發展紀錄表 段落, referencing whichever already-parsed 課程計畫表 entries its rawText
// mentions by indicator code), or starts with "行為觀察" followed by a separator (→ a behavior
// observation), or neither (→ surfaced as a warning and dropped, rather than guessed at).
// The separator this app's own docx export writes is the fullwidth "－" (U+FF0D), but a real
// legacy file (verified once during Task 21, not committed to this repo) used the ordinary ASCII
// "-" (U+002D) instead — so both are accepted here.
const BEHAVIOR_OBSERVATION_LABEL = /^行為觀察[－-]/;
// Mirrors normalizeIndicatorCode's own set of recognized prefixes (its Latin-letter typos, plus
// the distinct mixed "IⅤ" garble) — a narrative paragraph's rawText can reference an indicator by
// any of the forms normalizeIndicatorCode knows how to fix, since this free-text narrative is
// typed independently of the code cell. Each match is normalized below before comparing against
// coursePlanEntries' already-normalized indicatorCode, or a non-canonical reference here would
// never match its (now-Unicode) course-plan entry. The item-index group is \d+, not \d, because
// tier Ⅵ (src/data/indicators.js) is the only tier with domains that run past 9 items.
const INDICATOR_CODE_IN_TEXT_PATTERN = /(?:[ⅠⅡⅢⅣⅤⅥ]|IⅤ|III|IV|II|I|V)-\d-\d+/g;

// parentReportDocxExport.js's referencedIndicatorLines() prepends one line per linked
// course-plan entry — formatted exactly "code　description" — before a developmentRecordEntry's
// own narrative, when exporting (see that file). Strip that leading run of lines back off here on
// import, so re-importing a file this app exported doesn't bake them into the narrative — they'd
// otherwise duplicate on every further export→re-import cycle. A line only counts if it exactly
// reproduces a real indicator's own code AND description; anything else (a legacy file with no
// such lines, or a narrative that happens to start by mentioning an indicator in different
// wording) is left untouched, matching classifyRecordBlocks' existing conservative approach of
// keeping the full text rather than guessing at a prefix that might not be there.
function stripReferencedIndicatorLines(rawText) {
  const lines = rawText.split('\n');
  let i = 0;
  while (i < lines.length) {
    const match = /^([^　]+)　(.*)$/.exec(lines[i]);
    if (!match) break;
    const indicator = getIndicator(match[1]);
    if (!indicator || indicator.description !== match[2]) break;
    i += 1;
  }
  return lines.slice(i).join('\n').trim();
}

function classifyRecordBlocks(blocks, coursePlanEntries, warnings) {
  const domainByName = new Map(DOMAINS.map(d => [d.name, d.id]));
  const developmentRecordBlocks = [];
  const behaviorObservations = [];

  for (const block of blocks) {
    if (domainByName.has(block.label)) {
      const codeMatches = [...block.rawText.matchAll(INDICATOR_CODE_IN_TEXT_PATTERN)].map(m => normalizeIndicatorCode(m[0]));
      const courseEntryIndexes = coursePlanEntries
        .map((entry, index) => (codeMatches.includes(entry.indicatorCode) ? index : -1))
        .filter(index => index !== -1);
      developmentRecordBlocks.push({ domain: domainByName.get(block.label), courseEntryIndexes, narrative: stripReferencedIndicatorLines(block.rawText) });
    } else if (BEHAVIOR_OBSERVATION_LABEL.test(block.label)) {
      const separatorMatch = BEHAVIOR_OBSERVATION_LABEL.exec(block.label);
      behaviorObservations.push({ title: block.label.slice(separatorMatch[0].length), narrative: block.rawText });
    } else {
      warnings.push(`無法辨識的段落標題「${block.label}」，已略過，請於預覽畫面確認是否需要手動補上`);
    }
  }

  return { developmentRecordBlocks, behaviorObservations };
}

export async function parseParentReportDocxImport(data) {
  const zip = await JSZip.loadAsync(data);
  const documentXml = await zip.file('word/document.xml').async('text');
  const warnings = [];

  const headerFileNames = Object.keys(zip.files).filter(name => /^word\/header\d*\.xml$/.test(name));
  let headerInfo = { name: null, birthDate: null, period: null };
  for (const name of headerFileNames) {
    const xml = await zip.file(name).async('text');
    let text = paragraphJoinedText(xml);
    if (!text.includes('幼兒姓名')) {
      // A nested textbox inside the same outer paragraph as the info text can truncate the
      // paragraph-scoped match before it reaches that text (see flatJoinedText's comment) — fall
      // back to a flat scan, which is immune to that since it doesn't care about paragraph
      // boundaries at all.
      const flatText = flatJoinedText(xml);
      if (flatText.includes('幼兒姓名')) text = flatText;
    }
    if (text.includes('幼兒姓名')) {
      headerInfo = parseHeaderInfo(text);
      break;
    }
  }
  // Fallback: some legacy templates have no separate header part at all — the same 幼兒姓名/
  // 出生年月日/紀錄時間 info instead lives directly in word/document.xml's own body text, near the
  // top of the document, before the first table (verified against a real legacy sample; see the
  // note above extractSortedMediaImages for that file's other header/footer-less quirks).
  if (!headerInfo.name) {
    const firstTableIndex = documentXml.indexOf('<w:tbl>');
    const bodyIntroXml = firstTableIndex === -1 ? documentXml : documentXml.slice(0, firstTableIndex);
    const bodyIntroText = paragraphJoinedText(bodyIntroXml);
    if (bodyIntroText.includes('幼兒姓名')) {
      headerInfo = parseHeaderInfo(bodyIntroText);
    }
  }
  if (!headerInfo.name) warnings.push('無法從檔案中判斷幼兒姓名，請手動輸入');
  if (!headerInfo.birthDate) warnings.push('無法從檔案中判斷出生日期，請手動輸入');
  if (!headerInfo.period) warnings.push('無法從檔案中判斷紀錄年月，請手動選擇');

  const tables = [...documentXml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map(m => m[0]);
  const [coursePlanTableXml, secondTableXml] = tables;

  const { entries: coursePlanEntriesRaw, occurrencesByEntryIndex } = coursePlanTableXml
    ? parseCoursePlanTable(coursePlanTableXml)
    : { entries: [], occurrencesByEntryIndex: {} };

  const inferredYear = headerInfo.period ? Number(/^(\d+)年/.exec(headerInfo.period)[1]) + 1911 : new Date().getFullYear();
  const coursePlanEntries = coursePlanEntriesRaw.map((entry, index) => ({
    ...entry,
    occurrences: (occurrencesByEntryIndex[index] || []).map(o => ({ ...o, date: `${inferredYear}-${o.date}` })),
  }));

  const tier = (() => {
    const counts = new Map();
    for (const entry of coursePlanEntries) {
      const indicator = getIndicator(entry.indicatorCode);
      if (!indicator) continue;
      counts.set(indicator.tier, (counts.get(indicator.tier) || 0) + 1);
    }
    let best = null, bestCount = 0;
    for (const [t, count] of counts) if (count > bestCount) { best = t; bestCount = count; }
    return best;
  })();
  if (!tier) warnings.push('無法從檔案中判斷月齡階段，請手動選擇');

  const blocks = secondTableXml ? parseRecordBlocks(secondTableXml) : [];
  const { developmentRecordBlocks, behaviorObservations } = classifyRecordBlocks(blocks, coursePlanEntries, warnings);

  const photoGroups = secondTableXml ? extractHighlightPhotoGroups(secondTableXml) : [];
  const mediaImages = await extractSortedMediaImages(zip, documentXml);
  let mediaCursor = 0;
  const highlightEntries = photoGroups.map(group => {
    const photos = mediaImages.slice(mediaCursor, mediaCursor + group.photoCount);
    mediaCursor += group.photoCount;
    return { photos, caption: group.caption };
  });
  if (mediaImages.length > mediaCursor) {
    warnings.push('偵測到的照片數量多於點滴分享區塊，部分照片可能未正確歸類，請於預覽畫面確認');
  }

  return {
    child: { name: headerInfo.name, birthDate: headerInfo.birthDate },
    tier,
    period: headerInfo.period,
    coursePlanEntries,
    developmentRecordBlocks,
    behaviorObservations,
    highlightEntries,
    warnings,
  };
}
