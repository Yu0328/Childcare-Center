import { describe, it, expect, beforeEach, vi } from 'vitest';
import { wireSyncControls } from '../src/sync/wireSyncControls.js';
import { writeSyncMode } from '../src/sync/googleAuth.js';
import { addChild, listChildren, clearAllData } from '../src/storage/db.js';

const idleStatus = {
  phase: 'idle', textSyncedAt: null, photoSyncedAt: null, photoPending: 0, needsReview: 0, error: null,
};

function fakeAuthFactory(behavior = {}) {
  return () => ({
    signIn: behavior.signIn || (async () => ({ name: '小美' })),
    resume: behavior.resume || (async () => ({ name: '小美' })),
    getAccessToken: async () => 'tok',
    signOut: behavior.signOut || (() => {}),
    isSignedIn: () => true,
  });
}

function fakeEngine(overrides = {}) {
  return {
    runSync: overrides.runSync || (async () => idleStatus),
    scheduleSync: overrides.scheduleSync || (() => {}),
    getStatus: () => idleStatus,
  };
}

describe('wireSyncControls', () => {
  let container;
  let syncSlot;

  beforeEach(async () => {
    localStorage.clear();
    await clearAllData();
    container = document.createElement('div');
    syncSlot = document.createElement('div');
    document.body.append(container, syncSlot);
  });

  it('第一次進來時顯示登入選擇畫面，選訪客後才繼續', async () => {
    const controls = wireSyncControls({
      clientId: 'test', syncSlot,
      createAuth: fakeAuthFactory(),
      createDrive: () => ({}),
      createEngine: () => fakeEngine(),
    });

    const onDone = vi.fn();
    await controls.gate(container, { onDone });

    expect(container.querySelector('[data-action="continue-guest"]')).toBeTruthy();
    container.querySelector('[data-action="continue-guest"]').click();
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(syncSlot.querySelector('[data-action="sync-sign-in"]')).toBeTruthy();
  });

  it('之前選過訪客就直接繼續，不再問', async () => {
    writeSyncMode('guest');
    const controls = wireSyncControls({
      clientId: 'test', syncSlot,
      createAuth: fakeAuthFactory(), createDrive: () => ({}), createEngine: () => fakeEngine(),
    });

    const onDone = vi.fn();
    await controls.gate(container, { onDone });
    expect(onDone).toHaveBeenCalled();
    expect(container.querySelector('[data-action="continue-guest"]')).toBe(null);
  });

  it('之前登入過就靜默續用、開啟後立刻同步一次', async () => {
    writeSyncMode('google');
    localStorage.setItem('c-form-sync-name', '小美');
    const runSync = vi.fn().mockResolvedValue(idleStatus);
    const controls = wireSyncControls({
      clientId: 'test', syncSlot,
      createAuth: fakeAuthFactory(), createDrive: () => ({}),
      createEngine: () => fakeEngine({ runSync }),
    });

    await controls.gate(container, { onDone: () => {} });
    expect(syncSlot.querySelector('[data-sync-greeting]').textContent).toContain('小美');
    await vi.waitFor(() => expect(runSync).toHaveBeenCalled());
  });

  it('授權被收回（resume 回 null）時顯示不自動消失的警示', async () => {
    writeSyncMode('google');
    localStorage.setItem('c-form-sync-name', '小美');
    const controls = wireSyncControls({
      clientId: 'test', syncSlot,
      createAuth: fakeAuthFactory({ resume: async () => null }),
      createDrive: () => ({}), createEngine: () => fakeEngine(),
    });

    await controls.gate(container, { onDone: () => {} });
    const statusEl = syncSlot.querySelector('[data-sync-status]');
    expect(statusEl.textContent).toBe('登入已失效，請重新登入');
    expect(statusEl.dataset.persistent).toBe('true');
  });

  it('登出後標題列回到訪客模式，IndexedDB 裡的資料還在', async () => {
    writeSyncMode('google');
    localStorage.setItem('c-form-sync-name', '小美');
    await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const signOut = vi.fn();
    const controls = wireSyncControls({
      clientId: 'test', syncSlot,
      createAuth: fakeAuthFactory({ signOut }),
      createDrive: () => ({}), createEngine: () => fakeEngine(),
    });

    await controls.gate(container, { onDone: () => {} });
    syncSlot.querySelector('[data-action="sync-sign-out"]').click();

    expect(signOut).toHaveBeenCalled();
    expect(syncSlot.querySelector('[data-action="sync-sign-in"]')).toBeTruthy();
    expect((await listChildren()).map(c => c.name)).toEqual(['測試童']);
  });

  it('登出後 visibilitychange／online 事件不會再觸發同步', async () => {
    writeSyncMode('google');
    localStorage.setItem('c-form-sync-name', '小美');
    const scheduleSync = vi.fn();
    const controls = wireSyncControls({
      clientId: 'test', syncSlot,
      createAuth: fakeAuthFactory(),
      createDrive: () => ({}), createEngine: () => fakeEngine({ scheduleSync }),
    });

    await controls.gate(container, { onDone: () => {} });
    syncSlot.querySelector('[data-action="sync-sign-out"]').click();
    scheduleSync.mockClear();

    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));

    expect(scheduleSync).not.toHaveBeenCalled();
  });
});
