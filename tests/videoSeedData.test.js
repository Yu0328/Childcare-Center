import { describe, it, expect } from 'vitest';
import { BACKUP, CHILDREN, NEW_CHILD, IMPORT_FORM } from '../video/seed/data.mjs';
import { TODAY_WORDS } from '../src/domain/findTodayWords.js';
import { getIndicator } from '../src/data/indicators.js';
import { calculateAgeInMonths } from '../src/domain/ageTier.js';

const strings = value => (typeof value === 'string' ? [value]
  : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : []);

describe('video demo data', () => {
  const all = { BACKUP, CHILDREN, NEW_CHILD, IMPORT_FORM };

  it('never contains 今天 or 今日', () => {
    expect(strings(all).filter(s => TODAY_WORDS.some(w => s.includes(w)))).toEqual([]);
  });

  it('uses absolute YYYY-MM-DD dates', () => {
    const dates = [
      ...CHILDREN.map(c => c.birthDate), NEW_CHILD.birthDate,
      ...BACKUP.courseOccurrences.map(o => o.date), ...IMPORT_FORM.entries.map(e => e[1]),
    ];
    for (const d of dates) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('only uses real indicator codes', () => {
    const codes = [...BACKUP.coursePlanEntries.map(e => e.indicatorCode), ...IMPORT_FORM.entries.map(e => e[0])];
    for (const code of codes) expect(getIndicator(code), code).toBeTruthy();
  });

  it('has unique names, resolvable references, and does not seed the on-camera child', () => {
    const names = CHILDREN.map(c => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain(NEW_CHILD.name);
    expect(names).toContain(IMPORT_FORM.childName);
    const childIds = new Set(CHILDREN.map(c => c.id));
    const reportIds = new Set(BACKUP.parentReports.map(r => r.id));
    const entryIds = new Set(BACKUP.coursePlanEntries.map(e => e.id));
    for (const r of BACKUP.parentReports) expect(childIds.has(r.childId)).toBe(true);
    for (const e of BACKUP.coursePlanEntries) expect(reportIds.has(e.reportId)).toBe(true);
    for (const o of BACKUP.courseOccurrences) expect(entryIds.has(o.entryId)).toBe(true);
    for (const d of BACKUP.developmentRecordEntries) for (const id of d.courseEntryIds) expect(entryIds.has(id)).toBe(true);
  });

  it('puts the children in the tiers the scripts expect on the recording date', () => {
    const on = '2026-11-16';
    const months = name => calculateAgeInMonths(CHILDREN.find(c => c.name === name).birthDate, on);
    for (const name of ['王小明', '林小美', '陳小華', '黃小寶']) expect(months(name)).toBeGreaterThanOrEqual(19);
    for (const name of ['王小明', '林小美', '陳小華', '黃小寶']) expect(months(name)).toBeLessThanOrEqual(24);
    expect(months('張小安')).toBeLessThanOrEqual(18);
  });
});
