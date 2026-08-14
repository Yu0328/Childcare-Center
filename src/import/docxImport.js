import JSZip from 'jszip';
import { getIndicator } from '../data/indicators.js';

function cellText(cellXml) {
  return [...cellXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
    .map(match => match[1])
    .join('')
    .trim();
}

function cellsForRow(rowXml) {
  return [...rowXml.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map(match => cellText(match[1]));
}

function rowsOf(documentXml) {
  return [...documentXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(match => match[0]);
}

function extractHeaderText(headerXml) {
  const paragraphs = [...headerXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map(match =>
    [...match[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join('')
  );
  return paragraphs.join(' ');
}

// ROC "113/11/01" -> "2024-11-01"
function rocDateToIso(rocDate) {
  const match = /^(\d{1,3})\/(\d{1,2})\/(\d{1,2})$/.exec(rocDate.trim());
  if (!match) return null;
  const [, rocYear, month, day] = match;
  return `${Number(rocYear) + 1911}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function parseHeaderInfo(headerText) {
  const nameMatch = /幼兒姓名[：:]\s*([^\s　出]+)/.exec(headerText);
  const birthMatch = /出生日期[：:]\s*(\d{1,3}\/\d{1,2}\/\d{1,2})/.exec(headerText);
  const periodMatch = /實施時間[：:]\s*(\d{1,3})年\s*(\d{1,2})月/.exec(headerText);

  return {
    name: nameMatch ? nameMatch[1] : null,
    birthDate: birthMatch ? rocDateToIso(birthMatch[1]) : null,
    period: periodMatch ? `${periodMatch[1]}年${periodMatch[2].padStart(2, '0')}月` : null,
  };
}

async function findHeaderInfo(zip) {
  const headerFileNames = Object.keys(zip.files).filter(name => /^word\/header\d*\.xml$/.test(name));
  for (const name of headerFileNames) {
    const xml = await zip.file(name).async('text');
    const text = extractHeaderText(xml);
    if (text.includes('幼兒姓名')) {
      return parseHeaderInfo(text);
    }
  }
  return { name: null, birthDate: null, period: null };
}

function inferTier(rawEntries) {
  const counts = new Map();
  for (const entry of rawEntries) {
    if (!entry.indicatorCode) continue;
    const prefix = entry.indicatorCode.split('-')[0];
    counts.set(prefix, (counts.get(prefix) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [prefix, count] of counts) {
    if (count > bestCount) {
      best = prefix;
      bestCount = count;
    }
  }
  return best;
}

function parseBodyRows(documentXml) {
  const bodyRows = rowsOf(documentXml).slice(2); // the first two rows are the fixed table header
  const rawEntries = [];
  let lastCode = null;

  for (const rowXml of bodyRows) {
    const cells = cellsForRow(rowXml);
    if (cells.length < 6) continue;

    const code = cells[2] || lastCode;
    lastCode = code;

    const dateCell = cells[4];
    const note = cells[5];
    if (!dateCell && !note) continue; // an unfilled placeholder row

    const dateMatch = /^(\d{1,2})\/(\d{1,2})/.exec(dateCell);
    if (!dateMatch) continue; // no usable date on this row

    rawEntries.push({
      indicatorCode: code,
      month: Number(dateMatch[1]),
      day: Number(dateMatch[2]),
      achieved: dateCell.includes('○'),
      note,
    });
  }

  return rawEntries;
}

// The table only stores "MM/DD" per entry, no year. Years are inferred by starting from the
// form's recorded 紀錄年月 and rolling forward one year every time a later row's month is smaller
// than the previous row's — i.e. assuming entries are recorded in chronological order over time.
// That assumption only holds *within one indicator's own entries* (rows are grouped by indicator,
// so indicator B's first entry can easily have an earlier month than indicator A's last entry
// without any year having passed) — so the month/year tracking is scoped per indicator code.
function resolveEntryDates(rawEntries, periodYear) {
  const currentYearByIndicator = new Map();
  const lastMonthByIndicator = new Map();

  return rawEntries.map(({ indicatorCode, month, day, achieved, note }) => {
    let currentYear = currentYearByIndicator.get(indicatorCode) ?? periodYear;
    const lastMonth = lastMonthByIndicator.get(indicatorCode) ?? null;

    if (lastMonth !== null && month < lastMonth) currentYear += 1;

    currentYearByIndicator.set(indicatorCode, currentYear);
    lastMonthByIndicator.set(indicatorCode, month);

    const indicator = getIndicator(indicatorCode);
    return {
      indicatorCode,
      date: `${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      achieved,
      note,
      description: indicator ? indicator.description : null,
      // The entry's own tier, read off its indicator code — not necessarily the document's
      // overall (majority-vote) tier: a child not yet developed into every current-tier
      // indicator can have entries genuinely recorded against an earlier tier's codes.
      tier: indicator ? indicator.tier : null,
    };
  });
}

// `data` is whatever JSZip.loadAsync accepts directly — a File/Blob (as handed over by a file
// input, in the browser) or an ArrayBuffer (as built by hand in tests).
export async function parseDocxImport(data) {
  const zip = await JSZip.loadAsync(data);
  const documentXml = await zip.file('word/document.xml').async('text');

  const headerInfo = await findHeaderInfo(zip);
  const rawEntries = parseBodyRows(documentXml);
  const tier = inferTier(rawEntries);

  const warnings = [];
  if (!headerInfo.name) warnings.push('無法從檔案中判斷幼兒姓名，請手動輸入');
  if (!headerInfo.birthDate) warnings.push('無法從檔案中判斷出生日期，請手動輸入');
  if (!tier) warnings.push('無法從檔案中判斷月齡階段，請手動選擇');
  if (!headerInfo.period) warnings.push('無法從檔案中判斷紀錄年月，日期年份可能不準確，請確認每一筆日期');

  const periodYear = headerInfo.period
    ? Number(/^(\d+)年/.exec(headerInfo.period)[1]) + 1911
    : new Date().getFullYear();
  const entries = resolveEntryDates(rawEntries, periodYear);

  if (entries.some(entry => !entry.description)) {
    warnings.push('部分指標代碼無法對應到系統內建的指標，這些項目匯入後可能無法正確顯示，建議確認後再匯入');
  }

  return {
    child: { name: headerInfo.name, birthDate: headerInfo.birthDate },
    tier,
    period: headerInfo.period,
    entries,
    warnings,
  };
}
