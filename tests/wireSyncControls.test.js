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

// gate() no longer auto-resumes a previously-signed-in device on load (see below) — every test
// that needs an actually-connected google header clicks through this same button first.
async function clickSignIn(syncSlot) {
  syncSlot.querySelector('[data-action="sync-sign-in"]').click();
  await vi.waitFor(() => expect(syncSlot.querySelector('[data-action="sync-sign-out"]')).toBeTruthy());
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

  it('之前登入過的裝置重整後，顯示登入按鈕而不是自動彈出 Google 視窗，點了才連線同步', async () => {
    // 自動彈視窗曾經造成兩個問題：被瀏覽器擋掉（沒有使用者手勢），或是真的跳出來卻讓人措手不及、
    // 來不及在逾時內完成。改成等一個明確的點擊，任何跳出來的視窗都不會被擋，使用者也能自己抓時間。
    writeSyncMode('google');
    localStorage.setItem('c-form-sync-name', '小美');
    const resume = vi.fn();
    const runSync = vi.fn().mockResolvedValue(idleStatus);
    const controls = wireSyncControls({
      clientId: 'test', syncSlot,
      createAuth: fakeAuthFactory({ resume }), createDrive: () => ({}),
      createEngine: () => fakeEngine({ runSync }),
    });

    await controls.gate(container, { onDone: () => {} });
    expect(resume).not.toHaveBeenCalled();
    expect(syncSlot.querySelector('[data-action="sync-sign-in"]')).toBeTruthy();
    expect(syncSlot.querySelector('[data-sync-greeting]')).toBe(null);
    expect(runSync).not.toHaveBeenCalled();

    await clickSignIn(syncSlot);
    expect(syncSlot.querySelector('[data-sync-greeting]').textContent).toContain('小美');
    await vi.waitFor(() => expect(runSync).toHaveBeenCalled());
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
    await clickSignIn(syncSlot);
    syncSlot.querySelector('[data-action="sync-sign-out"]').click();

    expect(signOut).toHaveBeenCalled();
    expect(syncSlot.querySelector('[data-action="sync-sign-in"]')).toBeTruthy();
    expect((await listChildren()).map(c => c.name)).toEqual(['測試童']);
  });

  it('點「立即同步」會直接觸發一次同步，不用等 debounce', async () => {
    writeSyncMode('google');
    localStorage.setItem('c-form-sync-name', '小美');
    const runSync = vi.fn().mockResolvedValue(idleStatus);
    const controls = wireSyncControls({
      clientId: 'test', syncSlot,
      createAuth: fakeAuthFactory(), createDrive: () => ({}),
      createEngine: () => fakeEngine({ runSync }),
    });

    await controls.gate(container, { onDone: () => {} });
    await clickSignIn(syncSlot);
    await vi.waitFor(() => expect(runSync).toHaveBeenCalledTimes(1)); // 登入後自動同步的那一次

    syncSlot.querySelector('[data-action="sync-now"]').click();
    expect(runSync).toHaveBeenCalledTimes(2);
  });

  it('分頁一直開著、沒有切換或重整時，過一段時間仍會自動再檢查一次', async () => {
    vi.useFakeTimers();
    try {
      writeSyncMode('google');
      localStorage.setItem('c-form-sync-name', '小美');
      const scheduleSync = vi.fn();
      const controls = wireSyncControls({
        clientId: 'test', syncSlot,
        createAuth: fakeAuthFactory(), createDrive: () => ({}),
        createEngine: () => fakeEngine({ scheduleSync }),
      });

      await controls.gate(container, { onDone: () => {} });
      await clickSignIn(syncSlot);
      await vi.advanceTimersByTimeAsync(120000);

      expect(scheduleSync).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
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
    await clickSignIn(syncSlot);
    syncSlot.querySelector('[data-action="sync-sign-out"]').click();
    scheduleSync.mockClear();

    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));

    expect(scheduleSync).not.toHaveBeenCalled();
  });
});
