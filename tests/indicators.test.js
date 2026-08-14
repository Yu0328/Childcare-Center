import { describe, it, expect } from 'vitest';
import { TIERS, DOMAINS, INDICATORS, getIndicatorsForTier, getIndicator, previousTier } from '../src/data/indicators.js';

describe('indicator reference data', () => {
  it('has 6 tiers in order Ⅰ through Ⅵ', () => {
    expect(TIERS.map(t => t.code)).toEqual(['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ']);
  });

  it('has 5 domains', () => {
    expect(DOMAINS).toHaveLength(5);
    expect(DOMAINS.map(d => d.name)).toEqual([
      '身體動作', '社會情緒', '語言溝通', '認知探索', '生活自理',
    ]);
  });

  it('has 178 total indicators', () => {
    expect(INDICATORS).toHaveLength(178);
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

  it('getIndicatorsForTier(\'Ⅵ\') combines the Ⅵ (base) and Ⅶ (延伸/進階) source codings under one 25個月以上 tier', () => {
    const indicators = getIndicatorsForTier('Ⅵ');
    expect(indicators).toHaveLength(41);
    expect(indicators.every(i => i.tier === 'Ⅵ' || i.tier === 'Ⅶ')).toBe(true);
    expect(indicators.every(i => i.noActivityName)).toBe(true);
  });

  it('getIndicator looks up a known indicator by code', () => {
    expect(getIndicator('Ⅳ-1-1')).toEqual({
      code: 'Ⅳ-1-1',
      tier: 'Ⅳ',
      domain: 1,
      domainName: '身體動作',
      subdomain: '粗動作、精細動作',
      description: '能獨立穩定行走',
      activityName: '走過來',
      noActivityName: false,
    });
  });

  it('25個月以上 indicators have an empty activityName and noActivityName: true', () => {
    const indicator = getIndicator('Ⅵ-1-1');
    expect(indicator.activityName).toBe('');
    expect(indicator.noActivityName).toBe(true);
  });

  it('getIndicator returns undefined for an unknown code', () => {
    expect(getIndicator('Ⅵ-9-9')).toBeUndefined();
  });

  it('getIndicator also resolves a code stored with a Latin (ASCII) tier prefix instead of the Unicode roman numeral', () => {
    expect(getIndicator('IV-1-1')).toEqual(getIndicator('Ⅳ-1-1'));
    expect(getIndicator('V-1-1')).toEqual(getIndicator('Ⅴ-1-1'));
    expect(getIndicator('III-1-1')).toEqual(getIndicator('Ⅲ-1-1'));
  });

  it('previousTier returns the tier immediately before, null for Ⅰ or an unknown code', () => {
    expect(previousTier('Ⅴ')).toBe('Ⅳ');
    expect(previousTier('Ⅱ')).toBe('Ⅰ');
    expect(previousTier('Ⅰ')).toBeNull();
    expect(previousTier('nope')).toBeNull();
  });
});
