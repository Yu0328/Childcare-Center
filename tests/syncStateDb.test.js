import { describe, it, expect, beforeEach } from 'vitest';
import {
  readSyncState, writeSyncState, deleteSyncState,
  listTombstones, deleteTombstone, purgeExpiredTombstones, TOMBSTONE_TTL_MS,
} from '../src/storage/syncStateDb.js';
import { runRequest } from '../src/storage/dbCore.js';
import { addChild, deleteChild, clearAllData } from '../src/storage/db.js';

describe('syncStateDb', () => {
  beforeEach(async () => {
    await clearAllData();
    for (const tombstone of await listTombstones()) await deleteTombstone(tombstone.uid);
  });

  it('寫入與讀回同步基準', async () => {
    await writeSyncState({ uid: 'u1', store: 'children', hash: 'abc', fileId: 'f1', syncedAt: '2026-09-13T01:00:00.000Z' });
    expect((await readSyncState()).get('u1')).toEqual({
      uid: 'u1', store: 'children', hash: 'abc', fileId: 'f1', syncedAt: '2026-09-13T01:00:00.000Z',
    });
  });

  it('刪除同步基準', async () => {
    await writeSyncState({ uid: 'u1', store: 'children', hash: 'abc', fileId: 'f1', syncedAt: 'x' });
    await deleteSyncState('u1');
    expect((await readSyncState()).has('u1')).toBe(false);
  });

  it('列出 dbCore 留下的墓碑並可個別清除', async () => {
    const child = await addChild({ name: '測試童', birthDate: '2024-01-01' });
    await deleteChild(child.id);

    expect((await listTombstones()).map(t => t.uid)).toContain(child.uid);
    await deleteTombstone(child.uid);
    expect((await listTombstones()).map(t => t.uid)).not.toContain(child.uid);
  });

  it('只清除超過 30 天的墓碑', async () => {
    const now = Date.parse('2026-09-13T00:00:00.000Z');
    await runRequest('tombstones', 'readwrite', store =>
      store.put({ uid: 'old', store: 'children', deletedAt: new Date(now - TOMBSTONE_TTL_MS - 1000).toISOString() })
    );
    await runRequest('tombstones', 'readwrite', store =>
      store.put({ uid: 'fresh', store: 'children', deletedAt: new Date(now - 1000).toISOString() })
    );

    expect(await purgeExpiredTombstones(now)).toBe(1);
    expect((await listTombstones()).map(t => t.uid)).toEqual(['fresh']);
  });
});
