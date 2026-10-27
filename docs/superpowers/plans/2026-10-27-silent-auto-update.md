# 網頁版無感自動更新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 網頁版在老師停在首頁、離開或回到 App 時自動換成新版，不出提示條、不跳離正在填的畫面、Google 登入不中斷。

**Architecture:** `src/pwa/updatePrompt.js` 改寫成 `wireAutoUpdate`，只透過注入的 `isSafe()`／`beforeReload()` 認識外界；`build-web.mjs` 的啟動程式把「在首頁（`isAtHome`）＋沒有未儲存內容（`hasUnsavedInput`）＋沒在同步（`syncControls.isBusy`）」組成 `isSafe`，把 `syncControls.prepareReload`（暫存 Google 通行證）接成 `beforeReload`。`googleAuth` 新頁面建立時讀出並立刻刪除暫存，`gate` 看到接續成功就略過選擇畫面。

**Tech Stack:** 原生 JS (ES modules)、esbuild、vitest + jsdom、Service Worker API、sessionStorage。

Spec: `docs/superpowers/specs/2026-10-27-silent-auto-update-design.md`

## Global Constraints

- 只要不在首頁，就絕不重新載入（重新載入一定回到首頁）。
- 真正重新載入前一刻（`controllerchange`）重新檢查 `isSafe()`；不成立就取消，等下一個安全時機。
- Google 通行證只在自動換版的重新載入前寫進 `sessionStorage`，新頁面讀出後**立刻刪除**；剩不到 5 分鐘就不交接。一般重新整理維持原本行為（出現選擇畫面）。
- 移除「有新版本［更新］」提示條與操作說明常見問題的對應條目；無感更新不寫進操作說明。
- 離線單檔版（`scripts/build.mjs`、`src/app.js` 入口）不得引入任何 sync／pwa 程式碼。
- 測試用 `npx vitest run tests/`（不要用裸的 `npm test`，會連 `.claude/worktrees/*` 的副本一起跑）。

---

### Task 1: Google 登入接續 + 同步忙碌狀態

**Files:**
- Modify: `src/sync/googleAuth.js`
- Modify: `src/sync/syncEngine.js:293-302`
- Modify: `src/sync/wireSyncControls.js:131-161`
- Test: `tests/googleAuth.test.js`, `tests/syncEngine.test.js`, `tests/wireSyncControls.test.js`

**Interfaces:**
- Produces:
  - `RELOAD_TOKEN_KEY = 'c-form-reload-token'`（`googleAuth.js` export）
  - `createGoogleAuth(...)` 回傳物件新增 `stashForReload(): void`、`carriedOverReload(): boolean`
  - `createSyncEngine(...)` 回傳物件新增 `isBusy(): boolean`（同步進行中或延遲計時器排隊中）
  - `wireSyncControls(...)` 回傳 `{ gate, isBusy(): boolean, prepareReload(): void }`

- [ ] **Step 1: 寫 googleAuth 失敗測試**（加在 `tests/googleAuth.test.js` 的 `describe('createGoogleAuth')` 之後，新 describe；`import` 加上 `RELOAD_TOKEN_KEY`）

```js
describe('自動更新的登入接續', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

  async function signedIn(expiresIn = 3600) {
    const gis = fakeGis();
    const auth = createGoogleAuth({ clientId: 'c', loadGis: gis.loadGis, fetchUserInfo: async () => ({ given_name: '美' }) });
    const signing = auth.signIn();
    await vi.waitFor(() => expect(gis.calls).toHaveLength(1));
    gis.respond({ access_token: 'tok-1', expires_in: expiresIn });
    await signing;
    return auth;
  }

  it('有效通行證交給下一頁，下一頁讀出後立刻刪掉', async () => {
    const auth = await signedIn();
    auth.stashForReload();
    expect(sessionStorage.getItem(RELOAD_TOKEN_KEY)).not.toBe(null);

    const next = createGoogleAuth({ clientId: 'c', loadGis: fakeGis().loadGis });
    expect(sessionStorage.getItem(RELOAD_TOKEN_KEY)).toBe(null);
    expect(next.carriedOverReload()).toBe(true);
    expect(next.isSignedIn()).toBe(true);
    await expect(next.getAccessToken()).resolves.toBe('tok-1');
  });

  it('剩不到 5 分鐘就不交接', async () => {
    const auth = await signedIn(300); // 300s − 提早 60s = 剩 4 分鐘
    auth.stashForReload();
    expect(sessionStorage.getItem(RELOAD_TOKEN_KEY)).toBe(null);
  });

  it('沒登入時不寫任何東西；沒有交接資料時一切照舊', () => {
    const auth = createGoogleAuth({ clientId: 'c', loadGis: fakeGis().loadGis });
    auth.stashForReload();
    expect(sessionStorage.getItem(RELOAD_TOKEN_KEY)).toBe(null);
    expect(auth.carriedOverReload()).toBe(false);
    expect(auth.isSignedIn()).toBe(false);
  });

  it('暫存裡的通行證已過期就不採用，但一樣刪掉', () => {
    sessionStorage.setItem(RELOAD_TOKEN_KEY, JSON.stringify({ token: 'old', expiresAtMs: Date.now() - 1 }));
    const auth = createGoogleAuth({ clientId: 'c', loadGis: fakeGis().loadGis });
    expect(auth.carriedOverReload()).toBe(false);
    expect(sessionStorage.getItem(RELOAD_TOKEN_KEY)).toBe(null);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/googleAuth.test.js`
Expected: FAIL（`RELOAD_TOKEN_KEY` undefined / `stashForReload is not a function`）

- [ ] **Step 3: 實作 googleAuth**

檔頭註解第 2-4 行後補一句：`The one exception is the silent auto-update's reload — see stashForReload.`

常數區加：

```js
export const RELOAD_TOKEN_KEY = 'c-form-reload-token';
const HANDOVER_MIN_LEFT_MS = 5 * 60000;
```

`createGoogleAuth` 裡 `let inFlight = null;` 之後加：

```js
  // Picked up and deleted in the same breath, so the token sits in storage only across the reload.
  let carriedOver = false;
  try {
    const raw = sessionStorage.getItem(RELOAD_TOKEN_KEY);
    sessionStorage.removeItem(RELOAD_TOKEN_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && saved.token && saved.expiresAtMs > Date.now()) {
      token = saved.token;
      expiresAtMs = saved.expiresAtMs;
      carriedOver = true;
    }
  } catch { /* storage blocked or garbled: start signed out, as before */ }
```

`signOut` 之後加：

```js
  // The silent auto-update (src/pwa/updatePrompt.js) reloads the page, which would otherwise drop a
  // Google teacher onto the sign-in choice screen. Called only right before that reload; this
  // tab's sessionStorage, read and deleted by the next page at once. Too close to expiry isn't
  // worth carrying — the header would be asking to sign in again within minutes anyway.
  function stashForReload() {
    if (!token || expiresAtMs - Date.now() < HANDOVER_MIN_LEFT_MS) return;
    try {
      sessionStorage.setItem(RELOAD_TOKEN_KEY, JSON.stringify({ token, expiresAtMs }));
    } catch { /* storage blocked: the teacher just sees the choice screen */ }
  }
```

回傳改為：

```js
  return {
    signIn, getAccessToken, signOut, stashForReload,
    isSignedIn: () => Boolean(token),
    carriedOverReload: () => carriedOver,
  };
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/googleAuth.test.js`
Expected: PASS

- [ ] **Step 5: syncEngine `isBusy` 失敗測試**（加在 `tests/syncEngine.test.js`，沿用該檔建立 engine 的既有寫法——先看檔內其他測試怎麼建立 `drive`）

```js
it('isBusy：排隊等同步或同步進行中為真，結束後為假', async () => {
  vi.useFakeTimers();
  try {
    const engine = createSyncEngine({ drive: /* 該檔既有的空雲端 fake */, resolveConflicts: async () => [] });
    expect(engine.isBusy()).toBe(false);
    engine.scheduleSync();
    expect(engine.isBusy()).toBe(true);
    await vi.runAllTimersAsync();
    expect(engine.isBusy()).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});
```

（`/* ... */` 處換成該檔現有的 fake drive 建立方式，例如共用的 helper；不要另寫新的 fake。）

- [ ] **Step 6: 確認失敗後實作**

Run: `npx vitest run tests/syncEngine.test.js` → FAIL（`isBusy is not a function`）

`syncEngine.js` 回傳改為：

```js
  // The silent auto-update holds off while this is true, so a reload never cuts a Drive upload short.
  return { runSync, scheduleSync, getStatus: () => status, isBusy: () => Boolean(running || debounceTimer) };
```

Run 同上 → PASS

- [ ] **Step 7: wireSyncControls 失敗測試**（加在 `tests/wireSyncControls.test.js`）

```js
  it('自動更新接續了登入：直接進 App 並開始同步，不顯示選擇畫面', async () => {
    writeSyncMode('google');
    const runSync = vi.fn(async () => idleStatus);
    const controls = wireSyncControls({
      clientId: 'test', syncSlot,
      createAuth: () => ({ ...fakeAuthFactory()(), carriedOverReload: () => true }),
      createDrive: () => ({}),
      createEngine: () => fakeEngine({ runSync }),
    });
    const onDone = vi.fn();
    await controls.gate(container, { onDone });
    expect(onDone).toHaveBeenCalled();
    expect(container.querySelector('[data-action="sign-in-google"]')).toBe(null);
    expect(runSync).toHaveBeenCalled();
    expect(syncSlot.querySelector('[data-action="sync-sign-out"]')).toBeTruthy();
  });

  it('isBusy／prepareReload 轉給同步引擎／登入', () => {
    const stashForReload = vi.fn();
    const controls = wireSyncControls({
      clientId: 'test', syncSlot,
      createAuth: () => ({ ...fakeAuthFactory()(), stashForReload }),
      createDrive: () => ({}),
      createEngine: () => ({ ...fakeEngine(), isBusy: () => true }),
    });
    expect(controls.isBusy()).toBe(true);
    controls.prepareReload();
    expect(stashForReload).toHaveBeenCalled();
  });
```

- [ ] **Step 8: 確認失敗後實作**

Run: `npx vitest run tests/wireSyncControls.test.js` → FAIL

`gate` 裡 `needsSignInChoice()` 那段之後、`if (readSyncMode() === 'google') {` 之前加：

```js
    // The silent auto-update's reload carried this tab's sign-in over (googleAuth's
    // stashForReload) — no popup risk, the token is already in hand.
    if (readSyncMode() === 'google' && auth.carriedOverReload?.()) {
      startSyncing();
      onDone();
      return;
    }
```

最後一行改為：

```js
  return { gate, isBusy: () => engine.isBusy(), prepareReload: () => auth.stashForReload() };
```

Run 同上 → PASS（既有「之前登入過的裝置重整後顯示選擇畫面」測試仍要過——fake 沒有 `carriedOverReload`）

- [ ] **Step 9: 全部測試**

Run: `npx vitest run tests/` → 全部 PASS

- [ ] **Step 10: Commit**

```bash
git add src/sync tests/googleAuth.test.js tests/syncEngine.test.js tests/wireSyncControls.test.js
git commit -m "feat: carry Google sign-in across the silent auto-update reload"
```

---

### Task 2: 自動換版 + 移除提示條與說明

**Files:**
- Modify (rewrite): `src/pwa/updatePrompt.js`
- Modify (rewrite): `tests/updatePrompt.test.js`
- Modify: `src/app.js`（新增 export `isAtHome`）
- Modify: `src/webEntry.js`
- Modify: `scripts/build-web.mjs:35-53`
- Modify: `src/styles.css:3016-3033`（刪除 `.update-banner` 區塊與其註解）
- Modify: `src/ui/helpContent.js:768-769`（刪除常見問題「出現『有新版本』？」兩行）

**Interfaces:**
- Consumes: `wireSyncControls(...)` 回傳的 `isBusy()`、`prepareReload()`（Task 1）
- Produces:
  - `wireAutoUpdate({ serviceWorker, isSafe, beforeReload, reload, doc, checkEveryMs }): Promise<ServiceWorkerRegistration>`（取代 `wireUpdatePrompt`）
  - `isAtHome(container: Element): boolean`（`src/app.js`）
  - `webEntry.js` export：`wireAutoUpdate`、`isAtHome`、`hasUnsavedInput`

- [ ] **Step 1: 改寫測試** `tests/updatePrompt.test.js`（整檔取代）

```js
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
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/updatePrompt.test.js`
Expected: FAIL（`wireAutoUpdate is not a function`）

- [ ] **Step 3: 改寫 `src/pwa/updatePrompt.js`**（整檔取代）

```js
// Swaps in a redeploy without the teacher noticing — and never mid-form. A reload always lands on
// the home screen, so it only happens when `isSafe()` says she's already there with nothing
// unsaved and no sync running: when she leaves the app, or the moment she's back (some phones
// freeze a hidden page before it can act). Replaces the 2026-09-25 「有新版本［更新］」 banner —
// see docs/superpowers/specs/2026-10-27-silent-auto-update-design.md.
export async function wireAutoUpdate({
  serviceWorker = navigator.serviceWorker,
  isSafe = () => false,
  beforeReload = () => {},
  reload = () => location.reload(),
  doc = document,
  checkEveryMs = 30 * 60 * 1000,
} = {}) {
  // No controller yet means the first install, whose clients.claim() is not an update.
  let hadController = Boolean(serviceWorker.controller);
  // The new version controls this page but the page still runs the old code — reload at the next
  // safe moment without waiting on anything else.
  let takenOver = false;
  let reloading = false;

  function reloadNow() {
    if (reloading) return;
    reloading = true;
    beforeReload();
    reload();
  }

  // Re-checked here, right before reloading: between asking the new version to take over and it
  // doing so, she may have tapped into a form. Also covers another tab's takeover.
  serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    takenOver = true;
    if (isSafe()) reloadNow();
  });

  const registration = await serviceWorker.register('sw.js');
  const checkForUpdate = () => registration.update().catch(() => {});

  function trySwitch() {
    if (!isSafe()) return;
    if (takenOver) return reloadNow();
    if (registration.waiting && serviceWorker.controller) registration.waiting.postMessage('SKIP_WAITING');
  }

  doc.addEventListener('visibilitychange', () => {
    if (!doc.hidden) checkForUpdate();
    trySwitch();
  });
  setInterval(checkForUpdate, checkEveryMs);
  return registration;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/updatePrompt.test.js`
Expected: PASS

- [ ] **Step 5: `isAtHome` 測試 + 實作**

先找既有的 `mountApp` 測試檔（`tests/app*.test.js`），在其中加：

```js
import { mountApp, isAtHome } from '../src/app.js';

it('isAtHome：首頁為真，進入其他畫面為假', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  mountApp(container);
  await vi.waitFor(() => expect(isAtHome(container)).toBe(true));
  container.querySelector('[data-action="show-help"], .type-select-home button').click();
  await vi.waitFor(() => expect(isAtHome(container)).toBe(false));
});
```

（點擊的選擇器以 `reportTypeSelectView.js` 實際的按鈕 `data-*` 為準，挑任一個會換畫面的按鈕。）

`src/app.js`，`mountApp` 之前加：

```js
// The silent auto-update (src/pwa/updatePrompt.js) reloads only here: a reload always lands on
// the home screen, so nothing visible changes. Read off the screen itself, so the sign-in choice,
// the sync conflict screen and the loading placeholder all count as "not home".
export function isAtHome(container) {
  return Boolean(container.querySelector(':scope > .type-select-home'));
}
```

Run: 該測試檔 → PASS

- [ ] **Step 6: 接線**

`src/webEntry.js` 最後兩行改成：

```js
export { mountApp, wireBackupControls, isAtHome } from './app.js';
export { wireSyncControls } from './sync/wireSyncControls.js';
export { wireAutoUpdate } from './pwa/updatePrompt.js';
export { hasUnsavedInput } from './ui/unsavedInput.js';
```

（刪掉原本 `export { mountApp, wireBackupControls } ...` 與 `wireUpdatePrompt` 那兩行。）

`scripts/build-web.mjs` 的 `script` 改成：

```js
const script = `
${js}
let syncControls;
document.addEventListener('DOMContentLoaded', () => {
  syncControls = CFormApp.wireSyncControls({
    clientId: '${GOOGLE_CLIENT_ID}',
    syncSlot: document.getElementById('sync-slot'),
    // Guest mode is the only mode with backup buttons (see renderSyncHeader) — they're created
    // fresh every time the header repaints as guest, so this has to (re-)wire them each time
    // rather than once at load like the offline build does.
    wireBackup: (exportButton, importInput) => CFormApp.wireBackupControls({ exportButton, importInput }),
  });
  CFormApp.mountApp(document.getElementById('app'), {
    gate: syncControls.gate,
  });
});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => CFormApp.wireAutoUpdate({
    isSafe: () => CFormApp.isAtHome(document.getElementById('app'))
      && !CFormApp.hasUnsavedInput(document.body)
      && !syncControls.isBusy(),
    beforeReload: () => syncControls.prepareReload(),
  }));
}
`;
```

`sw.js` 模板裡第 107-108 行註解改成：

```js
// A new version waits until the page says it's a safe moment (src/pwa/updatePrompt.js) instead of
// taking over mid-edit on its own.
```

- [ ] **Step 7: 移除提示條樣式與說明**

- `src/styles.css`：刪除 `/* Hosted build only: shown when a redeploy is waiting ... */` 註解與整個 `.update-banner { ... }` 區塊。
- `src/ui/helpContent.js`：刪除

```html
      <dt>出現「有新版本」？</dt>
      <dd>先把正在填的內容存好，再按「更新」。</dd>
```

- [ ] **Step 8: 全部測試 + 兩個 build**

Run: `npx vitest run tests/` → 全部 PASS
Run: `npm run build` 與 `npm run build:web` → 都成功
Run: `grep -c "wireAutoUpdate\|stashForReload" dist/TableC.html` → `0`（離線版沒有帶進這些程式）

- [ ] **Step 9: Commit**

```bash
git add src scripts tests
git commit -m "feat: silent auto-update on the home screen, drop the 有新版本 banner"
```

---

### Task 3: 實際瀏覽器驗證（Playwright）

不改程式，驗證後回報。

- [ ] `npm install --no-save playwright`
- [ ] `npm run build:web`，用簡單靜態伺服器（例如 `npx http-server site -p 8123 -c-1`）提供 `site/`。
- [ ] Playwright 開 `http://localhost:8123/`，選訪客，等 Service Worker 啟用（`navigator.serviceWorker.controller` 不為 null）。
- [ ] 情境 A（首頁）：改 `site/sw.js` 內容（例如尾端加一行註解）模擬新部署 → 頁面上呼叫 `navigator.serviceWorker.getRegistration().then(r => r.update())` → 等 `registration.waiting` → 用 `document.dispatchEvent` 前先把 `document.hidden` 以 `Object.defineProperty` 設成 true 並送出 `visibilitychange` → 確認頁面重新載入（在 window 上掛一個旗標，重新載入後旗標消失）且仍在首頁。
- [ ] 情境 B（填表中）：進入幼兒管理的新增表單，在輸入欄打字 → 同樣模擬新部署與離開 → 確認沒有重新載入（旗標還在）、打的字還在。
- [ ] 確認畫面上沒有 `.update-banner`。
