import { describe, it, expect } from 'vitest';
import { findTodayWords } from '../src/domain/findTodayWords.js';
import { DOMAINS } from '../src/data/indicators.js';

const empty = {
  coursePlanEntries: [], courseOccurrencesByEntryId: {},
  developmentRecordEntries: [], behaviorObservations: [], highlightEntries: [],
};

describe('findTodayWords', () => {
  it('returns nothing when no field mentions 今天/今日', () => {
    expect(findTodayWords({
      ...empty,
      coursePlanEntries: [{ id: 'e1', activityName: '積木' }],
      courseOccurrencesByEntryId: { e1: [{ id: 'o1', date: '2026-10-03', note: '玩積木' }] },
      behaviorObservations: [{ id: 'b1', title: '分享', narrative: undefined }],
    })).toEqual([]);
  });

  it('finds every field kind, in tab order, with labels', () => {
    const domain = DOMAINS[0];
    const hits = findTodayWords({
      coursePlanEntries: [{ id: 'e1', activityName: '積木遊戲' }],
      courseOccurrencesByEntryId: { e1: [
        { id: 'o1', date: '2026-10-03', note: '今天很專心' },
        { id: 'o2', date: '2026-10-04', note: '沒有' },
      ] },
      developmentRecordEntries: [{ id: 'd1', domain: domain.id, narrative: '今日表現穩定' }],
      behaviorObservations: [{ id: 'b1', title: '今天的分享', narrative: '他今日主動幫忙' }],
      highlightEntries: [{ id: 'h1', caption: '今天去公園' }],
    });
    expect(hits).toEqual([
      { kind: 'occurrence', id: 'o1', label: '課程計畫表｜積木遊戲｜115/10/03 說明', text: '今天很專心' },
      { kind: 'developmentRecord', id: 'd1', label: `適性發展紀錄表｜${domain.name}`, text: '今日表現穩定' },
      { kind: 'observationTitle', id: 'b1', label: '行為觀察｜標題', text: '今天的分享' },
      { kind: 'observationNarrative', id: 'b1', label: '行為觀察｜今天的分享｜內容', text: '他今日主動幫忙' },
      { kind: 'highlight', id: 'h1', label: '點滴分享｜照片說明', text: '今天去公園' },
    ]);
  });
});
