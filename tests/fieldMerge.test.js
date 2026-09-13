import { describe, it, expect } from 'vitest';
import { mergeFields } from '../src/sync/fieldMerge.js';

describe('mergeFields', () => {
  it('兩邊值相同就直接採用', () => {
    const { merged, conflicts } = mergeFields({ a: 1 }, { a: 1 }, { a: 1 });
    expect(merged).toEqual({ a: 1 });
    expect(conflicts).toEqual([]);
  });

  it('只有雲端改過某欄位 → 採雲端', () => {
    const { merged, conflicts } = mergeFields({ a: 1, b: 2 }, { a: 1, b: 2 }, { a: 9, b: 2 });
    expect(merged).toEqual({ a: 9, b: 2 });
    expect(conflicts).toEqual([]);
  });

  it('只有本機改過某欄位 → 採本機', () => {
    const { merged, conflicts } = mergeFields({ a: 1, b: 2 }, { a: 1, b: 7 }, { a: 1, b: 2 });
    expect(merged).toEqual({ a: 1, b: 7 });
    expect(conflicts).toEqual([]);
  });

  it('改的是不同欄位 → 兩邊的修改都保留，不算衝突', () => {
    const { merged, conflicts } = mergeFields(
      { caption: '舊說明', note: '舊備註' },
      { caption: '新說明', note: '舊備註' },
      { caption: '舊說明', note: '新備註' }
    );
    expect(merged).toEqual({ caption: '新說明', note: '新備註' });
    expect(conflicts).toEqual([]);
  });

  it('兩邊改了同一個欄位且值不同 → 回報衝突，merged 暫採本機', () => {
    const { merged, conflicts } = mergeFields({ caption: '舊' }, { caption: '本機新' }, { caption: '雲端新' });
    expect(conflicts).toEqual([{ field: 'caption', local: '本機新', cloud: '雲端新' }]);
    expect(merged.caption).toBe('本機新');
  });

  it('沒有基準時，值不同一律算衝突', () => {
    expect(mergeFields(null, { caption: 'A' }, { caption: 'B' }).conflicts)
      .toEqual([{ field: 'caption', local: 'A', cloud: 'B' }]);
  });

  it('沒有基準但值相同不算衝突', () => {
    expect(mergeFields(null, { caption: 'A' }, { caption: 'A' }).conflicts).toEqual([]);
  });

  it('一邊新增照片、另一邊改文字 → 照片取聯集、文字照常合併，不跳衝突', () => {
    const { merged, conflicts } = mergeFields(
      { caption: '舊說明', photos: [{ photoUid: 'p1' }] },
      { caption: '舊說明', photos: [{ photoUid: 'p1' }, { photoUid: 'p2' }] },
      { caption: '新說明', photos: [{ photoUid: 'p1' }] },
      { unionArrayFields: ['photos'] }
    );
    expect(conflicts).toEqual([]);
    expect(merged.caption).toBe('新說明');
    expect(merged.photos.map(p => p.photoUid)).toEqual(['p1', 'p2']);
  });

  it('兩邊各加一張照片 → 兩張都留', () => {
    const { merged } = mergeFields(
      { photos: [] }, { photos: [{ photoUid: 'p2' }] }, { photos: [{ photoUid: 'p3' }] },
      { unionArrayFields: ['photos'] }
    );
    expect(merged.photos.map(p => p.photoUid)).toEqual(['p2', 'p3']);
  });

  it('只有其中一邊有的欄位會被帶進結果', () => {
    expect(mergeFields({}, { onlyLocal: 1 }, { onlyCloud: 2 }).merged).toEqual({ onlyLocal: 1, onlyCloud: 2 });
  });
});
