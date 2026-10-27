import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createInstall } from '../src/pwa/installPrompt.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const LINE_IOS = `${IPHONE} Line/14.0.0`;
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function fakeEnv({ ua = WINDOWS, standalone = false, platform = '', touch = 0 } = {}) {
  const win = new EventTarget();
  win.matchMedia = () => ({ matches: standalone });
  win.location = { href: 'https://example.github.io/app/index.html' };
  const nav = { userAgent: ua, platform, maxTouchPoints: touch };
  return { win, nav };
}

function firePrompt(win, outcome = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  event.prompt = vi.fn();
  event.userChoice = Promise.resolve({ outcome });
  win.dispatchEvent(event);
  return event;
}

// jsdom has no showModal/close.
const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
});
afterEach(() => {
  document.querySelectorAll('dialog').forEach(d => d.close());
  HTMLDialogElement.prototype.showModal = originalShowModal;
  HTMLDialogElement.prototype.close = originalClose;
});

describe('createInstall().kind()', () => {
  it('iPhone 和偽裝成 Mac 的 iPad 是 ios', () => {
    expect(createInstall(fakeEnv({ ua: IPHONE })).kind()).toBe('ios');
    expect(createInstall(fakeEnv({ ua: IPAD_AS_MAC, platform: 'MacIntel', touch: 5 })).kind()).toBe('ios');
  });

  it('真的 Mac 不顯示', () => {
    expect(createInstall(fakeEnv({ ua: IPAD_AS_MAC, platform: 'MacIntel' })).kind()).toBe(null);
  });

  it('LINE 內建瀏覽器是 line', () => {
    expect(createInstall(fakeEnv({ ua: LINE_IOS })).kind()).toBe('line');
  });

  it('已從主畫面打開就不顯示', () => {
    expect(createInstall(fakeEnv({ ua: IPHONE, standalone: true })).kind()).toBe(null);
  });

  it('Android／電腦要等瀏覽器送出 beforeinstallprompt 才顯示，裝好後隱藏', () => {
    const env = fakeEnv({ ua: ANDROID });
    const install = createInstall(env);
    expect(install.kind()).toBe(null);
    const event = firePrompt(env.win);
    expect(event.defaultPrevented).toBe(true);
    expect(install.kind()).toBe('prompt');
    env.win.dispatchEvent(new Event('appinstalled'));
    expect(install.kind()).toBe(null);
  });
});

describe('wireButton', () => {
  it('依 kind 顯示或隱藏，事件來了會更新', () => {
    const env = fakeEnv({ ua: WINDOWS });
    const install = createInstall(env);
    const button = document.createElement('button');
    install.wireButton(button, 'guest');
    expect(button.hidden).toBe(true);
    firePrompt(env.win);
    expect(button.hidden).toBe(false);
  });

  it('iPhone 訪客：說明視窗提醒先匯出備份，並播放安裝步驟', () => {
    const install = createInstall(fakeEnv({ ua: IPHONE }));
    const button = document.createElement('button');
    install.wireButton(button, 'guest');
    button.click();
    const dialog = document.querySelector('dialog.install-dialog');
    expect(dialog.textContent).toContain('不佔空間');
    expect(dialog.textContent).toContain('匯出備份');
    expect(dialog.textContent).not.toContain('Google 帳號登入');
    expect(dialog.querySelector('.help-demo').textContent).toContain('加入主畫面');
  });

  it('iPhone 已用 Google 登入：只說重新登入會同步', () => {
    const install = createInstall(fakeEnv({ ua: IPHONE }));
    const button = document.createElement('button');
    install.wireButton(button, 'google');
    button.click();
    const text = document.querySelector('dialog.install-dialog').textContent;
    expect(text).toContain('Google 帳號登入');
    expect(text).not.toContain('匯出備份');
  });

  it('Android：沒有 iPhone 資料提醒，按「立即安裝」叫出系統安裝視窗', async () => {
    const env = fakeEnv({ ua: ANDROID });
    const install = createInstall(env);
    const event = firePrompt(env.win);
    const button = document.createElement('button');
    install.wireButton(button, 'guest');
    button.click();
    const dialog = document.querySelector('dialog.install-dialog');
    expect(dialog.textContent).not.toContain('匯出備份');
    expect(dialog.textContent).toContain('Play 商店');
    dialog.querySelector('[data-install-action="prompt"]').click();
    expect(event.prompt).toHaveBeenCalled();
    await vi.waitFor(() => expect(button.hidden).toBe(true)); // a used prompt can't be reused
  });

  it('LINE：提供用瀏覽器開啟的連結', () => {
    const install = createInstall(fakeEnv({ ua: LINE_IOS }));
    const button = document.createElement('button');
    install.wireButton(button, 'guest');
    button.click();
    const link = document.querySelector('dialog.install-dialog a[data-install-action="open-browser"]');
    expect(link.href).toBe('https://example.github.io/app/index.html?openExternalBrowser=1');
  });
});
