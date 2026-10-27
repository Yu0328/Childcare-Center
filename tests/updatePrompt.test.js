import { describe, it, expect, vi, afterEach } from 'vitest';
import { wireAutoUpdate } from '../src/pwa/updatePrompt.js';

function fakeWorker() {
  const worker = new EventTarget();
  worker.state = 'installed';
  worker.postMessage = vi.fn();
  return worker;
}

// Just enough of navigator.serviceWorker / ServiceWorkerRegistration / document for the logic.
function setup({ controller = {}, waiting = fakeWorker(), safe = true } = {}) {
  const registration = new EventTarget();
  registration.waiting = waiting;
  registration.update = vi.fn(async () => {});
  const serviceWorker = new EventTarget();
  serviceWorker.controller = controller;
  serviceWorker.register = vi.fn(async () => registration);
  const doc = new EventTarget();
  doc.hidden = false;
  const ctx = {
    registration, serviceWorker, doc, safe,
    reload: vi.fn(), beforeReload: vi.fn(),
  };
  ctx.isSafe = vi.fn(() => ctx.safe);
  return ctx;
}

const wire = ctx => wireAutoUpdate(ctx);
function leave(ctx) { ctx.doc.hidden = true; ctx.doc.dispatchEvent(new Event('visibilitychange')); }
function comeBack(ctx) { ctx.doc.hidden = false; ctx.doc.dispatchEvent(new Event('visibilitychange')); }
const takeOver = ctx => ctx.serviceWorker.dispatchEvent(new Event('controllerchange'));

describe('wireAutoUpdate', () => {
  afterEach(() => vi.useRealTimers());

  it('在安全狀態離開 App：通知新版接手，接手後先交接登入再重新載入', async () => {
    const ctx = setup();
    await wire(ctx);
    leave(ctx);
    expect(ctx.registration.waiting.postMessage).toHaveBeenCalledWith('SKIP_WAITING');
    takeOver(ctx);
    expect(ctx.beforeReload).toHaveBeenCalledTimes(1);
    expect(ctx.reload).toHaveBeenCalledTimes(1);
    expect(ctx.beforeReload.mock.invocationCallOrder[0]).toBeLessThan(ctx.reload.mock.invocationCallOrder[0]);
  });

  it('不安全（不在首頁／有未儲存內容／同步中）時離開，不換版', async () => {
    const ctx = setup({ safe: false });
    await wire(ctx);
    leave(ctx);
    expect(ctx.registration.waiting.postMessage).not.toHaveBeenCalled();
  });

  it('回到前景時檢查新版；新版已在等而且安全就換', async () => {
    const ctx = setup();
    await wire(ctx);
    comeBack(ctx);
    expect(ctx.registration.update).toHaveBeenCalled();
    expect(ctx.registration.waiting.postMessage).toHaveBeenCalledWith('SKIP_WAITING');
  });

  it('通知後、接手前老師點進表單：接手時不重新載入；之後回到首頁再離開才重新載入', async () => {
    const ctx = setup();
    await wire(ctx);
    leave(ctx);
    ctx.safe = false;
    takeOver(ctx);
    expect(ctx.reload).not.toHaveBeenCalled();

    ctx.registration.waiting = null; // 新版已接手，不再等待
    comeBack(ctx);
    expect(ctx.reload).not.toHaveBeenCalled();
    ctx.safe = true;
    leave(ctx);
    expect(ctx.reload).toHaveBeenCalledTimes(1);
  });

  it('第一次安裝（還沒有舊版）不通知也不重新載入', async () => {
    const ctx = setup({ controller: null });
    await wire(ctx);
    leave(ctx);
    expect(ctx.registration.waiting.postMessage).not.toHaveBeenCalled();
    takeOver(ctx);
    expect(ctx.reload).not.toHaveBeenCalled();
  });

  it('別的分頁換了版：這頁安全才重新載入', async () => {
    const ctx = setup({ safe: false });
    await wire(ctx);
    takeOver(ctx);
    expect(ctx.reload).not.toHaveBeenCalled();
    ctx.safe = true;
    leave(ctx);
    expect(ctx.reload).toHaveBeenCalledTimes(1);
  });

  it('連續觸發也只重新載入一次', async () => {
    const ctx = setup();
    await wire(ctx);
    leave(ctx);
    takeOver(ctx);
    comeBack(ctx);
    leave(ctx);
    expect(ctx.reload).toHaveBeenCalledTimes(1);
  });

  it('開著不關時每 30 分鐘檢查一次新版', async () => {
    vi.useFakeTimers();
    const ctx = setup({ waiting: null });
    await wire(ctx);
    expect(ctx.registration.update).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30 * 60 * 1000);
    expect(ctx.registration.update).toHaveBeenCalledTimes(1);
  });
});
