export const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

export function currentRocYear() {
  return new Date().getFullYear() - 1911;
}

// A few years back (for backfilling past records) through one year ahead.
export function rocYearOptions() {
  const current = currentRocYear();
  const years = [];
  for (let year = current + 1; year >= current - 5; year -= 1) years.push(year);
  return years;
}

export function periodSelectsHtml({ yearFieldName, monthFieldName, selectedYear, selectedMonth }) {
  return `
    <span class="panel-form__period-row">
      <select data-field="${yearFieldName}">
        ${rocYearOptions()
          .map(year => `<option value="${year}" ${year === selectedYear ? 'selected' : ''}>${year}年</option>`)
          .join('')}
      </select>
      <select data-field="${monthFieldName}">
        ${MONTHS.map(
          month =>
            `<option value="${month}" ${month === selectedMonth ? 'selected' : ''}>${String(month).padStart(2, '0')}月</option>`
        ).join('')}
      </select>
    </span>
  `;
}

// "115年01月" -> { year: 115, month: 1 }; null/unparsable -> {year: null, month: null}
export function parsePeriod(period) {
  const match = /^(\d{1,3})年(\d{1,2})月$/.exec(String(period ?? '').trim());
  if (!match) return { year: null, month: null };
  return { year: Number(match[1]), month: Number(match[2]) };
}

// "114年09月-115年02月" -> { start: "114年09月", end: "115年02月" }; a non-range period returns the
// same value for both, so callers can treat every period as a range uniformly.
export function splitPeriodRange(period) {
  const text = String(period ?? '').trim();
  const dashIndex = text.indexOf('-');
  if (dashIndex === -1) return { start: text, end: text };
  return { start: text.slice(0, dashIndex), end: text.slice(dashIndex + 1) };
}

// Two "115年01月"-style periods -> a single value ("115年01月") when they're the same, or a
// "114年09月-115年02月" range (earlier-first, regardless of argument order) when they differ —
// same min-max-range shape aggregateCoursePlan.js's own combinedPeriodRange produces when merging
// several reports into one form, so a manually-entered multi-month 總表 period looks identical to
// one produced by 彙整.
export function combinedPeriod(periodA, periodB) {
  const [first, last] = [periodA, periodB].sort();
  return first === last ? first : `${first}-${last}`;
}
