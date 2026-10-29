# 多間公托版本 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 同一個 GitHub Pages 網站上每間公托一個子資料夾（先只有育英 `yuying/`），舊網址改成搬家通知＋自動轉址。

**Architecture:** `src/centers.js` 放每間的設定，`CENTER` 由建置時 esbuild `define` 的 `__CENTER_ID__` 決定（沒傳＝育英，離線版和測試都是這樣）。寫死「育英」的地方改讀 `CENTER`。`scripts/build-web.mjs` 對每間各打包一次到 `site/<id>/`，另外輸出舊網址用的 `site/index.html`＋`site/sw.js`。

**Tech Stack:** esbuild、vitest + jsdom、Service Worker、Playwright（只用於手動驗證，`npm install --no-save playwright`）

**Spec:** `docs/superpowers/specs/2026-10-29-multi-center-design.md`

## Global Constraints
- 育英的這些值必須和改版前**完全相同**：資料庫 `c-form-db`；localStorage 鍵 `c-form-sync-mode`、`c-form-sync-name`、`c-form-sync-folder-id`；sessionStorage 鍵 `c-form-reload-token`；雲端資料夾 `育英公托填表系統`；三種 Word 的機構名稱。
- 離線版 `dist/TableC.html` 只改 logo 讀取路徑，其餘輸出不變。
- 快取名稱：各間 `c-form-site-<id>-<hash>`；舊網址 `c-form-root-<hash>`；改版前的是 `c-form-cache-*`。各自只刪自己前綴的舊快取。
- 公托 `id` 只能是小寫英文和數字（`/^[a-z0-9]+$/`）。
- 不提交 `site/`、`dist/`、`references/`、任何備份檔。
- 測試一律用 `npx vitest run tests/`（不要用 bare `npm test`，會跑到 worktree 的重複測試）。

---

### Task 1: 公托設定檔＋logo 搬位置

**Files:**
- Create: `src/centers.js`
- Create: `tests/centers.test.js`
- Move: `assets/icons/icon-192.png` → `assets/centers/yuying/icon-192.png`，`icon-512.png` 同
- Modify: `scripts/build.mjs:21`（logo 路徑）
- Modify: `scripts/build-web.mjs:156-157`（暫時改路徑，讓建置不壞；Task 3 會整段重寫）

**Interfaces:**
- Produces: `CENTERS`（陣列）、`CENTER`（目前這次建置的那一間），欄位：`id`、`title`、`shortName`、`institution`、`monthlyPlanInstitution`、`driveFolderName`、`dbName`、`storagePrefix`。

- [ ] **Step 1: 寫失敗的測試** `tests/centers.test.js`

```js
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { CENTERS, CENTER } from '../src/centers.js';

describe('centers', () => {
  it('defaults to 育英 when no build passes __CENTER_ID__ (offline build, tests)', () => {
    expect(CENTER.id).toBe('yuying');
  });

  it('keeps 育英 on its pre-move names so existing data and sign-ins survive the move', () => {
    const yuying = CENTERS.find(c => c.id === 'yuying');
    expect(yuying.dbName).toBe('c-form-db');
    expect(yuying.storagePrefix).toBe('c-form');
    expect(yuying.driveFolderName).toBe('育英公托填表系統');
    expect(yuying.institution).toBe('屏東縣內埔鄉育英公設民營托嬰中心');
    expect(yuying.monthlyPlanInstitution).toBe('屏東縣內埔鄉育英公設民營托嬰中心-屏東縣政府委託中華頭心手希望教育協會辦理');
  });

  it('gives every centre its own url folder, storage and Drive folder', () => {
    for (const field of ['id', 'dbName', 'storagePrefix', 'driveFolderName', 'title', 'shortName']) {
      const values = CENTERS.map(c => c[field]);
      expect(new Set(values).size, field).toBe(values.length);
    }
  });

  it('has a url-safe id, every text field and both logo sizes for each centre', () => {
    for (const c of CENTERS) {
      expect(c.id).toMatch(/^[a-z0-9]+$/);
      for (const field of ['title', 'shortName', 'institution', 'monthlyPlanInstitution', 'driveFolderName', 'dbName', 'storagePrefix']) {
        expect(c[field], `${c.id}.${field}`).toBeTruthy();
      }
      expect(existsSync(`assets/centers/${c.id}/icon-192.png`)).toBe(true);
      expect(existsSync(`assets/centers/${c.id}/icon-512.png`)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/centers.test.js`
Expected: FAIL（找不到 `../src/centers.js`）

- [ ] **Step 3: 建立 `src/centers.js`**

```js
// One entry per 公托 sharing this GitHub Pages site — each gets its own folder
// (/Childcare-Center/<id>/), title, logo (assets/centers/<id>/) and storage. See
// docs/superpowers/specs/2026-10-29-multi-center-design.md. A new centre needs only a new entry
// here plus its two square logos; its dbName/storagePrefix are `c-form-<id>-db`/`c-form-<id>`.
export const CENTERS = [
  {
    id: 'yuying',
    title: '屏東縣內埔鄉育英公托填表系統',
    shortName: '育英公托填表',
    institution: '屏東縣內埔鄉育英公設民營托嬰中心',
    // A whole line of its own, not built from `institution`: the 委託 association may differ.
    monthlyPlanInstitution: '屏東縣內埔鄉育英公設民營托嬰中心-屏東縣政府委託中華頭心手希望教育協會辦理',
    driveFolderName: '育英公托填表系統',
    // 育英 predates this file: its names are the old ones, so the move keeps its data and sign-in.
    dbName: 'c-form-db',
    storagePrefix: 'c-form',
  },
];

// scripts/build-web.mjs sets __CENTER_ID__ per centre; the offline build and the tests don't.
// eslint-disable-next-line no-undef
const id = typeof __CENTER_ID__ === 'undefined' ? 'yuying' : __CENTER_ID__;
export const CENTER = CENTERS.find(c => c.id === id);
```

（專案沒有 eslint 的話，拿掉 `eslint-disable` 那行。先 `ls .eslintrc* eslint.config.* 2>/dev/null` 確認。）

- [ ] **Step 4: 搬 logo、改兩個建置腳本的路徑**

```bash
mkdir -p assets/centers/yuying
git mv assets/icons/icon-192.png assets/centers/yuying/icon-192.png
git mv assets/icons/icon-512.png assets/centers/yuying/icon-512.png
```

`scripts/build.mjs:21` 的 `'assets/icons/icon-192.png'` 改成 `'assets/centers/yuying/icon-192.png'`。
`scripts/build-web.mjs:156-157` 的兩個 `'assets/icons/...'` 來源改成 `'assets/centers/yuying/...'`（目的地 `site/icons/...` 不變）。

- [ ] **Step 5: 跑測試＋兩個建置**

Run: `npx vitest run tests/centers.test.js && npm run build && npm run build:web`
Expected: 4 tests PASS，兩個建置都成功。

- [ ] **Step 6: Commit**

```bash
git add src/centers.js tests/centers.test.js assets scripts/build.mjs scripts/build-web.mjs
git commit -m "feat: 公托設定檔（先只有育英），logo 搬到 assets/centers/yuying"
```

---

### Task 2: 寫死「育英」的地方改讀 `CENTER`

**Files:**
- Modify: `src/storage/dbCore.js:1`
- Modify: `src/sync/googleAuth.js:9-11`
- Modify: `src/storage/syncStateDb.js:49`（同時 export）
- Modify: `src/sync/driveClient.js:4`
- Modify: `src/export/docxExport.js:34-36`、`src/export/parentReportDocxExport.js:15-17`、`src/export/monthlyPlanDocxExport.js:22-24`
- Modify: `src/ui/installDialog.js:18`
- Modify: `src/ui/helpContent.js:26,101,120,124,127,160,173`
- Test: `tests/centers.test.js`（加一個測試）

**Interfaces:**
- Consumes: `CENTER` from `src/centers.js`
- Produces: `SYNC_FOLDER_KEY` 變成 `src/storage/syncStateDb.js` 的 export（只給測試用）。

- [ ] **Step 1: 加失敗的測試**（加到 `tests/centers.test.js` 最後，import 放檔頭）

```js
import { DB_NAME } from '../src/storage/dbCore.js';
import { SYNC_MODE_KEY, SYNC_NAME_KEY, RELOAD_TOKEN_KEY } from '../src/sync/googleAuth.js';
import { SYNC_FOLDER_KEY } from '../src/storage/syncStateDb.js';
import { FOLDER_NAME } from '../src/sync/driveClient.js';

describe('storage names read from CENTER', () => {
  it('resolve to the exact pre-move names for 育英', () => {
    expect(DB_NAME).toBe('c-form-db');
    expect(SYNC_MODE_KEY).toBe('c-form-sync-mode');
    expect(SYNC_NAME_KEY).toBe('c-form-sync-name');
    expect(RELOAD_TOKEN_KEY).toBe('c-form-reload-token');
    expect(SYNC_FOLDER_KEY).toBe('c-form-sync-folder-id');
    expect(FOLDER_NAME).toBe('育英公托填表系統');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/centers.test.js`
Expected: FAIL（`SYNC_FOLDER_KEY` is undefined — 還沒 export）

- [ ] **Step 3: 改各檔**

`src/storage/dbCore.js` 第 1 行：
```js
import { CENTER } from '../centers.js';

export const DB_NAME = CENTER.dbName;
```

`src/sync/googleAuth.js`：在 `import { AuthExpiredError } ...` 下面加 `import { CENTER } from '../centers.js';`，第 9-11 行改成：
```js
export const SYNC_MODE_KEY = `${CENTER.storagePrefix}-sync-mode`;
export const SYNC_NAME_KEY = `${CENTER.storagePrefix}-sync-name`;
export const RELOAD_TOKEN_KEY = `${CENTER.storagePrefix}-reload-token`;
```

`src/storage/syncStateDb.js`：檔頭加 `import { CENTER } from '../centers.js';`，第 49 行改成：
```js
export const SYNC_FOLDER_KEY = `${CENTER.storagePrefix}-sync-folder-id`;
```

`src/sync/driveClient.js`：檔頭（註解前）加 `import { CENTER } from '../centers.js';`，第 4 行改成：
```js
export const FOLDER_NAME = CENTER.driveFolderName;
```

`src/export/docxExport.js`：在 import 區塊最後加 `import { CENTER } from '../centers.js';`，第 34-36 行改成：
```js
// Name of the institution this form is submitted for — per 公托, from src/centers.js. 育英's is
// taken from the real C表 sample document (陳小安C表-2.docx).
const INSTITUTION_NAME = CENTER.institution;
```

`src/export/parentReportDocxExport.js`：同樣加 import，第 15-17 行改成：
```js
// This document type ("每月課程計畫表" / "每月嬰幼兒適性發展紀錄表") is issued under the same
// institution name as 適性總表's C表 — per 公托, from src/centers.js.
const INSTITUTION_NAME = CENTER.institution;
```
（先打開第 15-17 行看清楚原註解再改，保留原本關於參考 PDF 的事實。）

`src/export/monthlyPlanDocxExport.js`：加 import，第 24 行改成 `const INSTITUTION_NAME = CENTER.monthlyPlanInstitution;`，上面第 22-23 行註解加一句「per 公托, from src/centers.js」。第 76 行附近有一段註解說這個名稱很長、影響置中——不改程式，在註解後補一句「(育英's length; another centre's may sit differently)」。

`src/ui/installDialog.js`：檔頭加 `import { CENTER } from '../centers.js';`，第 18 行的 `育英公托填表系統會像一般 App` 改成 `${CENTER.title}會像一般 App`（那行本來就在 template literal 裡）。

`src/ui/helpContent.js`：檔頭加 `import { CENTER } from '../centers.js';`（放在既有 import 之後），然後：
- 第 26 行：`const APP_NAME = CENTER.title;`
- 第 101 行：`<i></i>育英公托填表</span>` → `<i></i>${CENTER.shortName}</span>`（已在 template literal 內）
- 第 120 行：`cap: '名稱會自動填好「育英公托填表」，...'` → 改成 template literal：``cap: `名稱會自動填好「${CENTER.shortName}」，確認「以網頁 App 打開」是開著的，點右上角的「加入」`,``
- 第 124 行：`field('名稱', '育英公托填表')` → `field('名稱', CENTER.shortName)`
- 第 127 行：`cap: '回到手機主畫面，之後點育英公托的圖示就能打開'` → ``cap: `回到手機主畫面，之後點「${CENTER.shortName}」的圖示就能打開` ``
- 第 160、173 行：`muted('育英公托填表')` → `muted(CENTER.shortName)`

改完執行 `grep -rn "育英" src` — 唯一允許剩下的是 `src/centers.js` 和註解。

- [ ] **Step 4: 跑全部測試**

Run: `npx vitest run tests/`
Expected: 全部 PASS（`tests/helpContent.test.js` 若有比對「名稱會自動填好「育英公托填表」」的文字，結果應相同；第 127 行的說法多了「」，若有測試比對舊句子，更新那個測試的期望字串）。

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "refactor: 名稱、機構全名、資料庫與登入鍵改從公托設定讀取"
```

---

### Task 3: 網頁版建置每間各一份＋舊網址轉址頁

**Files:**
- Modify: `scripts/build-web.mjs`（整份重構成一個 `buildCenter(center)` 迴圈＋舊網址兩個檔）
- Create: `scripts/rootPage.mjs`（舊網址的 `index.html` 與 `sw.js` 文字）
- Create: `tests/buildWeb.test.js`

**Interfaces:**
- Consumes: `CENTERS` from `src/centers.js`（Node 直接 import，`src/centers.js` 沒有其他相依）
- Produces: `site/<id>/{index.html,manifest.json,sw.js,icons/}`、`site/index.html`、`site/sw.js`；`rootPage.mjs` export `rootIndexHtml(targetId)`、`rootServiceWorker(cacheName)`。

- [ ] **Step 1: 寫失敗的測試** `tests/buildWeb.test.js`

```js
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { CENTERS } from '../src/centers.js';

// Runs the real web build once — the per-centre pages and the old-URL page are plain text, so
// checking the written files is the honest test.
describe('build-web', () => {
  beforeAll(() => {
    execFileSync('node', ['scripts/build-web.mjs'], { stdio: 'pipe' });
  }, 120000);

  it('writes one self-contained folder per centre with its own name and logo', () => {
    for (const c of CENTERS) {
      const html = readFileSync(`site/${c.id}/index.html`, 'utf-8');
      expect(html).toContain(`<title>${c.title}</title>`);
      expect(html).toContain(`content="${c.shortName}"`);
      const manifest = JSON.parse(readFileSync(`site/${c.id}/manifest.json`, 'utf-8'));
      expect(manifest.name).toBe(c.title);
      expect(manifest.short_name).toBe(c.shortName);
      expect(manifest.scope).toBe('./');
      expect(existsSync(`site/${c.id}/icons/icon-512.png`)).toBe(true);
    }
  });

  it("names each centre's cache by its id and only clears that centre's old caches", () => {
    for (const c of CENTERS) {
      const sw = readFileSync(`site/${c.id}/sw.js`, 'utf-8');
      expect(sw).toMatch(new RegExp(`const CACHE_NAME = 'c-form-site-${c.id}-[0-9a-f]{12}'`));
      expect(sw).toContain(`key.startsWith('c-form-site-${c.id}-')`);
    }
  });

  it('puts the move notice at the old URL, sending people on to 育英', () => {
    const html = readFileSync('site/index.html', 'utf-8');
    expect(html).toContain("'yuying/'");
    expect(html).toContain('c-form-moved-seen');
    const sw = readFileSync('site/sw.js', 'utf-8');
    expect(sw).toMatch(/const CACHE_NAME = 'c-form-root-[0-9a-f]{12}'/);
    expect(sw).toContain("key.startsWith('c-form-cache-')");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/buildWeb.test.js`
Expected: FAIL（`site/yuying/index.html` 不存在）

- [ ] **Step 3: 建立 `scripts/rootPage.mjs`**

```js
// The old URL (/Childcare-Center/) after 育英 moved to yuying/ — see
// docs/superpowers/specs/2026-10-29-multi-center-design.md §4. Teachers keep their old home-screen
// icon (an iPhone re-install would start an empty app), so this page stays for good: first visit
// shows the notice, later ones go straight on. "移除通知" later = drop the notice, keep the redirect.

export function rootIndexHtml(targetId) {
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#2a78d6">
<title>填表系統搬到新網址了</title>
<script>
if (localStorage.getItem('c-form-moved-seen')) location.replace('${targetId}/');
</script>
<style>
body { margin: 0; font-family: system-ui, sans-serif; background: #f4f4f1; color: #222; line-height: 1.7; }
main { max-width: 32rem; margin: 0 auto; padding: 2.5rem 1.25rem; }
h1 { font-size: 1.4rem; margin: 0 0 .75rem; }
.go { display: block; width: 100%; padding: .9rem; font-size: 1.15rem; border: 0; border-radius: .6rem; background: #2a78d6; color: #fff; cursor: pointer; }
.url { word-break: break-all; background: #fff; padding: .5rem .75rem; border-radius: .4rem; border: 1px solid #ddd; }
.copy { padding: .4rem .9rem; border: 1px solid #2a78d6; border-radius: .4rem; background: #fff; color: #2a78d6; cursor: pointer; }
.small { font-size: .9rem; color: #555; }
</style>
</head>
<body>
<main>
  <h1>填表系統搬到新網址了</h1>
  <p>資料都還在，不用重新登入。按下面的按鈕就能繼續使用。</p>
  <button type="button" class="go" id="go">繼續使用</button>
  <section id="browser-only" hidden>
    <p>新網址：</p>
    <p class="url" id="new-url"></p>
    <p><button type="button" class="copy" id="copy">複製新網址</button> <span id="copied" hidden>已複製</span></p>
    <p>如果有把舊網址加入書籤，請改成新網址。</p>
  </section>
  <p class="small">想把手機主畫面的圖示換成新的，可以在新網址按「安裝」。沒有用 Google 登入的話，請先按「備份 → 匯出備份」，裝好後在新的 App 裡「匯入備份」。</p>
</main>
<script>
const target = '${targetId}/';
document.getElementById('go').addEventListener('click', () => {
  localStorage.setItem('c-form-moved-seen', '1');
  location.replace(target);
});
// Opened from the old home-screen icon there's no bookmark or address bar to update.
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
if (!standalone) {
  const url = new URL(target, location.href).href;
  document.getElementById('new-url').textContent = url;
  document.getElementById('browser-only').hidden = false;
  document.getElementById('copy').addEventListener('click', () => {
    navigator.clipboard?.writeText(url).then(() => { document.getElementById('copied').hidden = false; }, () => {});
  });
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
</script>
</body>
</html>
`;
}

// Replaces the pre-move service worker at the old URL. It waits for SKIP_WAITING like every
// centre's does, so a teacher's open old copy only switches over at a safe moment
// (src/pwa/updatePrompt.js) — then reloads into the notice above. It answers only for this page:
// requests under a centre's folder belong to that folder's own service worker.
export function rootServiceWorker(cacheName) {
  return `const CACHE_NAME = '${cacheName}';
const ASSETS = ['./', './index.html'];
const PAGES = ASSETS.map(path => new URL(path, self.location).pathname);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// Pre-move caches were all named c-form-cache-*; centres' caches (c-form-site-*) are not ours.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys
      .filter(key => key.startsWith('c-form-cache-') || (key.startsWith('c-form-root-') && key !== CACHE_NAME))
      .map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !PAGES.includes(url.pathname)) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
`;
}
```

- [ ] **Step 4: 重構 `scripts/build-web.mjs`**

結構（保留原檔所有註解和 CSP、inline script、manifest、service worker 的內容，只做下列改動）：

1. 檔頭 import 改成：
```js
import esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { CENTERS } from '../src/centers.js';
import { rootIndexHtml, rootServiceWorker } from './rootPage.mjs';
```
2. 開頭清空：`rmSync('site', { recursive: true, force: true });`（取代原本的 `mkdirSync('site/icons', ...)`）。
3. `GOOGLE_CLIENT_ID` 和 `const css = readFileSync('src/styles.css', 'utf-8');` 留在函式外。
4. 原本從 `const result = await esbuild.build(...)` 到 `copyFileSync(...icon-512...)` 的全部內容包進 `async function buildCenter(center) { ... }`，並改：
   - esbuild 選項加 `define: { __CENTER_ID__: JSON.stringify(center.id) },`
   - `const cacheName = \`c-form-site-${center.id}-${buildHash}\`;`
   - HTML 裡 `content="育英公托填表"` → `content="${center.shortName}"`；`<title>` 和 header 按鈕裡的 `屏東縣內埔鄉育英公托填表系統` → `${center.title}`
   - manifest：`name: center.title, short_name: center.shortName`
   - service worker 的 activate 改成只刪自己的舊快取：
     ```js
     // Several centres share this origin's cache storage — clear only this centre's old versions.
     self.addEventListener('activate', event => {
       event.waitUntil(
         caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('c-form-site-${center.id}-') && key !== CACHE_NAME).map(key => caches.delete(key))))
       );
       self.clients.claim();
     });
     ```
   - 輸出到 `const dir = \`site/${center.id}\`;`：先 `mkdirSync(\`${dir}/icons\`, { recursive: true });`，再寫 `${dir}/index.html`、`${dir}/manifest.json`、`${dir}/sw.js`，logo 從 `assets/centers/${center.id}/icon-192.png`、`icon-512.png` 複製到 `${dir}/icons/`。
   - 結尾 `console.log('Built site/%s/ (cache %s)', center.id, cacheName);`
5. 函式後：
```js
for (const center of CENTERS) await buildCenter(center);

// The old URL: 育英 lived at the site root before every centre got its own folder.
const rootHtml = rootIndexHtml('yuying');
const rootCache = `c-form-root-${createHash('sha256').update(rootHtml).digest('hex').slice(0, 12)}`;
writeFileSync('site/index.html', rootHtml);
writeFileSync('site/sw.js', rootServiceWorker(rootCache));
console.log('Built site/ move notice (cache %s)', rootCache);
```

- [ ] **Step 5: 跑測試**

Run: `npx vitest run tests/buildWeb.test.js && npx vitest run tests/`
Expected: 全部 PASS。另外 `grep -n "育英" scripts/build-web.mjs` 只剩註解。

- [ ] **Step 6: Commit**

```bash
git add scripts/build-web.mjs scripts/rootPage.mjs tests/buildWeb.test.js
git commit -m "feat: 網頁版每間公托各一個資料夾，舊網址改成搬家通知與轉址"
```

---

### Task 4: 實際瀏覽器驗證（Playwright，不提交）

驗證腳本放 scratchpad，不進 repo。用一個本機靜態伺服器把資料夾掛在 `/Childcare-Center/` 底下（模擬 GitHub Pages）。

- [ ] **Step 1: 準備舊版與新版**

```bash
# 舊版：主 checkout（main, 改版前）建置
(cd "/c/Users/Kmeie/Desktop/claude/childcare center" && npm run build:web) && cp -r "/c/Users/Kmeie/Desktop/claude/childcare center/site" "$SCRATCH/old-site"
# 新版：本 worktree
npm run build:web && cp -r site "$SCRATCH/new-site"
npm install --no-save playwright
```

伺服器（scratchpad 的 `serve.mjs`）：`node:http` 把 `/Childcare-Center/*` 對應到一個可切換的根目錄（`globalThis.root`，透過 `/__switch?to=new` 切換），目錄請求補 `index.html`，依副檔名給 Content-Type（html/js/json/png）。

- [ ] **Step 2: 搬家流程（Chromium，同一個 browser context 才保留資料）**
  1. 根目錄＝舊版。打開 `http://localhost:PORT/Childcare-Center/`，選訪客模式，新增一位幼兒「測試寶寶」，回首頁。等 `navigator.serviceWorker.controller` 存在。
  2. 切到新版。觸發 `registration.update()`（或把分頁切到背景再回來），等頁面自動重新整理 → 看到「填表系統搬到新網址了」。
  3. 按〔繼續使用〕→ 網址變成 `/Childcare-Center/yuying/`，首頁看得到「測試寶寶」。
  4. 再開一次 `/Childcare-Center/` → 直接到 `yuying/`，沒有通知。
  5. `caches.keys()`：沒有 `c-form-cache-*`；有 `c-form-root-*` 和 `c-form-site-yuying-*`。
  6. `context.setOffline(true)`，再開 `/Childcare-Center/` → 還是到得了 `yuying/` 且看得到幼兒。
- [ ] **Step 3: 第二間互不干擾**
  1. 暫時在 `src/centers.js` 加一組（**不提交**）：`{ id: 'test', title: '測試公托填表系統', shortName: '測試公托填表', institution: '測試公設民營托嬰中心', monthlyPlanInstitution: '測試公設民營托嬰中心-測試協會辦理', driveFolderName: '測試公托填表系統', dbName: 'c-form-test-db', storagePrefix: 'c-form-test' }`，`cp -r assets/centers/yuying assets/centers/test`，重新建置並切到新版。
  2. 開 `/Childcare-Center/test/`：標題是「測試公托填表系統」，看不到「測試寶寶」；新增一位幼兒，匯出總表／適性紀錄／月計畫各一份，解壓確認 `word/header*.xml` 或 `document.xml` 含「測試公設民營托嬰中心」。
  3. 回 `yuying/`：「測試寶寶」還在，`caches.keys()` 裡 `c-form-site-yuying-*` 沒被刪。
  4. 還原：`git checkout src/centers.js && rm -rf assets/centers/test`，`git status` 乾淨。
- [ ] **Step 4: 未安裝的瀏覽器分頁看到〔複製新網址〕；模擬 standalone（`page.emulateMedia` 不支援 display-mode 的話略過，留給實機）。**
- [ ] **Step 5: 回報結果（失敗就附截圖與錯誤），請使用者用 iPhone 實機測「舊主畫面圖示 → 通知 → 繼續使用 → 資料還在」。**

---

### Task 5: 文件

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 更新 `CLAUDE.md`**
  - Architecture「Two build targets」的 `npm run build:web` 那點改成：輸出 `site/<id>/`（每間公托一份，來自 `src/centers.js`）＋`site/index.html`／`sw.js`（舊網址的搬家通知與轉址，永久保留，見 spec）；新增一間＝`src/centers.js` 一組＋`assets/centers/<id>/` 兩張正方形 logo。
  - 加一點：多間共用同一個網域，所以資料庫、localStorage 鍵、快取名稱都要帶公托區別（`CENTER.dbName`／`storagePrefix`、`c-form-site-<id>-`）；育英沿用改版前的名稱，不能改。
  - 「What this project is」第一段前或 Architecture 提到機構名稱的地方，註明機構名稱來自 `src/centers.js`。
- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md 記錄多間公托的建置與命名規則"
```

---

## 上線（全部 task 通過、使用者同意後）
fast-forward `multi-center` 進 `main`、push、`gh run list --workflow=deploy.yml` 確認成功，刪 branch 與 worktree。上線後打開 `https://yu0328.github.io/Childcare-Center/` 與 `/yuying/` 各確認一次。
