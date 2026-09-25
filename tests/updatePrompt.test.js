import { describe, it, expect, vi } from 'vitest';
import { wireUpdatePrompt } from '../src/pwa/updatePrompt.js';

function fakeWorker() {
  const worker = new EventTarget();
  worker.state = 'installing';
  worker.postMessage = vi.fn();
  return worker;
}

// Just enough of navigator.serviceWorker / ServiceWorkerRegistration for the prompt's logic.
function setup({ controller = {}, waiting = null } = {}) {
  const registration = new EventTarget();
  registration.waiting = waiting;
  registration.installing = null;
  const serviceWorker = new EventTarget();
  serviceWorker.controller = controller;
  serviceWorker.register = vi.fn(async () => registration);
  const host = document.createElement('div');
  const reload = vi.fn();
  return { registration, serviceWorker, host, reload };
}

function arriveNewVersion(registration) {
  const worker = fakeWorker();
  registration.installing = worker;
  registration.dispatchEvent(new Event('updatefound'));
  worker.state = 'installed';
  registration.installing = null;
  registration.waiting = worker;
  worker.dispatchEvent(new Event('statechange'));
  return worker;
}

describe('wireUpdatePrompt', () => {
  it('已有舊版、且有新版在等待時，顯示提示條', async () => {
    const ctx = setup({ waiting: fakeWorker() });
    await wireUpdatePrompt(ctx);
    expect(ctx.host.querySelector('.update-banner')).not.toBeNull();
  });

  it('第一次安裝（還沒有舊版）不顯示提示條', async () => {
    const ctx = setup({ controller: null });
    await wireUpdatePrompt(ctx);
    arriveNewVersion(ctx.registration);
    expect(ctx.host.querySelector('.update-banner')).toBeNull();
  });

  it('使用中才下載好的新版也會顯示提示條，而且只顯示一條', async () => {
    const ctx = setup();
    await wireUpdatePrompt(ctx);
    expect(ctx.host.querySelector('.update-banner')).toBeNull();
    arriveNewVersion(ctx.registration);
    arriveNewVersion(ctx.registration);
    expect(ctx.host.querySelectorAll('.update-banner')).toHaveLength(1);
  });

  it('沒按更新就不會自動重新整理；按了才通知新版接手，接手後重新整理', async () => {
    const ctx = setup();
    await wireUpdatePrompt(ctx);
    const worker = arriveNewVersion(ctx.registration);

    ctx.serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(ctx.reload).not.toHaveBeenCalled();

    ctx.host.querySelector('.update-banner button').click();
    expect(worker.postMessage).toHaveBeenCalledWith('SKIP_WAITING');
    ctx.serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(ctx.reload).toHaveBeenCalledTimes(1);
  });

  it('新版已被別的分頁啟用時，按更新就直接重新整理', async () => {
    const ctx = setup();
    await wireUpdatePrompt(ctx);
    arriveNewVersion(ctx.registration);
    ctx.registration.waiting = null;
    ctx.host.querySelector('.update-banner button').click();
    expect(ctx.reload).toHaveBeenCalledTimes(1);
  });
});
