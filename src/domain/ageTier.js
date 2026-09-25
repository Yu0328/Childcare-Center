import { TIERS } from '../data/indicators.js';

export function calculateAgeInMonths(birthDate, asOfDate) {
  const birth = new Date(`${birthDate}T00:00:00`);
  const asOf = new Date(`${asOfDate}T00:00:00`);

  let months = (asOf.getFullYear() - birth.getFullYear()) * 12 + (asOf.getMonth() - birth.getMonth());
  if (asOf.getDate() < birth.getDate()) {
    months -= 1;
  }
  return Math.max(0, months);
}

export function suggestTier(birthDate, asOfDate) {
  const months = calculateAgeInMonths(birthDate, asOfDate);
  const tier = TIERS.find(t => months >= t.minMonths && months <= t.maxMonths);
  return tier ? tier.code : null;
}

// "Today" as the device's own calendar date. toISOString() is UTC, which in Taiwan (UTC+8) still
// reads as yesterday until 08:00 — enough to undercount a child's age on their month-day.
export function todayIsoDate(now = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
