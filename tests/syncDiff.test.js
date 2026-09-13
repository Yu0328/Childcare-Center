import { describe, it, expect } from 'vitest';
import { planSync } from '../src/sync/diff.js';

const local = entries => new Map(entries.map(([uid, hash]) => [uid, { store: 'children', hash }]));
const cloud = entries => new Map(entries.map(([uid, hash]) => [uid, { store: 'children', hash, fileId: `file-${uid}` }]));
const state = entries => new Map(entries.map(([uid, hash]) => [uid, { hash, fileId: `file-${uid}` }]));

describe('planSync', () => {
  it('本機獨有且從沒同步過 → 上傳新檔', () => {
    const plan = planSync({ local: local([['a', 'h1']]), cloud: cloud([]), state: state([]), tombstones: [] });
    expect(plan.creates).toEqual(['a']);
    expect(plan.uploads).toEqual([]);
  });

  it('雲端獨有且從沒同步過 → 下載（換新裝置登入時補齊）', () => {
    const plan = planSync({ local: local([]), cloud: cloud([['a', 'h1']]), state: state([]), tombstones: [] });
    expect(plan.downloads).toEqual(['a']);
  });

  it('同步過但雲端已不存在 → 本機也刪掉', () => {
    const plan = planSync({ local: local([['a', 'h1']]), cloud: cloud([]), state: state([['a', 'h1']]), tombstones: [] });
    expect(plan.localDeletes).toEqual(['a']);
    expect(plan.creates).toEqual([]);
  });

  it('本機有墓碑 → 把雲端那份丟進垃圾桶', () => {
    const plan = planSync({
      local: local([]), cloud: cloud([['a', 'h1']]), state: state([['a', 'h1']]),
      tombstones: [{ uid: 'a', store: 'children' }],
    });
    expect(plan.trashes).toEqual([{ uid: 'a', fileId: 'file-a' }]);
    expect(plan.downloads).toEqual([]);
  });

  it('墓碑優先：即使雲端之後又被改過，也還是刪除', () => {
    const plan = planSync({
      local: local([]), cloud: cloud([['a', 'h2']]), state: state([['a', 'h1']]),
      tombstones: [{ uid: 'a', store: 'children' }],
    });
    expect(plan.trashes).toEqual([{ uid: 'a', fileId: 'file-a' }]);
  });

  it('墓碑但雲端已經沒有那筆 → 什麼都不做', () => {
    const plan = planSync({
      local: local([]), cloud: cloud([]), state: state([]),
      tombstones: [{ uid: 'a', store: 'children' }],
    });
    expect(plan.trashes).toEqual([]);
    expect(plan.creates).toEqual([]);
  });

  it('兩邊 hash 相同 → 不動作', () => {
    const plan = planSync({ local: local([['a', 'h1']]), cloud: cloud([['a', 'h1']]), state: state([['a', 'h1']]), tombstones: [] });
    expect(plan.upToDate).toEqual(['a']);
    expect(plan.uploads).toEqual([]);
    expect(plan.downloads).toEqual([]);
  });

  it('只有本機改過 → 上傳', () => {
    const plan = planSync({ local: local([['a', 'h2']]), cloud: cloud([['a', 'h1']]), state: state([['a', 'h1']]), tombstones: [] });
    expect(plan.uploads).toEqual(['a']);
  });

  it('只有雲端改過 → 下載', () => {
    const plan = planSync({ local: local([['a', 'h1']]), cloud: cloud([['a', 'h2']]), state: state([['a', 'h1']]), tombstones: [] });
    expect(plan.downloads).toEqual(['a']);
  });

  it('兩邊都改過 → 交給欄位合併', () => {
    const plan = planSync({ local: local([['a', 'h2']]), cloud: cloud([['a', 'h3']]), state: state([['a', 'h1']]), tombstones: [] });
    expect(plan.merges).toEqual(['a']);
  });

  it('兩邊都有但沒有基準、內容不同 → 交給欄位合併', () => {
    const plan = planSync({ local: local([['a', 'h2']]), cloud: cloud([['a', 'h3']]), state: state([]), tombstones: [] });
    expect(plan.merges).toEqual(['a']);
  });
});
