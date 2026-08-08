import { describe, it, expect } from 'vitest';
import { TIERS, DOMAINS, INDICATORS, getIndicatorsForTier, getIndicator } from '../src/data/indicators.js';

describe('indicator reference data', () => {
  it('has 5 tiers in order Ⅰ through Ⅴ', () => {
    expect(TIERS.map(t => t.code)).toEqual(['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ']);
  });

  it('has 5 domains', () => {
    expect(DOMAINS).toHaveLength(5);
    expect(DOMAINS.map(d => d.name)).toEqual([
      '身體動作', '社會情緒', '語言溝通', '認知探索', '生活自理',
    ]);
  });

  it('has 137 total indicators', () => {
    expect(INDICATORS).toHaveLength(137);
  });

  it('every indicator code matches its tier and domain', () => {
    for (const indicator of INDICATORS) {
      expect(indicator.code.startsWith(`${indicator.tier}-${indicator.domain}-`)).toBe(true);
    }
  });

  it('getIndicatorsForTier returns only that tier, with correct counts per tier', () => {
    expect(getIndicatorsForTier('Ⅰ')).toHaveLength(18);
    expect(getIndicatorsForTier('Ⅱ')).toHaveLength(23);
    expect(getIndicatorsForTier('Ⅲ')).toHaveLength(29);
    expect(getIndicatorsForTier('Ⅳ')).toHaveLength(32);
    expect(getIndicatorsForTier('Ⅴ')).toHaveLength(35);
    for (const indicator of getIndicatorsForTier('Ⅳ')) {
      expect(indicator.tier).toBe('Ⅳ');
    }
  });

  it('getIndicator looks up a known indicator by code', () => {
    expect(getIndicator('Ⅳ-1-1')).toEqual({
      code: 'Ⅳ-1-1',
      tier: 'Ⅳ',
      domain: 1,
      domainName: '身體動作',
      subdomain: '粗動作、精細動作',
      description: '能獨立穩定行走',
    });
  });

  it('getIndicator returns undefined for an unknown code', () => {
    expect(getIndicator('Ⅵ-9-9')).toBeUndefined();
  });
});
