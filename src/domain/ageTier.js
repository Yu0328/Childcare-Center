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
