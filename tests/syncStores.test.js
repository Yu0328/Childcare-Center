import { describe, it, expect } from 'vitest';
import {
  SYNC_STORES, canonicalJson, hashPayload, serializeRecord, deserializeRecord,
} from '../src/sync/syncStores.js';

const uidOf = (store, id) => (id === undefined || id === null ? undefined : `${store}-uid-${id}`);
const idOf = uid => {
  const match = /-uid-(\d+)$/.exec(uid || '');
  return match ? Number(match[1]) : undefined;
};

describe('SYNC_STORES 順序', () => {
  it('父表一定排在子表之前', () => {
    const order = SYNC_STORES.map(s => s.store);
    for (const { store, refs } of SYNC_STORES) {
      for (const ref of Object.values(refs)) {
        expect(order.indexOf(ref.store)).toBeLessThan(order.indexOf(store));
      }
    }
  });

  it('涵蓋規格列出的每一張要同步的表', () => {
    expect(SYNC_STORES.map(s => s.store)).toEqual([
      'children', 'forms', 'entries',
      'parentReports', 'coursePlanEntries', 'courseOccurrences',
      'developmentRecordEntries', 'behaviorObservations', 'highlightEntries',
      'monthlyCoursePlans', 'planSlots', 'planSlotItems', 'childItemOverrides',
    ]);
  });
});

describe('canonicalJson', () => {
  it('key 順序不同但內容相同的兩個物件產出同一個字串', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it('陣列順序仍然有意義', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });
});

describe('hashPayload', () => {
  it('相同內容同雜湊、不同內容不同雜湊', async () => {
    expect(await hashPayload({ a: 1, b: 2 })).toBe(await hashPayload({ b: 2, a: 1 }));
    expect(await hashPayload({ a: 1 })).not.toBe(await hashPayload({ a: 2 }));
    expect(await hashPayload({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('serializeRecord', () => {
  it('把單一外鍵換成 uid 並移除本機 id', () => {
    expect(serializeRecord('forms', {
      id: 7, uid: 'form-uid', childId: 3, tier: 'Ⅳ', period: '115年06月', updatedAt: 'T',
    }, uidOf)).toEqual({
      uid: 'form-uid', childId: 'children-uid-3', tier: 'Ⅳ', period: '115年06月', updatedAt: 'T',
    });
  });

  it('把外鍵陣列與以 childId 當 key 的物件都換成 uid', () => {
    const payload = serializeRecord('monthlyCoursePlans', {
      id: 2, uid: 'plan-uid', period: '115年06月',
      childIds: [3, 4], childTiers: { 3: 'Ⅳ', 4: 'Ⅴ' }, updatedAt: 'T',
    }, uidOf);
    expect(payload.childIds).toEqual(['children-uid-3', 'children-uid-4']);
    expect(payload.childTiers).toEqual({ 'children-uid-3': 'Ⅳ', 'children-uid-4': 'Ⅴ' });
    expect(payload.id).toBeUndefined();
  });

  it('點滴分享的照片只留描述子，不含 blob', () => {
    const payload = serializeRecord('highlightEntries', {
      id: 1, uid: 'hl-uid', reportId: 5, caption: '玩水',
      photos: [{ photoUid: 'p1', width: 960, height: 640, blob: new Blob(['x'], { type: 'image/jpeg' }) }],
      updatedAt: 'T',
    }, uidOf);
    expect(payload.photos).toEqual([{ photoUid: 'p1', width: 960, height: 640, type: 'image/jpeg' }]);
  });
});

describe('deserializeRecord', () => {
  it('把 uid 外鍵換回本機 id', () => {
    expect(deserializeRecord('forms', {
      uid: 'form-uid', childId: 'children-uid-3', tier: 'Ⅳ', period: '115年06月', updatedAt: 'T',
    }, (store, uid) => idOf(uid))).toEqual({
      uid: 'form-uid', childId: 3, tier: 'Ⅳ', period: '115年06月', updatedAt: 'T',
    });
  });

  it('照片描述子能撿回已下載的 blob，撿不到的留空等補下載', () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    const record = deserializeRecord('highlightEntries', {
      uid: 'hl-uid', reportId: 'parentReports-uid-5', caption: '玩水', updatedAt: 'T',
      photos: [
        { photoUid: 'p1', width: 960, height: 640, type: 'image/jpeg' },
        { photoUid: 'p2', width: 960, height: 640, type: 'image/jpeg' },
      ],
    }, (store, uid) => idOf(uid), [{ photoUid: 'p1', width: 960, height: 640, blob }]);

    expect(record.photos[0].blob).toBe(blob);
    expect(record.photos[1].blob).toBeUndefined();
    expect(record.photos[1].photoUid).toBe('p2');
  });

  it('外鍵指向還沒下載到本機的父記錄時回傳 null', () => {
    expect(deserializeRecord('forms', { uid: 'x', childId: 'children-uid-nope' }, () => undefined)).toBe(null);
  });
});
