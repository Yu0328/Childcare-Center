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
