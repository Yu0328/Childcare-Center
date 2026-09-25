import { describe, it, expect } from 'vitest';
import { TIERS, DOMAINS, INDICATORS, getIndicatorsForTier, getIndicator, previousTier, normalizeIndicatorCode, INDICATOR_CODE_PATTERN_SOURCE } from '../src/data/indicators.js';

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
      // Ⅶ-x-y codes are 25個月以上's extension items, filed under tier Ⅵ.
      const codeTier = indicator.code.startsWith('Ⅶ-') ? 'Ⅵ' : indicator.code.split('-')[0];
      expect(codeTier).toBe(indicator.tier);
      expect(indicator.code.split('-')[1]).toBe(String(indicator.domain));
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
    // Ⅶ is only a code prefix, not a tier of its own (TIERS stops at Ⅵ) — a Ⅶ-coded indicator
    // reporting tier 'Ⅶ' made the 總表 importer file those entries into a separate, nonexistent
    // "Ⅶ 階段" form, and made 彙整 flag them as not belonging to their own Ⅵ report.
    expect(indicators.every(i => i.tier === 'Ⅵ')).toBe(true);
    expect(indicators.some(i => i.code.startsWith('Ⅶ-'))).toBe(true);
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

  it('把原始指引裡編號寫錯的 Ⅶ-2-3／Ⅶ-2-4 對應回 Ⅵ-2-3／Ⅵ-2-4（社會情緒沒有 Ⅶ 項目）', () => {
    expect(normalizeIndicatorCode('Ⅶ-2-3')).toBe('Ⅵ-2-3');
    expect(normalizeIndicatorCode('Ⅶ-2-4')).toBe('Ⅵ-2-4');
    expect(getIndicator('Ⅶ-2-3')).toBe(getIndicator('Ⅵ-2-3'));
    expect(normalizeIndicatorCode('Ⅶ-1-1')).toBe('Ⅶ-1-1');
  });

  it('把全形英文字母打的階段代號（ＩＶ-1-1）對應回羅馬數字', () => {
    expect(normalizeIndicatorCode('ＩＶ-1-1')).toBe('Ⅳ-1-1');
    expect(normalizeIndicatorCode('Ｖ-2-3')).toBe('Ⅴ-2-3');
  });

  it('共用的指標代號比對規則認得 Ⅶ、全形字母與常見的打錯寫法', () => {
    const pattern = new RegExp(`^${INDICATOR_CODE_PATTERN_SOURCE}$`);
    for (const code of ['Ⅶ-1-1', 'Ⅵ-3-10', 'ＩＶ-1-2', 'IⅤ-2-1', 'III-1-2', 'V-5-4']) expect(pattern.test(code)).toBe(true);
    expect(pattern.test('KⅤ-1-1')).toBe(false);
  });

  it('之前被匯入成「Ⅶ 階段」的舊總表，仍然顯示 25個月以上 的完整指標', () => {
    expect(getIndicatorsForTier('Ⅶ')).toEqual(getIndicatorsForTier('Ⅵ'));
  });
});
