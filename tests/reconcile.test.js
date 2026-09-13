import { describe, it, expect } from 'vitest';
import { reconcileByNaturalKey } from '../src/sync/reconcile.js';

const map = entries => new Map(entries.map(([uid, store, payload]) => [uid, { store, payload: { uid, ...payload } }]));

describe('reconcileByNaturalKey', () => {
  it('兩邊各自產生 uid 的同一個孩子會被配對起來', () => {
    const { adopt, differing } = reconcileByNaturalKey({
      localRecords: map([['local-1', 'children', { name: '測試童', birthDate: '2024-01-01' }]]),
      cloudRecords: map([['cloud-1', 'children', { name: '測試童', birthDate: '2024-01-01' }]]),
    });
    expect(adopt.get('local-1')).toBe('cloud-1');
    expect(differing).toEqual([]);
  });

  it('不同的孩子不會被配對', () => {
    const { adopt } = reconcileByNaturalKey({
      localRecords: map([['local-1', 'children', { name: '甲童', birthDate: '2024-01-01' }]]),
      cloudRecords: map([['cloud-1', 'children', { name: '乙童', birthDate: '2024-02-02' }]]),
    });
    expect(adopt.size).toBe(0);
  });

  it('配對成功但內容不同 → 列入 differing 等使用者決定', () => {
    const { adopt, differing } = reconcileByNaturalKey({
      localRecords: map([['local-1', 'behaviorObservations', { reportId: 'r1', title: '午睡', narrative: '本機版' }]]),
      cloudRecords: map([['cloud-1', 'behaviorObservations', { reportId: 'r1', title: '午睡', narrative: '雲端版' }]]),
    });
    expect(adopt.get('local-1')).toBe('cloud-1');
    expect(differing).toEqual([{ localUid: 'local-1', cloudUid: 'cloud-1', store: 'behaviorObservations' }]);
  });

  it('只有 uid／updatedAt／isNew 不同不算內容不同', () => {
    const { differing } = reconcileByNaturalKey({
      localRecords: map([['local-1', 'children', { name: '測試童', birthDate: '2024-01-01', updatedAt: 'T1', isNew: true }]]),
      cloudRecords: map([['cloud-1', 'children', { name: '測試童', birthDate: '2024-01-01', updatedAt: 'T2', isNew: false }]]),
    });
    expect(differing).toEqual([]);
  });

  it('父記錄配對後，子記錄才配得起來', () => {
    const { adopt } = reconcileByNaturalKey({
      localRecords: map([
        ['local-child', 'children', { name: '測試童', birthDate: '2024-01-01' }],
        ['local-form', 'forms', { childId: 'local-child', tier: 'Ⅳ', period: '115年06月' }],
      ]),
      cloudRecords: map([
        ['cloud-child', 'children', { name: '測試童', birthDate: '2024-01-01' }],
        ['cloud-form', 'forms', { childId: 'cloud-child', tier: 'Ⅳ', period: '115年06月' }],
      ]),
    });
    expect(adopt.get('local-child')).toBe('cloud-child');
    expect(adopt.get('local-form')).toBe('cloud-form');
  });

  it('父記錄配不起來時子記錄也不會亂配（避免把兩個孩子的總表混在一起）', () => {
    const { adopt } = reconcileByNaturalKey({
      localRecords: map([
        ['local-child', 'children', { name: '甲童', birthDate: '2024-01-01' }],
        ['local-form', 'forms', { childId: 'local-child', tier: 'Ⅳ', period: '115年06月' }],
      ]),
      cloudRecords: map([
        ['cloud-child', 'children', { name: '乙童', birthDate: '2024-02-02' }],
        ['cloud-form', 'forms', { childId: 'cloud-child', tier: 'Ⅳ', period: '115年06月' }],
      ]),
    });
    expect(adopt.size).toBe(0);
  });

  it('uid 已經一致的記錄不需要配對', () => {
    const { adopt, differing } = reconcileByNaturalKey({
      localRecords: map([['same', 'children', { name: '測試童', birthDate: '2024-01-01' }]]),
      cloudRecords: map([['same', 'children', { name: '測試童', birthDate: '2024-01-01' }]]),
    });
    expect(adopt.size).toBe(0);
    expect(differing).toEqual([]);
  });
});
