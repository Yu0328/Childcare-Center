import { describe, it, expect, beforeEach, vi } from 'vitest';
import { greetingFor, formatSyncStatus, renderSyncHeader } from '../src/ui/syncHeader.js';

const at = iso => new Date(iso);

describe('greetingFor', () => {
  it('05:00–11:59 是早安', () => {
    expect(greetingFor(at('2026-09-13T05:00:00'))).toBe('早安');
    expect(greetingFor(at('2026-09-13T11:59:00'))).toBe('早安');
  });

  it('12:00–17:59 是午安', () => {
    expect(greetingFor(at('2026-09-13T12:00:00'))).toBe('午安');
    expect(greetingFor(at('2026-09-13T17:59:00'))).toBe('午安');
  });

  it('18:00–04:59 是晚安（跨午夜）', () => {
    expect(greetingFor(at('2026-09-13T18:00:00'))).toBe('晚安');
    expect(greetingFor(at('2026-09-13T23:30:00'))).toBe('晚安');
    expect(greetingFor(at('2026-09-13T00:30:00'))).toBe('晚安');
    expect(greetingFor(at('2026-09-13T04:59:00'))).toBe('晚安');
  });
});

describe('formatSyncStatus', () => {
  const base = {
    phase: 'done',
    textSyncedAt: '2026-09-13T06:32:00.000Z',
    photoSyncedAt: '2026-09-13T06:32:00.000Z',
    photoPending: 0, needsReview: 0, error: null,
  };

  it('一般情況顯示籠統的上次同步時間', () => {
    expect(formatSyncStatus(base)).toMatch(/^上次同步：\d{2}:\d{2}$/);
  });

  it('照片同步失敗時單獨顯示，不用一個籠統時間誤導使用者', () => {
    const text = formatSyncStatus({ ...base, photoPending: 3, photoSyncedAt: null });
    expect(text).toBe('照片同步失敗（剩 3 張）');
  });

  it('同步中', () => {
    expect(formatSyncStatus({ ...base, phase: 'syncing' })).toBe('同步中…');
  });

  it('第一次同步時說明可能要等一下，而不是單純的「同步中」', () => {
    const text = formatSyncStatus({ ...base, phase: 'syncing', textSyncedAt: null });
    expect(text).toContain('首次同步中');
    expect(text).not.toBe('同步中…');
  });

  it('登入失效的訊息要明確', () => {
    expect(formatSyncStatus({ ...base, phase: 'auth', error: 'AUTH_EXPIRED' })).toBe('登入已失效，請重新登入');
  });

  it('雲端資料夾格式壞掉時說明已停止同步', () => {
    expect(formatSyncStatus({ ...base, phase: 'format', error: 'FORMAT' })).toBe('雲端資料夾異常，已停止同步');
  });

  it('還沒同步過就沒有文字', () => {
    expect(formatSyncStatus({ ...base, phase: 'idle', textSyncedAt: null })).toBe('');
  });
});

describe('renderSyncHeader', () => {
  let slot;
  beforeEach(() => {
    slot = document.createElement('div');
    document.body.appendChild(slot);
  });

  const idle = { phase: 'idle', textSyncedAt: null, photoSyncedAt: null, photoPending: 0, needsReview: 0, error: null };

  it('登入後顯示問候語 + 名字', () => {
    renderSyncHeader(slot, {
      mode: 'google', name: '小美', status: idle,
      onSignIn: () => {}, onSignOut: () => {},
      now: () => at('2026-09-13T09:00:00'),
    });
    expect(slot.querySelector('[data-sync-greeting]').textContent).toBe('早安，小美');
  });

  it('訪客模式顯示登入按鈕', () => {
    renderSyncHeader(slot, {
      mode: 'guest', name: '', status: idle, onSignIn: () => {}, onSignOut: () => {},
    });
    expect(slot.querySelector('[data-action="sync-sign-in"]').textContent).toContain('使用 Google 登入');
  });

  it('訪客模式的問候語顯示「訪客」，且顯示匯出/匯入備份按鈕', () => {
    renderSyncHeader(slot, {
      mode: 'guest', name: '', status: idle, onSignIn: () => {}, onSignOut: () => {},
      now: () => at('2026-09-13T09:00:00'),
    });
    expect(slot.querySelector('[data-sync-greeting]').textContent).toBe('早安，訪客');
    expect(slot.querySelector('#export-backup')).toBeTruthy();
    expect(slot.querySelector('#import-backup')).toBeTruthy();
  });

  it('訪客模式的登入按鈕和收在「備份」選單裡的匯出/匯入備份，都跟問候語同一排', () => {
    renderSyncHeader(slot, {
      mode: 'guest', name: '', status: idle, onSignIn: () => {}, onSignOut: () => {},
    });
    const row = slot.querySelector('[data-action="sync-sign-in"]').closest('.sync-header__greeting-row');
    const menu = slot.querySelector('#export-backup').closest('details.backup-menu');
    expect(row).toBeTruthy();
    expect(menu.closest('.sync-header__greeting-row')).toBe(row);
    expect(menu.contains(slot.querySelector('#import-backup'))).toBe(true);
  });

  it('登入 google 模式不顯示匯出/匯入備份按鈕', () => {
    renderSyncHeader(slot, {
      mode: 'google', name: '小美', status: idle,
      onSignIn: () => {}, onSignOut: () => {},
      now: () => at('2026-09-13T09:00:00'),
    });
    expect(slot.querySelector('#export-backup')).toBe(null);
    expect(slot.querySelector('#import-backup')).toBe(null);
  });

  it('訪客模式離線點登入顯示提示', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const onSignIn = vi.fn();
    renderSyncHeader(slot, {
      mode: 'guest', name: '', status: idle, onSignIn, onSignOut: () => {},
    });
    slot.querySelector('[data-action="sync-sign-in"]').click();
    await vi.waitFor(() =>
      expect(slot.querySelector('[data-sync-status]').textContent).toBe('目前離線，暫時無法登入')
    );
    expect(onSignIn).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('訪客模式登入失敗（關掉視窗、Google 載不到）顯示登入未完成，不是「會自動重試」', async () => {
    renderSyncHeader(slot, {
      mode: 'guest', name: '', status: idle,
      onSignIn: async () => { throw new Error('SIGN_IN_CANCELLED'); }, onSignOut: () => {},
    });
    slot.querySelector('[data-action="sync-sign-in"]').click();
    await vi.waitFor(() =>
      expect(slot.querySelector('[data-sync-status]').textContent).toBe('登入未完成，請再試一次')
    );
  });

  it('update 會換掉狀態文字，且登入失效的警示標記為不自動消失', () => {
    const header = renderSyncHeader(slot, {
      mode: 'google', name: '小美', status: idle,
      onSignIn: () => {}, onSignOut: () => {},
      now: () => at('2026-09-13T09:00:00'),
    });
    header.update({ ...idle, phase: 'auth', error: 'AUTH_EXPIRED' });

    const statusEl = slot.querySelector('[data-sync-status]');
    expect(statusEl.textContent).toBe('登入已失效，請重新登入');
    expect(statusEl.dataset.persistent).toBe('true');
  });

  it('依同步狀態切換閃燈顏色：同步中橘燈、成功綠燈、失敗紅燈', () => {
    const header = renderSyncHeader(slot, {
      mode: 'google', name: '小美', status: idle,
      onSignIn: () => {}, onSignOut: () => {},
      now: () => at('2026-09-13T09:00:00'),
    });
    const statusEl = slot.querySelector('[data-sync-status]');

    header.update({ ...idle, phase: 'syncing' });
    expect(statusEl.dataset.syncLight).toBe('syncing');

    header.update({ ...idle, phase: 'done', textSyncedAt: '2026-09-13T06:32:00.000Z' });
    expect(statusEl.dataset.syncLight).toBe('ok');

    header.update({ ...idle, phase: 'error', error: 'NETWORK' });
    expect(statusEl.dataset.syncLight).toBe('error');

    header.update(idle);
    expect(statusEl.dataset.syncLight).toBeUndefined();
  });

  it('登出會呼叫 onSignOut', () => {
    const onSignOut = vi.fn();
    renderSyncHeader(slot, {
      mode: 'google', name: '小美',
      status: { ...idle, phase: 'done', textSyncedAt: '2026-09-13T06:32:00.000Z' },
      onSignIn: () => {}, onSignOut,
      now: () => at('2026-09-13T09:00:00'),
    });
    slot.querySelector('[data-action="sync-sign-out"]').click();
    expect(onSignOut).toHaveBeenCalled();
  });
});
