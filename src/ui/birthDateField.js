// Gregorian year/month/day <select> triplet for 出生日期 fields, replacing native
// <input type="date">. On macOS Safari, that native picker's calendar popup has no year-jump —
// only ‹ › month-at-a-time navigation — so entering a birthdate years in the past means paging
// back one month at a time. Plain <select> dropdowns (same approach as periodFields.js's ROC
// year/month selects) let staff jump straight to any year instead.

const CURRENT_YEAR = new Date().getFullYear();
// Covers this app's 0-2(+)-year-old population with headroom for backfilling an older child's
// records; a birth year further back than this is not a case this app's data is scoped for.
const YEAR_RANGE_BACK = 6;

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function birthDateYearOptions() {
  const years = [];
  for (let year = CURRENT_YEAR; year >= CURRENT_YEAR - YEAR_RANGE_BACK; year -= 1) years.push(year);
  return years;
}

function dayOptionsHtml(dayCount, selectedDay) {
  return Array.from({ length: dayCount }, (_, i) => i + 1)
    .map(day => `<option value="${day}" ${day === selectedDay ? 'selected' : ''}>${day}</option>`)
    .join('');
}

// value: an ISO "YYYY-MM-DD" string (or '' / undefined for a blank field).
export function birthDateSelectsHtml({ yearFieldName, monthFieldName, dayFieldName, value }) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  const selectedYear = match ? Number(match[1]) : '';
  const selectedMonth = match ? Number(match[2]) : '';
  const selectedDay = match ? Number(match[3]) : '';
  const dayCount = selectedYear && selectedMonth ? daysInMonth(selectedYear, selectedMonth) : 31;

  return `
    <span class="panel-form__period-row">
      <select data-field="${yearFieldName}">
        <option value="">年</option>
        ${birthDateYearOptions()
          .map(year => `<option value="${year}" ${year === selectedYear ? 'selected' : ''}>${year}</option>`)
          .join('')}
      </select>
      <select data-field="${monthFieldName}">
        <option value="">月</option>
        ${Array.from({ length: 12 }, (_, i) => i + 1)
          .map(month => `<option value="${month}" ${month === selectedMonth ? 'selected' : ''}>${month}</option>`)
          .join('')}
      </select>
      <select data-field="${dayFieldName}">
        <option value="">日</option>
        ${dayOptionsHtml(dayCount, selectedDay)}
      </select>
    </span>
  `;
}

// Keeps the day <select>'s option count correct as year/month change (e.g. Jan 31 -> Feb clamps
// to the 28th/29th instead of leaving an invalid "31" selected).
export function wireBirthDateSelects(container, { yearFieldName, monthFieldName, dayFieldName }) {
  const yearEl = container.querySelector(`[data-field="${yearFieldName}"]`);
  const monthEl = container.querySelector(`[data-field="${monthFieldName}"]`);
  const dayEl = container.querySelector(`[data-field="${dayFieldName}"]`);

  const refreshDayOptions = () => {
    const year = Number(yearEl.value) || CURRENT_YEAR;
    const month = Number(monthEl.value) || 1;
    const dayCount = daysInMonth(year, month);
    const selectedDay = Math.min(Number(dayEl.value) || 0, dayCount) || '';
    dayEl.innerHTML = `<option value="">日</option>${dayOptionsHtml(dayCount, selectedDay)}`;
  };

  yearEl.addEventListener('change', refreshDayOptions);
  monthEl.addEventListener('change', refreshDayOptions);
}

// "" when any of the three selects is blank.
export function parseBirthDateSelects(container, { yearFieldName, monthFieldName, dayFieldName }) {
  const year = container.querySelector(`[data-field="${yearFieldName}"]`).value;
  const month = container.querySelector(`[data-field="${monthFieldName}"]`).value;
  const day = container.querySelector(`[data-field="${dayFieldName}"]`).value;
  if (!year || !month || !day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
