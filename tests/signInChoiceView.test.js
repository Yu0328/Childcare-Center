import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderSignInChoiceView, needsSignInChoice } from '../src/ui/signInChoiceView.js';
import { writeSyncMode, readSyncMode } from '../src/sync/googleAuth.js';

describe('needsSignInChoice', () => {
  beforeEach(() => localStorage.clear());

  it('沒選過時要問，選過之後不再問', () => {
    expect(needsSignInChoice()).toBe(true);
    writeSyncMode('guest');
    expect(needsSignInChoice()).toBe(false);
  });
});

describe('renderSignInChoiceView', () => {
  let container;
  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('顯示兩個選項', () => {
    renderSignInChoiceView(container, { onGoogle: () => {}, onGuest: () => {} });
    expect(container.querySelector('[data-action="sign-in-google"]').textContent).toContain('使用 Google 登入');
    expect(container.querySelector('[data-action="continue-guest"]').textContent).toContain('訪客');
  });

  it('選訪客會記住選擇並繼續', async () => {
    const onGuest = vi.fn();
    renderSignInChoiceView(container, { onGoogle: () => {}, onGuest });
    container.querySelector('[data-action="continue-guest"]').click();
    await vi.waitFor(() => expect(onGuest).toHaveBeenCalled());
    expect(readSyncMode()).toBe('guest');
  });

  it('選 Google 登入會呼叫 onGoogle', async () => {
    const onGoogle = vi.fn().mockResolvedValue(undefined);
    renderSignInChoiceView(container, { onGoogle, onGuest: () => {} });
    container.querySelector('[data-action="sign-in-google"]').click();
    await vi.waitFor(() => expect(onGoogle).toHaveBeenCalled());
  });

  it('離線時不去登入，直接顯示提示', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const onGoogle = vi.fn();
    renderSignInChoiceView(container, { onGoogle, onGuest: () => {} });
    container.querySelector('[data-action="sign-in-google"]').click();

    await vi.waitFor(() =>
      expect(container.querySelector('[data-error]').textContent).toBe('目前離線，暫時無法登入')
    );
    expect(onGoogle).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('登入失敗時留在這個畫面並顯示錯誤', async () => {
    const onGoogle = vi.fn().mockRejectedValue(new Error('SIGN_IN_CANCELLED'));
    renderSignInChoiceView(container, { onGoogle, onGuest: () => {} });
    container.querySelector('[data-action="sign-in-google"]').click();

    await vi.waitFor(() =>
      expect(container.querySelector('[data-error]').textContent).toBe('登入失敗，請再試一次')
    );
    expect(container.querySelector('[data-action="sign-in-google"]').disabled).toBe(false);
  });
});
