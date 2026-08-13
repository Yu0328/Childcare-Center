const WEEKDAY_LABELS = ['一', '二', '三', '四', '五']; // index 0 = weekday 1 (Mon)

// Week ordinals ("第一週"..."第五週") per the reference sample, which uses Chinese numerals, not
// Arabic digits ("第1週"). A Monday-start month never produces more than 5 week buckets, so this
// never needs to go past 五.
const WEEK_ORDINAL_LABELS = ['一', '二', '三', '四', '五'];

export function weekIndexLabel(weekIndex) {
  return WEEK_ORDINAL_LABELS[weekIndex - 1] ?? String(weekIndex);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Splits every weekday (Mon-Fri) of a Gregorian year/month into Monday-start week buckets. The
// first bucket is short if the month doesn't start on Monday; the last is short if it doesn't
// end on Friday. Weekends are dropped entirely (this app has no concept of a "上課日" outside
// Mon-Fri — holidays/停課 within a weekday are handled as ordinary typed-in content, not here).
export function buildMonthlyCalendar(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const weeks = [];
  let currentWeek = null;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month - 1, day);
    const dow = date.getDay(); // 0=Sun..6=Sat
    if (dow === 0 || dow === 6) continue;

    const weekday = dow; // 1=Mon..5=Fri
    if (!currentWeek || weekday === 1) {
      currentWeek = { weekIndex: weeks.length + 1, days: [] };
      weeks.push(currentWeek);
    }
    currentWeek.days.push({
      weekday,
      isoDate: `${year}-${pad2(month)}-${pad2(day)}`,
      dateLabel: `${pad2(month)}/${pad2(day)}(${WEEKDAY_LABELS[weekday - 1]})`,
    });
  }

  return weeks.map(week => {
    const first = week.days[0];
    const last = week.days[week.days.length - 1];
    return {
      weekIndex: week.weekIndex,
      dateRange: `${first.isoDate.slice(5).replace('-', '/')}-${last.isoDate.slice(5).replace('-', '/')}`,
      days: week.days,
    };
  });
}
