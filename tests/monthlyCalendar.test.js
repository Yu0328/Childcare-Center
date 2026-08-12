import { describe, it, expect } from 'vitest';
import { buildMonthlyCalendar } from '../src/domain/monthlyCalendar.js';

describe('buildMonthlyCalendar', () => {
  it('splits a month that starts on Monday and ends on Tuesday into 5 weeks, last one partial', () => {
    // June 2026: 6/1 is a Monday, 6/30 is a Tuesday.
    const weeks = buildMonthlyCalendar(2026, 6);

    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual({
      weekIndex: 1,
      dateRange: '06/01-06/05',
      days: [
        { weekday: 1, isoDate: '2026-06-01', dateLabel: '06/01(一)' },
        { weekday: 2, isoDate: '2026-06-02', dateLabel: '06/02(二)' },
        { weekday: 3, isoDate: '2026-06-03', dateLabel: '06/03(三)' },
        { weekday: 4, isoDate: '2026-06-04', dateLabel: '06/04(四)' },
        { weekday: 5, isoDate: '2026-06-05', dateLabel: '06/05(五)' },
      ],
    });
    expect(weeks[4]).toEqual({
      weekIndex: 5,
      dateRange: '06/29-06/30',
      days: [
        { weekday: 1, isoDate: '2026-06-29', dateLabel: '06/29(一)' },
        { weekday: 2, isoDate: '2026-06-30', dateLabel: '06/30(二)' },
      ],
    });
  });

  it('gives the first week fewer than 5 days when the month starts mid-week', () => {
    // July 2026: 7/1 is a Wednesday.
    const weeks = buildMonthlyCalendar(2026, 7);

    expect(weeks[0].days.map(d => d.weekday)).toEqual([3, 4, 5]);
    expect(weeks[0].dateRange).toBe('07/01-07/03');
  });

  it('never includes a Saturday or Sunday', () => {
    const weeks = buildMonthlyCalendar(2026, 6);
    const allWeekdays = weeks.flatMap(w => w.days.map(d => d.weekday));
    expect(allWeekdays.every(w => w >= 1 && w <= 5)).toBe(true);
  });
});
