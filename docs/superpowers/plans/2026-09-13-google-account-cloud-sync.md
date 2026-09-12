# Google 帳號登入 + 跨裝置雲端同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 PWA 版（`site/`／repo 根目錄 `index.html`）的同一位老師用 Google 帳號登入後，自己的資料在多台裝置間自動雙向同步（逐筆比對、只傳差異、可中斷續傳），取代手動匯出/匯入備份；離線版 `dist/TableC.html` 完全不受影響。

**Architecture:** 三層。**(1) 儲存層**：`src/storage/dbCore.js` 增加三個寫入閘門（`addRecord`／`putRecord`／`deleteRecord`），統一蓋上跨裝置穩定的 `uid` 與 `updatedAt`，刪除時寫入墓碑（tombstone）；所有既有 db 函式改走這三個閘門，同步邏輯因此不必去每一個 UI 存檔點插手。**(2) 同步層** `src/sync/`：純函式（`syncStores` 序列化、`diff` 比對計畫、`fieldMerge` 三方欄位合併、`reconcile` 首次登入自然鍵配對）加上兩個薄 I/O 模組（`googleAuth` 走 Google Identity Services token flow、`driveClient` 走 Drive REST v3），由 `syncEngine` 編排。雲端一筆記錄 = Drive 資料夾裡一個小 JSON 檔（照片另存為獨立 JPEG 檔），所以「只更新不同的地方」「可中斷續傳」「Drive 內建 30 天版本歷史」都是免費得到的；一次 `files.list` 就拿到整份雲端清單（含雲端時間與內容雜湊），不必下載就能判斷哪幾筆需要動作。**(3) UI 層**：登入選擇畫面、標題列問候語／同步狀態、衝突比較畫面。離線版隔離靠一個新進入點 `src/webEntry.js`：`src/app.js` 本身不 import 任何 `src/sync/` 程式碼，只多接受一個選用的 `gate` 參數。

**Tech Stack:** 原生 JS（無新增 npm 依賴）、Google Identity Services (`accounts.google.com/gsi/client`)、Google Drive REST API v3、IndexedDB、`vitest`/`jsdom`/`fake-indexeddb`。

## Global Constraints

- **OAuth Client ID（可公開，直接寫在 `scripts/build-web.mjs`）**：`841383586205-ohr1uhsrii1tg3oevtcacimc4sviekcr.apps.googleusercontent.com`
- **OAuth scope**：`openid profile https://www.googleapis.com/auth/drive.file`（`drive.file` 只能存取本 App 自己建立的檔案，但檔案仍放在使用者看得見的一般資料夾，符合規格「不是隱藏的 App 專屬儲存區」）。
- **雲端資料夾名稱**：`育英公托填表系統`（建在 Drive 根目錄）。資料夾內守門檔名 `sync-manifest.json`，內容 `{"formatVersion":1}`。
- **離線版（`dist/TableC.html`／`scripts/build.mjs`）不得包含任何登入/同步程式碼。** `src/app.js` 不得 import `src/sync/*`、`src/ui/signInChoiceView.js`、`src/ui/syncHeader.js`、`src/ui/conflictResolveView.js`。
- **access token 只存在記憶體**，不得寫入 localStorage／IndexedDB。localStorage 只存兩個非機密值：`c-form-sync-mode`（`'google'`｜`'guest'`）與 `c-form-sync-name`（顯示名稱）。
- **時間一律以雲端為準**：同步狀態顯示與「誰比較新」的判斷，用 Drive API 回應的 HTTP `Date` 標頭／檔案 `modifiedTime`，不用裝置時鐘。
- **問候語時段**：05:00–11:59「早安」／12:00–17:59「午安」／18:00–04:59「晚安」。名字取 Google 帳號顯示名稱。
- **訪客模式按鈕文字**：「使用 Google 登入」。離線時按下顯示「目前離線，暫時無法登入」。
- **登出只停止同步，不清除本機資料。**
- **並行上傳/下載上限 5**（規格建議 4~6）。
- **測試指令務必加 `tests/` 前綴**（`npx vitest run tests/...`），否則會撈到 `.claude/worktrees/*/tests/` 的舊副本，測試數變兩倍。
- 真實參考檔（`references/`）內容是真實幼兒個資，**不得**出現在程式碼、註解、測試或 commit message 裡。測試一律用「測試童」這類假資料。
- 每個 task 結束都要 commit，subject 用英文（`feat:`／`fix:`／`refactor:`／`perf:`），沿用現有 git log 風格。

## 檔案結構

**新增**

| 檔案 | 職責 |
|---|---|
| `src/storage/syncStateDb.js` | `syncState`／`tombstones` 兩張表的存取（上次同步基準、Drive fileId、30 天墓碑清除） |
| `src/sync/syncStores.js` | 要同步的資料表清單、外鍵欄位對應、自然鍵、序列化/還原（本機 int id ↔ 跨裝置 uid）、canonical JSON 與雜湊 |
| `src/sync/localSnapshot.js` | 讀出本機全部記錄成 uid → payload 快照（順手補上舊記錄缺的 uid）、把一筆雲端記錄寫回本機 |
| `src/sync/diff.js` | 純函式：本機快照 + 上次同步基準 + 雲端清單 → 同步計畫（上傳/下載/合併/刪除） |
| `src/sync/fieldMerge.js` | 純函式：三方欄位合併，回報真正衝突的欄位 |
| `src/sync/reconcile.js` | 純函式：首次登入時用自然鍵配對兩邊各自產生的 uid |
| `src/sync/googleAuth.js` | 載入 GIS、取得/靜默更新 access token、取得顯示名稱、登出、離線判斷 |
| `src/sync/driveClient.js` | Drive REST v3：確保資料夾與守門檔、列檔、上傳、下載、丟垃圾桶、雲端時間、並行上限 helper |
| `src/sync/photoSync.js` | 照片（獨立 JPEG 檔）的上傳/下載/刪除與失敗計數 |
| `src/sync/syncEngine.js` | 編排整個同步流程、debounce、前景/上線觸發、狀態物件 |
| `src/sync/wireSyncControls.js` | 把 auth + engine + 三個畫面接起來，回傳 `{ gate }` 給 `mountApp` |
| `src/ui/signInChoiceView.js` | 第一次密碼過關後的「Google 登入／訪客」選擇畫面 |
| `src/ui/syncHeader.js` | 標題列問候語／登入按鈕／同步狀態／登入失效與格式錯誤警示 |
| `src/ui/conflictResolveView.js` | 衝突比較畫面（保留本機／保留雲端／都保留） |
| `src/webEntry.js` | PWA 版進入點：re-export `app.js` + `wireSyncControls` |

**修改**

| 檔案 | 改什麼 |
|---|---|
| `src/media/imagePreprocess.js` | `compressImage` 預設 `maxEdge` 1600 → 960 |
| `src/storage/dbCore.js` | `DB_VERSION` 3 → 4（+`syncState`、+`tombstones`）、三個寫入閘門、`setWriteListener` |
| `src/storage/db.js`／`parentReportDb.js`／`monthlyPlanDb.js` | 所有 add/put/delete 改走閘門，`add*` 可接收既有 `uid`/`updatedAt` |
| `src/storage/backup.js` | 匯入時把備份裡的 `uid`/`updatedAt` 一併還原 |
| `src/app.js` | `mountApp` 多一個選用 `gate` 參數 |
| `scripts/build-web.mjs` | 進入點換成 `src/webEntry.js`、CSP 放行 Google 網域、標題列加同步插槽、bootstrap 接線、Service Worker 只處理同源 GET |

---

### Task 1: 點滴分享照片壓縮上限改為 960px

**Files:**
- Modify: `src/media/imagePreprocess.js:12`
- Test: `tests/imagePreprocess.test.js`

**Interfaces:**
- Produces: `compressImage(file, { maxEdge = 960, quality = 0.8 })` — 預設值改變，簽章不變。

- [ ] **Step 1: 先寫會失敗的測試**

在 `tests/imagePreprocess.test.js` 最後面加上（不要動既有測試）：

```js
describe('compressImage 預設解析度上限', () => {
  it('預設 maxEdge 是 960（Word 匯出時點滴分享照片最大只顯示到約 717px）', () => {
    // calculateTargetDimensions 是純函式，可以直接驗證這個上限的效果：
    // 一張 3000x2000 的手機照片在 960 上限下應縮到 960x640。
    expect(calculateTargetDimensions(3000, 2000, 960)).toEqual({ width: 960, height: 640 });
    // 而 compressImage 的預設值必須就是 960，不是 1600。
    expect(compressImage.toString()).toContain('maxEdge = 960');
  });
});
```

如果檔案最上面沒有 import `compressImage`，補上：

```js
import { calculateTargetDimensions, compressImage } from '../src/media/imagePreprocess.js';
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/imagePreprocess.test.js`
Expected: FAIL — 最後一個 expect 找不到 `maxEdge = 960`（目前是 1600）。

- [ ] **Step 3: 改掉預設值**

`src/media/imagePreprocess.js` 的 `compressImage` 註解與簽章改成：

```js
// Draws `file` onto an offscreen canvas at a reduced size/quality and returns the compressed
// result plus its final pixel dimensions (needed later to size the image correctly in the docx
// export, since photos arrive in whatever aspect ratio the phone camera used).
//
// maxEdge is 960 because that is already wider than anywhere a photo is ever shown:
// parentReportDocxExport.js lays 點滴分享 photos out at most ~717px wide in the Word file. Storing
// 1600px cost ~3x the bytes for resolution nothing displays — which now also means 3x the upload
// on every sync. Photos already saved under the old setting are left alone.
export async function compressImage(file, { maxEdge = 960, quality = 0.8 } = {}) {
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/imagePreprocess.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/media/imagePreprocess.js tests/imagePreprocess.test.js
git commit -m "$(cat <<'EOF'
perf: cap 點滴分享 photos at 960px instead of 1600px

Word export never displays them wider than ~717px, so the extra resolution was
pure storage and (soon) upload cost.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: dbCore 寫入閘門（uid／updatedAt／墓碑）

**Files:**
- Modify: `src/storage/dbCore.js`
- Test: `tests/dbCore.test.js`

**Interfaces:**
- Produces:
  - `DB_VERSION === 4`，新增兩張表：`tombstones`（`keyPath: 'uid'`）、`syncState`（`keyPath: 'uid'`）。
  - `addRecord(storeName, record)` → `Promise<record & { id, uid, updatedAt }>`。`record.uid` 有值就沿用（備份還原用），沒有就產生新的；`updatedAt` 同理。
  - `putRecord(storeName, record)` → `Promise<record & { uid, updatedAt }>`。`updatedAt` **一律**蓋成現在時間。
  - `deleteRecord(storeName, id)` → `Promise<void>`。刪除前先讀出 `uid`，刪完在 `tombstones` 寫入 `{ uid, store, deletedAt }`。
  - `setWriteListener(fn)` → 註冊「有任何寫入發生」的回呼（三個閘門都會呼叫，無參數）；傳 `null` 取消。
  - `newUid()` → 36 字元 UUID 或 32 字元 hex（Safari 15.0–15.3 沒有 `crypto.randomUUID`，而本專案 build target 是 safari15）。

- [ ] **Step 1: 先寫會失敗的測試**

在 `tests/dbCore.test.js` 最後面加上：

```js
describe('dbCore 寫入閘門', () => {
  beforeEach(deleteDb);

  it('建立 tombstones 與 syncState 兩張同步用的表', async () => {
    const { openDatabase } = await import('../src/storage/dbCore.js');
    const db = await openDatabase();
    expect(db.objectStoreNames.contains('tombstones')).toBe(true);
    expect(db.objectStoreNames.contains('syncState')).toBe(true);
    db.close();
  });

  it('addRecord 蓋上 uid 與 updatedAt', async () => {
    const { addRecord } = await import('../src/storage/dbCore.js');
    const created = await addRecord('children', { name: '測試童', birthDate: '2024-01-01' });
    expect(created.id).toBeTypeOf('number');
    expect(created.uid).toMatch(/^[0-9a-f-]{32,36}$/);
    expect(created.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('addRecord 沿用呼叫端給的 uid 與 updatedAt（備份還原用）', async () => {
    const { addRecord } = await import('../src/storage/dbCore.js');
    const created = await addRecord('children', {
      name: '測試童', birthDate: '2024-01-01',
      uid: 'fixed-uid-1', updatedAt: '2026-01-02T03:04:05.000Z',
    });
    expect(created.uid).toBe('fixed-uid-1');
    expect(created.updatedAt).toBe('2026-01-02T03:04:05.000Z');
  });

  it('putRecord 一律把 updatedAt 蓋成新的時間', async () => {
    const { addRecord, putRecord } = await import('../src/storage/dbCore.js');
    const created = await addRecord('children', {
      name: '測試童', birthDate: '2024-01-01', updatedAt: '2020-01-01T00:00:00.000Z',
    });
    const updated = await putRecord('children', { ...created, name: '改名' });
    expect(updated.uid).toBe(created.uid);
    expect(updated.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('deleteRecord 留下墓碑', async () => {
    const { addRecord, deleteRecord, runRequest } = await import('../src/storage/dbCore.js');
    const created = await addRecord('children', { name: '測試童', birthDate: '2024-01-01' });
    await deleteRecord('children', created.id);

    const tombstones = await runRequest('tombstones', 'readonly', store => store.getAll());
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0]).toMatchObject({ uid: created.uid, store: 'children' });
    expect(tombstones[0].deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('每次寫入都通知 writeListener', async () => {
    const { addRecord, putRecord, deleteRecord, setWriteListener } = await import('../src/storage/dbCore.js');
    let calls = 0;
    setWriteListener(() => { calls += 1; });
    try {
      const created = await addRecord('children', { name: '測試童', birthDate: '2024-01-01' });
      await putRecord('children', { ...created, name: '改名' });
      await deleteRecord('children', created.id);
      expect(calls).toBe(3);
    } finally {
      setWriteListener(null);
    }
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/dbCore.test.js`
Expected: FAIL — `addRecord` 等函式不存在、兩張新表不存在。

- [ ] **Step 3: 實作**

`src/storage/dbCore.js` 的版本號：

```js
export const DB_VERSION = 4;
```

`onupgradeneeded` 裡，`childItemOverrides` 那段之後加上：

```js
      // Sync bookkeeping. Created unconditionally so both build targets share one schema
      // version — otherwise a browser that opens the offline build after the hosted one would
      // trigger its own version bump.
      if (!db.objectStoreNames.contains('tombstones')) {
        db.createObjectStore('tombstones', { keyPath: 'uid' });
      }
      if (!db.objectStoreNames.contains('syncState')) {
        db.createObjectStore('syncState', { keyPath: 'uid' });
      }
```

檔案最後面（`runRequest` 之後）加上：

```js
// crypto.randomUUID only landed in Safari 15.4 and this project's esbuild target is safari15,
// so fall back to getRandomValues rather than crashing the whole app on an older iPad.
export function newUid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

// Every syncable record carries a `uid` (stable across devices — IndexedDB's autoIncrement `id`
// is not: the same logical child is id 3 on one phone and id 7 on another) and an `updatedAt`.
// Stamping both here, at the one place every write already passes through, is what keeps the
// sync layer out of the UI's save paths entirely.
//
// The write listener is how the sync engine learns "something changed, schedule an upload". The
// offline build never registers one, so this costs it nothing.
let writeListener = null;

export function setWriteListener(fn) {
  writeListener = fn;
}

function notifyWrite() {
  if (writeListener) writeListener();
}

export async function addRecord(storeName, record) {
  // uid/updatedAt are honored when supplied so restoring a backup keeps a record's sync
  // identity instead of looking like a brand-new record to every other device.
  const stamped = {
    ...record,
    uid: record.uid || newUid(),
    updatedAt: record.updatedAt || new Date().toISOString(),
  };
  const id = await runRequest(storeName, 'readwrite', store => store.add(stamped));
  notifyWrite();
  return { ...stamped, id };
}

export async function putRecord(storeName, record) {
  // Unlike addRecord, updatedAt is always overwritten: callers pass a spread of the existing
  // record, which would otherwise carry the old timestamp straight back in.
  const stamped = { ...record, uid: record.uid || newUid(), updatedAt: new Date().toISOString() };
  await runRequest(storeName, 'readwrite', store => store.put(stamped));
  notifyWrite();
  return stamped;
}

// Leaves a tombstone so a delete made here propagates to the cloud (and from there to the other
// devices) instead of the record simply reappearing on the next download — "刪了又跑出來" is
// exactly the confusion the sync design set out to avoid. Tombstones expire after 30 days (see
// syncStateDb.purgeExpiredTombstones); the deleted data itself stays recoverable for that long
// from Google Drive's own trash.
export async function deleteRecord(storeName, id) {
  const existing = await runRequest(storeName, 'readonly', store => store.get(id));
  await runRequest(storeName, 'readwrite', store => store.delete(id));
  if (existing && existing.uid) {
    await runRequest('tombstones', 'readwrite', store =>
      store.put({ uid: existing.uid, store: storeName, deletedAt: new Date().toISOString() })
    );
  }
  notifyWrite();
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/dbCore.test.js`
Expected: PASS（含既有那個「從舊版資料庫升級仍保留資料」的測試）。

- [ ] **Step 5: 跑全部測試確認版本升級沒弄壞既有資料**

Run: `npx vitest run tests/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/storage/dbCore.js tests/dbCore.test.js
git commit -m "$(cat <<'EOF'
feat: add uid/updatedAt/tombstone write gates to dbCore

One chokepoint every write already passes through, so cross-device sync never
has to reach into the UI's save paths.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 所有 db 寫入路徑改走閘門

**Files:**
- Modify: `src/storage/db.js`（`addChild`、`addForm`、`updateForm`、`addEntry`、`updateEntry`、`deleteEntry`、`deleteForm`、`deleteChild`）
- Modify: `src/storage/parentReportDb.js`（全部 `add*`／`update*`／`delete*`）
- Modify: `src/storage/monthlyPlanDb.js`（全部 `add*`／`update*`／`delete*`／`writeOrCreatePlanSlot`／`writeChildItemOverride`／`deleteChildItemOverridesForChild`）
- Modify: `src/storage/backup.js`
- Test: 既有 `tests/db.test.js`、`tests/parentReportDb.test.js`、`tests/monthlyPlanDb.test.js`、`tests/backup.test.js` 必須維持綠燈

**Interfaces:**
- Consumes: Task 2 的 `addRecord`／`putRecord`／`deleteRecord`。
- Produces: 所有既有函式簽章不變，但 `add*` 額外接受並沿用 `uid`、`updatedAt`；回傳物件多 `uid`、`updatedAt` 兩個欄位。

- [ ] **Step 1: 改寫 `src/storage/db.js`**

import 改成：

```js
import { DB_NAME, runRequest, addRecord, putRecord, deleteRecord } from './dbCore.js';
```

```js
export async function addChild({ name, birthDate, uid, updatedAt }) {
  return addRecord('children', { name, birthDate, uid, updatedAt });
}
```

```js
export async function addForm({ childId, tier, period, isNew = false, uid, updatedAt }) {
  const createdAt = new Date().toISOString();
  return addRecord('forms', { childId, tier, period, createdAt, isNew, uid, updatedAt });
}

export async function updateForm(id, changes) {
  const existing = await runRequest('forms', 'readonly', store => store.get(id));
  if (!existing) {
    throw new Error(`Form ${id} not found`);
  }
  return putRecord('forms', { ...existing, ...changes, id });
}
```

```js
export async function addEntry({ formId, indicatorCode, date, status, note, activityName, uid, updatedAt }) {
  return addRecord('entries', { formId, indicatorCode, date, status, note, activityName, uid, updatedAt });
}

export async function updateEntry(id, changes) {
  const existing = await runRequest('entries', 'readonly', store => store.get(id));
  if (!existing) {
    throw new Error(`Entry ${id} not found`);
  }
  return putRecord('entries', { ...existing, ...changes, id });
}

export async function deleteEntry(id) {
  await deleteRecord('entries', id);
}
```

`deleteForm` 與 `deleteChild` 最後那行的 `store.delete(id)` 分別改成：

```js
  await deleteRecord('forms', id);
```
```js
  await deleteRecord('children', id);
```

`deleteForm`／`deleteChild` 裡刪除下層記錄的迴圈也一律改走閘門，例如刪 entries 的那圈：

```js
  for (const entry of entries) {
    await deleteRecord('entries', entry.id);
  }
```

（每一筆被 cascade 刪掉的記錄都需要自己的墓碑，否則別台裝置只會看到父記錄消失、子記錄還留在雲端。）

- [ ] **Step 2: 改寫 `src/storage/parentReportDb.js`**

import 改成：

```js
import { runRequest, addRecord, putRecord, deleteRecord } from './dbCore.js';
```

八組機械式替換（cascade 刪除的迴圈同樣要改走 `deleteRecord`）：

```js
export async function addParentReport({ childId, tier, period, isNew = false, uid, updatedAt }) {
  const createdAt = new Date().toISOString();
  return addRecord('parentReports', { childId, tier, period, createdAt, isNew, uid, updatedAt });
}

export async function updateParentReport(id, changes) {
  const existing = await runRequest('parentReports', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`ParentReport ${id} not found`);
  return putRecord('parentReports', { ...existing, ...changes, id });
}
```

```js
export async function addCoursePlanEntry({ reportId, indicatorCode, activityName, indicatorText = '', uid, updatedAt }) {
  return addRecord('coursePlanEntries', { reportId, indicatorCode, activityName, indicatorText, uid, updatedAt });
}

export async function updateCoursePlanEntry(id, changes) {
  const existing = await runRequest('coursePlanEntries', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`CoursePlanEntry ${id} not found`);
  return putRecord('coursePlanEntries', { ...existing, ...changes, id });
}
```

```js
export async function addCourseOccurrence({ entryId, date, status, absent, courseChanged = false, note, uid, updatedAt }) {
  return addRecord('courseOccurrences', { entryId, date, status, absent, courseChanged, note, uid, updatedAt });
}

export async function updateCourseOccurrence(id, changes) {
  const existing = await runRequest('courseOccurrences', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`CourseOccurrence ${id} not found`);
  return putRecord('courseOccurrences', { ...existing, ...changes, id });
}

export async function deleteCourseOccurrence(id) {
  await deleteRecord('courseOccurrences', id);
}
```

```js
export async function addDevelopmentRecordEntry({ reportId, domain, courseEntryIds, narrative, uid, updatedAt }) {
  return addRecord('developmentRecordEntries', { reportId, domain, courseEntryIds, narrative, uid, updatedAt });
}

export async function updateDevelopmentRecordEntry(id, changes) {
  const existing = await runRequest('developmentRecordEntries', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`DevelopmentRecordEntry ${id} not found`);
  return putRecord('developmentRecordEntries', { ...existing, ...changes, id });
}

export async function deleteDevelopmentRecordEntry(id) {
  await deleteRecord('developmentRecordEntries', id);
}
```

```js
export async function addBehaviorObservation({ reportId, title, narrative, uid, updatedAt }) {
  return addRecord('behaviorObservations', { reportId, title, narrative, uid, updatedAt });
}

export async function updateBehaviorObservation(id, changes) {
  const existing = await runRequest('behaviorObservations', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`BehaviorObservation ${id} not found`);
  return putRecord('behaviorObservations', { ...existing, ...changes, id });
}

export async function deleteBehaviorObservation(id) {
  await deleteRecord('behaviorObservations', id);
}
```

```js
export async function addHighlightEntry({ reportId, photos, caption, uid, updatedAt }) {
  return addRecord('highlightEntries', { reportId, photos, caption, uid, updatedAt });
}

export async function updateHighlightEntry(id, changes) {
  const existing = await runRequest('highlightEntries', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`HighlightEntry ${id} not found`);
  return putRecord('highlightEntries', { ...existing, ...changes, id });
}

export async function deleteHighlightEntry(id) {
  await deleteRecord('highlightEntries', id);
}
```

`deleteParentReport`、`deleteCoursePlanEntry` 的最後一行分別改成 `await deleteRecord('parentReports', id);`、`await deleteRecord('coursePlanEntries', id);`，它們內部 cascade 刪除子記錄的迴圈也改走 `deleteRecord`。

- [ ] **Step 3: 改寫 `src/storage/monthlyPlanDb.js`**

import 改成：

```js
import { runRequest, addRecord, putRecord, deleteRecord } from './dbCore.js';
```

```js
export async function addMonthlyCoursePlan({ period, childIds, childTiers, isNew = false, uid, updatedAt }) {
  const createdAt = new Date().toISOString();
  return addRecord('monthlyCoursePlans', { period, childIds, childTiers, createdAt, isNew, uid, updatedAt });
}

export async function updateMonthlyCoursePlan(id, changes) {
  const existing = await runRequest('monthlyCoursePlans', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`MonthlyCoursePlan ${id} not found`);
  return putRecord('monthlyCoursePlans', { ...existing, ...changes, id });
}
```

```js
async function writeOrCreatePlanSlot({ planId, tier, weekIndex, weekday, uid, updatedAt }) {
  const slots = await listPlanSlotsForPlan(planId);
  const existing = slots.find(s => s.tier === tier && s.weekIndex === weekIndex && s.weekday === weekday);
  if (existing) return existing;
  return addRecord('planSlots', { planId, tier, weekIndex, weekday, uid, updatedAt });
}

export async function getOrCreatePlanSlot({ planId, tier, weekIndex, weekday, uid, updatedAt }) {
  const key = `slot:${planId}:${tier}:${weekIndex}:${weekday}`;
  return serializeByKey(key, () => writeOrCreatePlanSlot({ planId, tier, weekIndex, weekday, uid, updatedAt }));
}
```

```js
export async function addPlanSlotItem({ slotId, indicatorCode = null, activityName, indicatorText = '', uid, updatedAt }) {
  return addRecord('planSlotItems', { slotId, indicatorCode, activityName, indicatorText, uid, updatedAt });
}

export async function updatePlanSlotItem(id, changes) {
  const existing = await runRequest('planSlotItems', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`PlanSlotItem ${id} not found`);
  return putRecord('planSlotItems', { ...existing, ...changes, id });
}
```

```js
async function writeChildItemOverride({ planId, childId, itemId, notAchieved, replaced, replacementText, uid, updatedAt }) {
  const existing = (await listChildItemOverridesForPlan(planId)).find(o => o.childId === childId && o.itemId === itemId);

  if (!notAchieved && !replaced) {
    if (existing) await deleteRecord('childItemOverrides', existing.id);
    return null;
  }

  if (existing) {
    return putRecord('childItemOverrides', { ...existing, notAchieved, replaced, replacementText });
  }

  return addRecord('childItemOverrides', {
    planId, childId, itemId, notAchieved, replaced, replacementText, uid, updatedAt,
  });
}

export async function setChildItemOverride({ planId, childId, itemId, notAchieved, replaced, replacementText = '', uid, updatedAt }) {
  const key = `override:${planId}:${childId}:${itemId}`;
  return serializeByKey(key, () =>
    writeChildItemOverride({ planId, childId, itemId, notAchieved, replaced, replacementText, uid, updatedAt })
  );
}
```

`deleteMonthlyCoursePlan`、`deletePlanSlot`、`deletePlanSlotItem`、`deleteChildItemOverridesForChild` 裡所有 `store.delete(...)` 一律換成對應的 `await deleteRecord('<表名>', <id>);`。

- [ ] **Step 4: 讓備份還原保留同步身分（`src/storage/backup.js`）**

`importV1Or2Children`／`importParentReports`／`importMonthlyCoursePlans` 裡每一個 `add*`／`getOrCreatePlanSlot`／`setChildItemOverride` 呼叫都多帶兩個欄位。例如：

```js
  for (const child of data.children) {
    const created = await addChild({
      name: child.name, birthDate: child.birthDate, uid: child.uid, updatedAt: child.updatedAt,
    });
    childIdMap.set(child.id, created.id);
  }
```

```js
      const createdEntry = await addHighlightEntry({
        reportId, photos, caption: entry.caption, uid: entry.uid, updatedAt: entry.updatedAt,
      });
```

`BACKUP_VERSION` 保持 3，上面加一行說明：

```js
// Still 3: a v3 backup exported before sync existed simply has no uid/updatedAt on its records,
// and addRecord stamps fresh ones in that case — there is no incompatible shape to gate behind
// a new version number.
const BACKUP_VERSION = 3;
```

- [ ] **Step 5: 跑全部測試**

Run: `npx vitest run tests/`
Expected: PASS。若某個測試因為記錄多了 `uid`/`updatedAt` 而在 `toEqual({ 手寫物件 })` 失敗，把該斷言改成 `toMatchObject({ ... })`；**不要**寫死具體 uid 值。比對「`add*` 回傳值 vs `list*` 讀回值」的斷言本來就該通過，若沒通過代表有某個函式漏改。

- [ ] **Step 6: Commit**

```bash
git add src/storage/db.js src/storage/parentReportDb.js src/storage/monthlyPlanDb.js src/storage/backup.js tests/
git commit -m "$(cat <<'EOF'
refactor: route every db write through the dbCore stamping gates

Cascade deletes now leave their own tombstones, and backup import carries
uid/updatedAt through so a restore keeps its sync identity.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 同步狀態表（syncState／tombstones 存取）

**Files:**
- Create: `src/storage/syncStateDb.js`
- Test: Create `tests/syncStateDb.test.js`

**Interfaces:**
- Consumes: `runRequest` from `src/storage/dbCore.js`。
- Produces:
  - `readSyncState()` → `Promise<Map<uid, { uid, store, hash, fileId, syncedAt }>>`（`store: 'photo'` 的項目代表一張已上傳的照片，`hash` 為 `null`）
  - `writeSyncState(entry)` → `Promise<void>`
  - `deleteSyncState(uid)` → `Promise<void>`
  - `listTombstones()` → `Promise<Array<{ uid, store, deletedAt }>>`
  - `deleteTombstone(uid)` → `Promise<void>`
  - `purgeExpiredTombstones(nowMs)` → `Promise<number>`（刪掉超過 30 天的墓碑，回傳筆數）
  - `TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000`

- [ ] **Step 1: 先寫會失敗的測試**

```js
// tests/syncStateDb.test.js
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
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/syncStateDb.test.js`
Expected: FAIL — 找不到 `src/storage/syncStateDb.js`。

- [ ] **Step 3: 實作**

```js
// src/storage/syncStateDb.js
import { runRequest } from './dbCore.js';

// One syncState row per synced thing, keyed by uid: { uid, store, hash, fileId, syncedAt }.
// `hash` is the content hash of the version both sides agreed on at the last successful sync —
// the *base* of a three-way merge. Without it, "both sides differ" is indistinguishable from
// "one side changed", which is the difference between a correct merge and a silent overwrite.
// A photo's row has store: 'photo' and hash: null (photos are never edited, only added or
// replaced, so there is nothing to three-way merge).

export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function readSyncState() {
  const rows = await runRequest('syncState', 'readonly', store => store.getAll());
  return new Map(rows.map(row => [row.uid, row]));
}

export async function writeSyncState(entry) {
  await runRequest('syncState', 'readwrite', store => store.put(entry));
}

export async function deleteSyncState(uid) {
  await runRequest('syncState', 'readwrite', store => store.delete(uid));
}

export async function listTombstones() {
  return runRequest('tombstones', 'readonly', store => store.getAll());
}

export async function deleteTombstone(uid) {
  await runRequest('tombstones', 'readwrite', store => store.delete(uid));
}

// A tombstone has to outlive every device's sync interval, or a phone left in a drawer for a
// week would re-upload records this device deleted. 30 days matches how long Google Drive keeps
// trashed files and file version history, so both safety nets expire together.
export async function purgeExpiredTombstones(nowMs) {
  let purged = 0;
  for (const tombstone of await listTombstones()) {
    if (nowMs - Date.parse(tombstone.deletedAt) > TOMBSTONE_TTL_MS) {
      await deleteTombstone(tombstone.uid);
      purged += 1;
    }
  }
  return purged;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/syncStateDb.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/storage/syncStateDb.js tests/syncStateDb.test.js
git commit -m "$(cat <<'EOF'
feat: add syncState/tombstone storage for cross-device sync

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 資料表清單與序列化（本機 id ↔ 跨裝置 uid）

**Files:**
- Create: `src/sync/syncStores.js`
- Test: Create `tests/syncStores.test.js`

**Interfaces:**
- Produces:
  - `SYNC_STORES` — 陣列，**依相依順序排列**（父在子之前）。每項 `{ store, refs, naturalKey }`；`refs` 是 `{ [欄位名]: { store, kind } }`，`kind` 為 `'id'`｜`'idArray'`｜`'idKeyObject'`；`naturalKey(payload)` 吃**已轉成 uid 形式**的 payload，回傳字串。
  - `storeSpec(storeName)` → 對應的 `SYNC_STORES` 項目，未知表名丟 `Error`。
  - `canonicalJson(value)` → 字串（物件 key 依字母排序，同一筆資料在兩台裝置上必定產出同一字串）。
  - `hashPayload(payload)` → `Promise<string>` SHA-256 十六進位。
  - `serializeRecord(storeName, record, uidOf)` → payload：移除 `id`、外鍵換成 uid、`highlightEntries` 的 `photos` 換成描述子 `[{ photoUid, width, height, type }]`（不含 blob）。`uidOf(storeName, id)` → uid｜`undefined`。
  - `deserializeRecord(storeName, payload, idOf, existingPhotos)` → 本機記錄（不含 `id`），外鍵 uid 換回 int；`photos` 依描述子重建，能從 `existingPhotos` 依 `photoUid` 撿回已下載的 blob，撿不到就留 `blob: undefined`。單一外鍵解不開時回傳 `null`。
  - `PHOTO_STORE = 'highlightEntries'`

- [ ] **Step 1: 先寫會失敗的測試**

```js
// tests/syncStores.test.js
import { describe, it, expect } from 'vitest';
import {
  SYNC_STORES, canonicalJson, hashPayload, serializeRecord, deserializeRecord,
} from '../src/sync/syncStores.js';

const uidOf = (store, id) => (id === undefined || id === null ? undefined : `${store}-uid-${id}`);
const idOf = uid => {
  const match = /-uid-(\d+)$/.exec(uid || '');
  return match ? Number(match[1]) : undefined;
};

describe('SYNC_STORES 順序', () => {
  it('父表一定排在子表之前', () => {
    const order = SYNC_STORES.map(s => s.store);
    for (const { store, refs } of SYNC_STORES) {
      for (const ref of Object.values(refs)) {
        expect(order.indexOf(ref.store)).toBeLessThan(order.indexOf(store));
      }
    }
  });

  it('涵蓋規格列出的每一張要同步的表', () => {
    expect(SYNC_STORES.map(s => s.store)).toEqual([
      'children', 'forms', 'entries',
      'parentReports', 'coursePlanEntries', 'courseOccurrences',
      'developmentRecordEntries', 'behaviorObservations', 'highlightEntries',
      'monthlyCoursePlans', 'planSlots', 'planSlotItems', 'childItemOverrides',
    ]);
  });
});

describe('canonicalJson', () => {
  it('key 順序不同但內容相同的兩個物件產出同一個字串', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it('陣列順序仍然有意義', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });
});

describe('hashPayload', () => {
  it('相同內容同雜湊、不同內容不同雜湊', async () => {
    expect(await hashPayload({ a: 1, b: 2 })).toBe(await hashPayload({ b: 2, a: 1 }));
    expect(await hashPayload({ a: 1 })).not.toBe(await hashPayload({ a: 2 }));
    expect(await hashPayload({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('serializeRecord', () => {
  it('把單一外鍵換成 uid 並移除本機 id', () => {
    expect(serializeRecord('forms', {
      id: 7, uid: 'form-uid', childId: 3, tier: 'Ⅳ', period: '115年06月', updatedAt: 'T',
    }, uidOf)).toEqual({
      uid: 'form-uid', childId: 'children-uid-3', tier: 'Ⅳ', period: '115年06月', updatedAt: 'T',
    });
  });

  it('把外鍵陣列與以 childId 當 key 的物件都換成 uid', () => {
    const payload = serializeRecord('monthlyCoursePlans', {
      id: 2, uid: 'plan-uid', period: '115年06月',
      childIds: [3, 4], childTiers: { 3: 'Ⅳ', 4: 'Ⅴ' }, updatedAt: 'T',
    }, uidOf);
    expect(payload.childIds).toEqual(['children-uid-3', 'children-uid-4']);
    expect(payload.childTiers).toEqual({ 'children-uid-3': 'Ⅳ', 'children-uid-4': 'Ⅴ' });
    expect(payload.id).toBeUndefined();
  });

  it('點滴分享的照片只留描述子，不含 blob', () => {
    const payload = serializeRecord('highlightEntries', {
      id: 1, uid: 'hl-uid', reportId: 5, caption: '玩水',
      photos: [{ photoUid: 'p1', width: 960, height: 640, blob: new Blob(['x'], { type: 'image/jpeg' }) }],
      updatedAt: 'T',
    }, uidOf);
    expect(payload.photos).toEqual([{ photoUid: 'p1', width: 960, height: 640, type: 'image/jpeg' }]);
  });
});

describe('deserializeRecord', () => {
  it('把 uid 外鍵換回本機 id', () => {
    expect(deserializeRecord('forms', {
      uid: 'form-uid', childId: 'children-uid-3', tier: 'Ⅳ', period: '115年06月', updatedAt: 'T',
    }, (store, uid) => idOf(uid))).toEqual({
      uid: 'form-uid', childId: 3, tier: 'Ⅳ', period: '115年06月', updatedAt: 'T',
    });
  });

  it('照片描述子能撿回已下載的 blob，撿不到的留空等補下載', () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    const record = deserializeRecord('highlightEntries', {
      uid: 'hl-uid', reportId: 'parentReports-uid-5', caption: '玩水', updatedAt: 'T',
      photos: [
        { photoUid: 'p1', width: 960, height: 640, type: 'image/jpeg' },
        { photoUid: 'p2', width: 960, height: 640, type: 'image/jpeg' },
      ],
    }, (store, uid) => idOf(uid), [{ photoUid: 'p1', width: 960, height: 640, blob }]);

    expect(record.photos[0].blob).toBe(blob);
    expect(record.photos[1].blob).toBeUndefined();
    expect(record.photos[1].photoUid).toBe('p2');
  });

  it('外鍵指向還沒下載到本機的父記錄時回傳 null', () => {
    expect(deserializeRecord('forms', { uid: 'x', childId: 'children-uid-nope' }, () => undefined)).toBe(null);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/syncStores.test.js`
Expected: FAIL — 找不到 `src/sync/syncStores.js`。

- [ ] **Step 3: 實作**

```js
// src/sync/syncStores.js

// The 13 stores that sync, in dependency order (a parent always before its children). Every
// sync step — download, reconcile, apply — walks this array in order, which is what guarantees a
// record's foreign keys can already be resolved by the time it is written locally.
//
// `refs` names the foreign-key fields and what they point at. Locally these hold IndexedDB
// autoIncrement ints, which mean nothing on another device, so they are rewritten to uids on the
// way out and back to local ints on the way in.
//
// `naturalKey` is used only on first sign-in (see reconcile.js): two devices kept in step by
// hand-carried backup files hold two different uids for the same logical record, and the natural
// key is how they get recognised as one record instead of silently duplicating. It runs on the
// uid-form payload, so a child record's key is stable even though the parent's local id differs
// per device.
const CHILD_REF = { store: 'children', kind: 'id' };
const REPORT_REF = { store: 'parentReports', kind: 'id' };

export const SYNC_STORES = [
  { store: 'children', refs: {}, naturalKey: r => `${r.name}|${r.birthDate}` },
  { store: 'forms', refs: { childId: CHILD_REF }, naturalKey: r => `${r.childId}|${r.tier}|${r.period}` },
  {
    store: 'entries',
    refs: { formId: { store: 'forms', kind: 'id' } },
    naturalKey: r => `${r.formId}|${r.indicatorCode}|${r.date}`,
  },
  { store: 'parentReports', refs: { childId: CHILD_REF }, naturalKey: r => `${r.childId}|${r.tier}|${r.period}` },
  {
    store: 'coursePlanEntries',
    refs: { reportId: REPORT_REF },
    naturalKey: r => `${r.reportId}|${r.indicatorCode}|${r.activityName}`,
  },
  {
    store: 'courseOccurrences',
    refs: { entryId: { store: 'coursePlanEntries', kind: 'id' } },
    naturalKey: r => `${r.entryId}|${r.date}`,
  },
  {
    store: 'developmentRecordEntries',
    refs: { reportId: REPORT_REF, courseEntryIds: { store: 'coursePlanEntries', kind: 'idArray' } },
    naturalKey: r => `${r.reportId}|${r.domain}`,
  },
  { store: 'behaviorObservations', refs: { reportId: REPORT_REF }, naturalKey: r => `${r.reportId}|${r.title}` },
  { store: 'highlightEntries', refs: { reportId: REPORT_REF }, naturalKey: r => `${r.reportId}|${r.caption}` },
  {
    store: 'monthlyCoursePlans',
    refs: {
      childIds: { store: 'children', kind: 'idArray' },
      childTiers: { store: 'children', kind: 'idKeyObject' },
    },
    naturalKey: r => r.period,
  },
  {
    store: 'planSlots',
    refs: { planId: { store: 'monthlyCoursePlans', kind: 'id' } },
    naturalKey: r => `${r.planId}|${r.tier}|${r.weekIndex}|${r.weekday}`,
  },
  {
    store: 'planSlotItems',
    refs: { slotId: { store: 'planSlots', kind: 'id' } },
    naturalKey: r => `${r.slotId}|${r.activityName}`,
  },
  {
    store: 'childItemOverrides',
    refs: {
      planId: { store: 'monthlyCoursePlans', kind: 'id' },
      childId: CHILD_REF,
      itemId: { store: 'planSlotItems', kind: 'id' },
    },
    naturalKey: r => `${r.planId}|${r.childId}|${r.itemId}`,
  },
];

export const PHOTO_STORE = 'highlightEntries';

const STORE_SPECS = new Map(SYNC_STORES.map(spec => [spec.store, spec]));

export function storeSpec(storeName) {
  const spec = STORE_SPECS.get(storeName);
  if (!spec) throw new Error(`Unknown sync store: ${storeName}`);
  return spec;
}

// Key-sorted stringify. Two devices must produce byte-identical JSON for identical data or every
// hash comparison reports a difference that isn't there — and IndexedDB makes no guarantee that
// property order survives a write/read round trip.
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).filter(key => value[key] !== undefined).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export async function hashPayload(payload) {
  const bytes = new TextEncoder().encode(canonicalJson(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function serializeRecord(storeName, record, uidOf) {
  const { refs } = storeSpec(storeName);
  const payload = {};

  for (const [key, value] of Object.entries(record)) {
    if (key === 'id') continue;
    const ref = refs[key];
    if (!ref) {
      payload[key] = value;
      continue;
    }
    if (ref.kind === 'id') {
      payload[key] = uidOf(ref.store, value);
    } else if (ref.kind === 'idArray') {
      payload[key] = (value || []).map(id => uidOf(ref.store, id)).filter(uid => uid !== undefined);
    } else {
      payload[key] = Object.fromEntries(
        Object.entries(value || {})
          .map(([id, inner]) => [uidOf(ref.store, Number(id)), inner])
          .filter(([uid]) => uid !== undefined)
      );
    }
  }

  // Photo bytes travel as their own Drive files, so the record only carries descriptors. The
  // descriptor list doubles as the authoritative answer to "which photos should exist", which is
  // how photoSync tells a photo still being downloaded apart from one deleted elsewhere.
  if (storeName === PHOTO_STORE) {
    payload.photos = (record.photos || []).map(photo => ({
      photoUid: photo.photoUid,
      width: photo.width,
      height: photo.height,
      type: photo.type || (photo.blob && photo.blob.type) || 'image/jpeg',
    }));
  }

  return payload;
}

// Returns null when a single-value foreign key still points at a record this device hasn't got
// yet — the caller retries it on a later pass rather than writing a row with a dangling
// reference (the exact failure mode backup.js's dead-childId guards exist to clean up after).
export function deserializeRecord(storeName, payload, idOf, existingPhotos) {
  const { refs } = storeSpec(storeName);
  const record = {};

  for (const [key, value] of Object.entries(payload)) {
    const ref = refs[key];
    if (!ref) {
      record[key] = value;
      continue;
    }
    if (ref.kind === 'id') {
      const id = idOf(ref.store, value);
      if (id === undefined) return null;
      record[key] = id;
    } else if (ref.kind === 'idArray') {
      record[key] = (value || []).map(uid => idOf(ref.store, uid)).filter(id => id !== undefined);
    } else {
      record[key] = Object.fromEntries(
        Object.entries(value || {})
          .map(([uid, inner]) => [idOf(ref.store, uid), inner])
          .filter(([id]) => id !== undefined)
      );
    }
  }

  if (storeName === PHOTO_STORE) {
    const byUid = new Map((existingPhotos || []).map(photo => [photo.photoUid, photo]));
    record.photos = (payload.photos || []).map(descriptor => {
      const local = byUid.get(descriptor.photoUid);
      return { ...descriptor, blob: local && local.blob };
    });
  }

  return record;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/syncStores.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sync/syncStores.js tests/syncStores.test.js
git commit -m "$(cat <<'EOF'
feat: add sync store map and local-id/uid serialization

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 本機快照與寫回

**Files:**
- Create: `src/sync/localSnapshot.js`
- Test: Create `tests/localSnapshot.test.js`

**Interfaces:**
- Consumes: Task 5 的 `SYNC_STORES`／`serializeRecord`／`deserializeRecord`／`hashPayload`；`runRequest`／`newUid` from dbCore。
- Produces:
  - `readLocalSnapshot()` → `Promise<{ records: Map<uid, { store, id, payload, hash, record }>, uidById: Map<'store:id', uid>, idByUid: Map<'store:uid', id> }>`。順手替缺 `uid`／`updatedAt` 的舊記錄補上。
  - `applyRemoteRecord({ store, uid, payload }, snapshot)` → `Promise<'written' | 'deferred'>`；就地更新 `snapshot` 三張 map。
  - `deleteLocalByUid(store, uid, snapshot)` → `Promise<void>`，**不留墓碑**。
  - `adoptUid(store, id, cloudUid, snapshot)` → `Promise<void>`，**不動 updatedAt**。

- [ ] **Step 1: 先寫會失敗的測試**

```js
// tests/localSnapshot.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { readLocalSnapshot, applyRemoteRecord, deleteLocalByUid, adoptUid } from '../src/sync/localSnapshot.js';
import { addChild, addForm, listChildren, listFormsForChild, clearAllData } from '../src/storage/db.js';
import { runRequest } from '../src/storage/dbCore.js';

async function clearTombstones() {
  await runRequest('tombstones', 'readwrite', store => store.clear());
}

describe('readLocalSnapshot', () => {
  beforeEach(async () => { await clearAllData(); await clearTombstones(); });

  it('把每一筆記錄收成 uid 索引的快照，外鍵已換成 uid', async () => {
    const child = await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const form = await addForm({ childId: child.id, tier: 'Ⅳ', period: '115年06月' });

    const snapshot = await readLocalSnapshot();
    expect(snapshot.records.get(child.uid)).toMatchObject({ store: 'children', id: child.id });
    expect(snapshot.records.get(form.uid).payload.childId).toBe(child.uid);
    expect(snapshot.records.get(form.uid).hash).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.idByUid.get(`children:${child.uid}`)).toBe(child.id);
    expect(snapshot.uidById.get(`children:${child.id}`)).toBe(child.uid);
  });

  it('替升級前就存在、沒有 uid 的舊記錄補上 uid，且不把 updatedAt 設成現在', async () => {
    const id = await runRequest('children', 'readwrite', store =>
      store.add({ name: '舊資料童', birthDate: '2023-05-05', createdAt: '2023-05-05T00:00:00.000Z' })
    );

    const snapshot = await readLocalSnapshot();
    const stored = (await listChildren()).find(c => c.id === id);
    expect(stored.uid).toBeTypeOf('string');
    expect(snapshot.records.has(stored.uid)).toBe(true);
    expect(stored.updatedAt).toBe('2023-05-05T00:00:00.000Z');
  });
});

describe('applyRemoteRecord', () => {
  beforeEach(async () => { await clearAllData(); await clearTombstones(); });

  it('新增雲端獨有的記錄，並讓後續記錄解得開外鍵', async () => {
    const snapshot = await readLocalSnapshot();

    expect(await applyRemoteRecord({
      store: 'children', uid: 'cloud-child',
      payload: { uid: 'cloud-child', name: '雲端童', birthDate: '2024-02-02', updatedAt: 'T1' },
    }, snapshot)).toBe('written');

    expect(await applyRemoteRecord({
      store: 'forms', uid: 'cloud-form',
      payload: { uid: 'cloud-form', childId: 'cloud-child', tier: 'Ⅳ', period: '115年06月', updatedAt: 'T1' },
    }, snapshot)).toBe('written');

    const children = await listChildren();
    expect(children.map(c => c.name)).toEqual(['雲端童']);
    expect((await listFormsForChild(children[0].id)).map(f => f.period)).toEqual(['115年06月']);
  });

  it('外鍵還沒到位時延後處理，不寫出斷掉的參照', async () => {
    const snapshot = await readLocalSnapshot();
    expect(await applyRemoteRecord({
      store: 'forms', uid: 'orphan',
      payload: { uid: 'orphan', childId: 'not-here-yet', tier: 'Ⅳ', period: '115年06月' },
    }, snapshot)).toBe('deferred');
    expect(await runRequest('forms', 'readonly', store => store.getAll())).toEqual([]);
  });

  it('同 uid 的記錄是就地更新，不會變成第二筆', async () => {
    const child = await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const snapshot = await readLocalSnapshot();

    await applyRemoteRecord({
      store: 'children', uid: child.uid,
      payload: { uid: child.uid, name: '改過的名字', birthDate: '2024-01-01', updatedAt: 'T2' },
    }, snapshot);

    const children = await listChildren();
    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({ id: child.id, name: '改過的名字' });
  });
});

describe('deleteLocalByUid / adoptUid', () => {
  beforeEach(async () => { await clearAllData(); await clearTombstones(); });

  it('依 uid 刪除本機記錄且不留墓碑', async () => {
    const child = await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const snapshot = await readLocalSnapshot();
    await deleteLocalByUid('children', child.uid, snapshot);

    expect(await listChildren()).toEqual([]);
    expect(await runRequest('tombstones', 'readonly', store => store.getAll())).toEqual([]);
  });

  it('把本機記錄的 uid 換成雲端那顆，且不動 updatedAt', async () => {
    const child = await addChild({ name: '測試童', birthDate: '2024-01-01', updatedAt: '2026-01-01T00:00:00.000Z' });
    const snapshot = await readLocalSnapshot();
    await adoptUid('children', child.id, 'cloud-uid', snapshot);

    const stored = (await listChildren())[0];
    expect(stored.uid).toBe('cloud-uid');
    expect(stored.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(snapshot.idByUid.get('children:cloud-uid')).toBe(child.id);
    expect(snapshot.records.has('cloud-uid')).toBe(true);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/localSnapshot.test.js`
Expected: FAIL — 找不到 `src/sync/localSnapshot.js`。

- [ ] **Step 3: 實作**

```js
// src/sync/localSnapshot.js
import { runRequest, newUid } from '../storage/dbCore.js';
import { SYNC_STORES, serializeRecord, deserializeRecord, hashPayload, PHOTO_STORE } from './syncStores.js';

function refKey(store, value) {
  return `${store}:${value}`;
}

// Deliberately bypasses dbCore's gates: backfilling a uid, adopting a cloud uid, and applying a
// record the cloud already has must not bump updatedAt (that would make the record look
// locally-modified and bounce straight back up as a fake change) and must not fire the write
// listener (that would schedule another sync from inside a sync).
function rawPut(storeName, record) {
  return runRequest(storeName, 'readwrite', store => store.put(record));
}

export async function readLocalSnapshot() {
  const records = new Map();
  const uidById = new Map();
  const idByUid = new Map();

  const rows = new Map();
  for (const { store } of SYNC_STORES) {
    const all = await runRequest(store, 'readonly', objectStore => objectStore.getAll());
    rows.set(store, all);

    for (const row of all) {
      // Records written before the uid gate existed get one now. updatedAt falls back to
      // createdAt (or the epoch) rather than "now": stamping now would claim every pre-existing
      // record was just edited, and on a first sync between two such devices that would turn
      // every single record into a two-sided conflict.
      if (!row.uid || !row.updatedAt) {
        row.uid = row.uid || newUid();
        row.updatedAt = row.updatedAt || row.createdAt || new Date(0).toISOString();
        await rawPut(store, row);
      }
      uidById.set(refKey(store, row.id), row.uid);
      idByUid.set(refKey(store, row.uid), row.id);
    }
  }

  const uidOf = (store, id) => uidById.get(refKey(store, id));

  for (const { store } of SYNC_STORES) {
    for (const row of rows.get(store)) {
      const payload = serializeRecord(store, row, uidOf);
      records.set(row.uid, { store, id: row.id, payload, hash: await hashPayload(payload), record: row });
    }
  }

  return { records, uidById, idByUid };
}

// Writes one downloaded record straight to IndexedDB — one at a time, each independently
// complete, so a sync interrupted halfway (a phone that loses signal mid-download on its first
// sign-in) keeps everything it already got and only fetches the rest next time.
export async function applyRemoteRecord({ store, uid, payload }, snapshot) {
  const idOf = (refStore, refUid) => snapshot.idByUid.get(refKey(refStore, refUid));
  const existingId = snapshot.idByUid.get(refKey(store, uid));
  const existing = existingId === undefined
    ? undefined
    : await runRequest(store, 'readonly', objectStore => objectStore.get(existingId));

  const record = deserializeRecord(store, payload, idOf, existing && existing.photos);
  if (record === null) return 'deferred';

  record.uid = uid;
  let finalId = existingId;
  if (existingId === undefined) {
    finalId = await runRequest(store, 'readwrite', objectStore => objectStore.add(record));
  } else {
    await rawPut(store, { ...existing, ...record, id: existingId });
  }

  snapshot.uidById.set(refKey(store, finalId), uid);
  snapshot.idByUid.set(refKey(store, uid), finalId);
  snapshot.records.set(uid, {
    store,
    id: finalId,
    payload,
    hash: await hashPayload(payload),
    record: { ...record, id: finalId },
  });
  return 'written';
}

// No tombstone: this delete is us carrying out a delete another device already recorded, and a
// tombstone here would race back as a fresh instruction to delete on that device too.
export async function deleteLocalByUid(store, uid, snapshot) {
  const id = snapshot.idByUid.get(refKey(store, uid));
  if (id === undefined) return;
  await runRequest(store, 'readwrite', objectStore => objectStore.delete(id));
  snapshot.idByUid.delete(refKey(store, uid));
  snapshot.uidById.delete(refKey(store, id));
  snapshot.records.delete(uid);
}

// First sign-in only: this device and the cloud each invented their own uid for what is really
// the same record (both were kept in step by hand-carried backups). Swapping the local uid for
// the cloud one is all it takes — every local foreign key points at the local integer id, not
// the uid, so nothing downstream needs rewriting.
export async function adoptUid(store, id, cloudUid, snapshot) {
  const existing = await runRequest(store, 'readonly', objectStore => objectStore.get(id));
  if (!existing) return;
  const oldUid = existing.uid;
  await rawPut(store, { ...existing, uid: cloudUid });

  const entry = snapshot.records.get(oldUid);
  snapshot.records.delete(oldUid);
  snapshot.idByUid.delete(refKey(store, oldUid));
  if (entry) {
    entry.payload = { ...entry.payload, uid: cloudUid };
    entry.hash = await hashPayload(entry.payload);
    entry.record = { ...entry.record, uid: cloudUid };
    snapshot.records.set(cloudUid, entry);
  }
  snapshot.uidById.set(refKey(store, id), cloudUid);
  snapshot.idByUid.set(refKey(store, cloudUid), id);
}

export { PHOTO_STORE };
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/localSnapshot.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sync/localSnapshot.js tests/localSnapshot.test.js
git commit -m "$(cat <<'EOF'
feat: add local snapshot read and per-record remote apply

Applies one downloaded record at a time so an interrupted first sync resumes
instead of restarting.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 同步計畫比對（純函式）

**Files:**
- Create: `src/sync/diff.js`
- Test: Create `tests/syncDiff.test.js`

**Interfaces:**
- Produces: `planSync({ local, cloud, state, tombstones })` → `{ creates, uploads, downloads, merges, trashes, localDeletes, upToDate }`
  - `local` = `Map<uid, { store, hash }>`；`cloud` = `Map<uid, { store, hash, fileId }>`；`state` = `Map<uid, { hash, fileId }>`；`tombstones` = `Array<{ uid, store }>`。
  - `creates`／`uploads`／`downloads`／`merges`／`localDeletes`／`upToDate` 皆為 `Array<uid>`；`trashes` 為 `Array<{ uid, fileId }>`。
  - 判斷規則：

| 本機 | 雲端 | 上次基準 | 結果 |
|---|---|---|---|
| 有 | 無 | 無 | `creates` |
| 有 | 無 | 有 | `localDeletes`（別台裝置刪掉了） |
| 無 | 有 | 無 | `downloads` |
| 無 | 有 | 有 | `trashes`（本機刪掉了，雲端跟著刪） |
| 有 | 有 | — | hash 相同 → `upToDate`；只有本機變 → `uploads`；只有雲端變 → `downloads`；兩邊都變或沒有基準 → `merges` |
| 有墓碑 | 有 | — | `trashes`（墓碑優先於其他判斷） |
| 有墓碑 | 無 | — | 不做事 |

- [ ] **Step 1: 先寫會失敗的測試**

```js
// tests/syncDiff.test.js
import { describe, it, expect } from 'vitest';
import { planSync } from '../src/sync/diff.js';

const local = entries => new Map(entries.map(([uid, hash]) => [uid, { store: 'children', hash }]));
const cloud = entries => new Map(entries.map(([uid, hash]) => [uid, { store: 'children', hash, fileId: `file-${uid}` }]));
const state = entries => new Map(entries.map(([uid, hash]) => [uid, { hash, fileId: `file-${uid}` }]));

describe('planSync', () => {
  it('本機獨有且從沒同步過 → 上傳新檔', () => {
    const plan = planSync({ local: local([['a', 'h1']]), cloud: cloud([]), state: state([]), tombstones: [] });
    expect(plan.creates).toEqual(['a']);
    expect(plan.uploads).toEqual([]);
  });

  it('雲端獨有且從沒同步過 → 下載（換新裝置登入時補齊）', () => {
    const plan = planSync({ local: local([]), cloud: cloud([['a', 'h1']]), state: state([]), tombstones: [] });
    expect(plan.downloads).toEqual(['a']);
  });

  it('同步過但雲端已不存在 → 本機也刪掉', () => {
    const plan = planSync({ local: local([['a', 'h1']]), cloud: cloud([]), state: state([['a', 'h1']]), tombstones: [] });
    expect(plan.localDeletes).toEqual(['a']);
    expect(plan.creates).toEqual([]);
  });

  it('本機有墓碑 → 把雲端那份丟進垃圾桶', () => {
    const plan = planSync({
      local: local([]), cloud: cloud([['a', 'h1']]), state: state([['a', 'h1']]),
      tombstones: [{ uid: 'a', store: 'children' }],
    });
    expect(plan.trashes).toEqual([{ uid: 'a', fileId: 'file-a' }]);
    expect(plan.downloads).toEqual([]);
  });

  it('墓碑優先：即使雲端之後又被改過，也還是刪除', () => {
    const plan = planSync({
      local: local([]), cloud: cloud([['a', 'h2']]), state: state([['a', 'h1']]),
      tombstones: [{ uid: 'a', store: 'children' }],
    });
    expect(plan.trashes).toEqual([{ uid: 'a', fileId: 'file-a' }]);
  });

  it('墓碑但雲端已經沒有那筆 → 什麼都不做', () => {
    const plan = planSync({
      local: local([]), cloud: cloud([]), state: state([]),
      tombstones: [{ uid: 'a', store: 'children' }],
    });
    expect(plan.trashes).toEqual([]);
    expect(plan.creates).toEqual([]);
  });

  it('兩邊 hash 相同 → 不動作', () => {
    const plan = planSync({ local: local([['a', 'h1']]), cloud: cloud([['a', 'h1']]), state: state([['a', 'h1']]), tombstones: [] });
    expect(plan.upToDate).toEqual(['a']);
    expect(plan.uploads).toEqual([]);
    expect(plan.downloads).toEqual([]);
  });

  it('只有本機改過 → 上傳', () => {
    const plan = planSync({ local: local([['a', 'h2']]), cloud: cloud([['a', 'h1']]), state: state([['a', 'h1']]), tombstones: [] });
    expect(plan.uploads).toEqual(['a']);
  });

  it('只有雲端改過 → 下載', () => {
    const plan = planSync({ local: local([['a', 'h1']]), cloud: cloud([['a', 'h2']]), state: state([['a', 'h1']]), tombstones: [] });
    expect(plan.downloads).toEqual(['a']);
  });

  it('兩邊都改過 → 交給欄位合併', () => {
    const plan = planSync({ local: local([['a', 'h2']]), cloud: cloud([['a', 'h3']]), state: state([['a', 'h1']]), tombstones: [] });
    expect(plan.merges).toEqual(['a']);
  });

  it('兩邊都有但沒有基準、內容不同 → 交給欄位合併', () => {
    const plan = planSync({ local: local([['a', 'h2']]), cloud: cloud([['a', 'h3']]), state: state([]), tombstones: [] });
    expect(plan.merges).toEqual(['a']);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/syncDiff.test.js`
Expected: FAIL — 找不到 `src/sync/diff.js`。

- [ ] **Step 3: 實作**

```js
// src/sync/diff.js

// Pure three-way comparison: local snapshot vs cloud listing vs the base both sides agreed on at
// the last successful sync. It only compares content hashes, so deciding what needs to move
// takes exactly one Drive files.list call and zero downloads — "只更新不同的地方" rather than
// re-uploading everything.
export function planSync({ local, cloud, state, tombstones }) {
  const creates = [];
  const uploads = [];
  const downloads = [];
  const merges = [];
  const trashes = [];
  const localDeletes = [];
  const upToDate = [];

  const deleted = new Set(tombstones.map(tombstone => tombstone.uid));

  for (const uid of new Set([...local.keys(), ...cloud.keys(), ...deleted])) {
    const localEntry = local.get(uid);
    const cloudEntry = cloud.get(uid);

    // A tombstone wins over everything else: the teacher deliberately deleted this here, and the
    // whole point of syncing deletes is that it stays deleted rather than reappearing from
    // whichever device still had a copy.
    if (deleted.has(uid)) {
      if (cloudEntry) trashes.push({ uid, fileId: cloudEntry.fileId });
      continue;
    }

    const base = state.get(uid);

    if (localEntry && !cloudEntry) {
      if (base) localDeletes.push(uid);
      else creates.push(uid);
      continue;
    }

    if (!localEntry && cloudEntry) {
      if (base) trashes.push({ uid, fileId: cloudEntry.fileId });
      else downloads.push(uid);
      continue;
    }

    if (!localEntry && !cloudEntry) continue;

    if (localEntry.hash === cloudEntry.hash) {
      upToDate.push(uid);
    } else if (base && localEntry.hash === base.hash) {
      downloads.push(uid);
    } else if (base && cloudEntry.hash === base.hash) {
      uploads.push(uid);
    } else {
      // Both sides moved (or there is no base at all, as on a first sign-in) — which fields
      // actually clash is fieldMerge's job, not this function's.
      merges.push(uid);
    }
  }

  return { creates, uploads, downloads, merges, trashes, localDeletes, upToDate };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/syncDiff.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sync/diff.js tests/syncDiff.test.js
git commit -m "$(cat <<'EOF'
feat: add pure three-way sync diff

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 三方欄位合併（純函式）

**Files:**
- Create: `src/sync/fieldMerge.js`
- Test: Create `tests/fieldMerge.test.js`

**Interfaces:**
- Produces: `mergeFields(base, localPayload, cloudPayload, { unionArrayFields = [] } = {})` → `{ merged, conflicts }`
  - `base` 可為 `null`（首次登入沒有基準，此時任何差異都算衝突）。
  - `conflicts` = `Array<{ field, local, cloud }>`，只有「兩邊都改了同一個欄位、值還不一樣」才算。
  - `unionArrayFields` 裡的欄位（實務上就是 `photos`）改用聯集合併：依 `photoUid` 去重，兩邊的照片都保留，永不算衝突。
  - 有衝突時 `merged` 先採本機值（真正怎麼處理由使用者在比較畫面決定）。

- [ ] **Step 1: 先寫會失敗的測試**

```js
// tests/fieldMerge.test.js
import { describe, it, expect } from 'vitest';
import { mergeFields } from '../src/sync/fieldMerge.js';

describe('mergeFields', () => {
  it('兩邊值相同就直接採用', () => {
    const { merged, conflicts } = mergeFields({ a: 1 }, { a: 1 }, { a: 1 });
    expect(merged).toEqual({ a: 1 });
    expect(conflicts).toEqual([]);
  });

  it('只有雲端改過某欄位 → 採雲端', () => {
    const { merged, conflicts } = mergeFields({ a: 1, b: 2 }, { a: 1, b: 2 }, { a: 9, b: 2 });
    expect(merged).toEqual({ a: 9, b: 2 });
    expect(conflicts).toEqual([]);
  });

  it('只有本機改過某欄位 → 採本機', () => {
    const { merged, conflicts } = mergeFields({ a: 1, b: 2 }, { a: 1, b: 7 }, { a: 1, b: 2 });
    expect(merged).toEqual({ a: 1, b: 7 });
    expect(conflicts).toEqual([]);
  });

  it('改的是不同欄位 → 兩邊的修改都保留，不算衝突', () => {
    const { merged, conflicts } = mergeFields(
      { caption: '舊說明', note: '舊備註' },
      { caption: '新說明', note: '舊備註' },
      { caption: '舊說明', note: '新備註' }
    );
    expect(merged).toEqual({ caption: '新說明', note: '新備註' });
    expect(conflicts).toEqual([]);
  });

  it('兩邊改了同一個欄位且值不同 → 回報衝突，merged 暫採本機', () => {
    const { merged, conflicts } = mergeFields({ caption: '舊' }, { caption: '本機新' }, { caption: '雲端新' });
    expect(conflicts).toEqual([{ field: 'caption', local: '本機新', cloud: '雲端新' }]);
    expect(merged.caption).toBe('本機新');
  });

  it('沒有基準時，值不同一律算衝突', () => {
    expect(mergeFields(null, { caption: 'A' }, { caption: 'B' }).conflicts)
      .toEqual([{ field: 'caption', local: 'A', cloud: 'B' }]);
  });

  it('沒有基準但值相同不算衝突', () => {
    expect(mergeFields(null, { caption: 'A' }, { caption: 'A' }).conflicts).toEqual([]);
  });

  it('一邊新增照片、另一邊改文字 → 照片取聯集、文字照常合併，不跳衝突', () => {
    const { merged, conflicts } = mergeFields(
      { caption: '舊說明', photos: [{ photoUid: 'p1' }] },
      { caption: '舊說明', photos: [{ photoUid: 'p1' }, { photoUid: 'p2' }] },
      { caption: '新說明', photos: [{ photoUid: 'p1' }] },
      { unionArrayFields: ['photos'] }
    );
    expect(conflicts).toEqual([]);
    expect(merged.caption).toBe('新說明');
    expect(merged.photos.map(p => p.photoUid)).toEqual(['p1', 'p2']);
  });

  it('兩邊各加一張照片 → 兩張都留', () => {
    const { merged } = mergeFields(
      { photos: [] }, { photos: [{ photoUid: 'p2' }] }, { photos: [{ photoUid: 'p3' }] },
      { unionArrayFields: ['photos'] }
    );
    expect(merged.photos.map(p => p.photoUid)).toEqual(['p2', 'p3']);
  });

  it('只有其中一邊有的欄位會被帶進結果', () => {
    expect(mergeFields({}, { onlyLocal: 1 }, { onlyCloud: 2 }).merged).toEqual({ onlyLocal: 1, onlyCloud: 2 });
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/fieldMerge.test.js`
Expected: FAIL — 找不到 `src/sync/fieldMerge.js`。

- [ ] **Step 3: 實作**

```js
// src/sync/fieldMerge.js

function same(a, b) {
  return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
}

// 點滴分享 photos are a set, not a value: one device adding a photo while the other edits the
// caption is not a disagreement, it is two additions to keep. Union by photoUid (falling back to
// the whole element for anything without one) keeps both without ever asking.
function unionByPhotoUid(localList, cloudList) {
  const merged = [];
  const seen = new Set();
  for (const item of [...(localList || []), ...(cloudList || [])]) {
    const key = item && item.photoUid ? item.photoUid : JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

// Three-way field merge. `base` is the version both sides last agreed on: with it, "this field
// only moved on one side" is answerable without asking anyone, which is what keeps the conflict
// screen for genuine disagreements only. Without a base (first sign-in) any difference has to be
// treated as a disagreement — there is no way to tell who changed what.
export function mergeFields(base, localPayload, cloudPayload, { unionArrayFields = [] } = {}) {
  const merged = {};
  const conflicts = [];
  const unionFields = new Set(unionArrayFields);

  for (const field of new Set([...Object.keys(localPayload), ...Object.keys(cloudPayload)])) {
    const localValue = localPayload[field];
    const cloudValue = cloudPayload[field];

    if (unionFields.has(field)) {
      merged[field] = unionByPhotoUid(localValue, cloudValue);
      continue;
    }
    if (same(localValue, cloudValue)) {
      merged[field] = localValue === undefined ? cloudValue : localValue;
      continue;
    }
    if (base && same(localValue, base[field])) {
      merged[field] = cloudValue;
      continue;
    }
    if (base && same(cloudValue, base[field])) {
      merged[field] = localValue;
      continue;
    }

    conflicts.push({ field, local: localValue, cloud: cloudValue });
    merged[field] = localValue;
  }

  return { merged, conflicts };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/fieldMerge.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sync/fieldMerge.js tests/fieldMerge.test.js
git commit -m "$(cat <<'EOF'
feat: add three-way field merge with photo-set union

Only a same-field disagreement counts as a conflict; a new photo on one device
and an edited caption on the other merges silently.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 首次登入自然鍵配對（純函式）

**Files:**
- Create: `src/sync/reconcile.js`
- Test: Create `tests/reconcile.test.js`

**Interfaces:**
- Consumes: Task 5 的 `SYNC_STORES`／`canonicalJson`／`storeSpec`。
- Produces: `reconcileByNaturalKey({ localRecords, cloudRecords })` → `{ adopt, differing }`
  - 輸入兩個 `Map<uid, { store, payload }>`。
  - `adopt` = `Map<localUid, cloudUid>`：同一筆邏輯記錄兩邊各有不同 uid，本機該改用雲端那顆。
  - `differing` = `Array<{ localUid, cloudUid, store }>`：配對成功但內容不同，要跳比較畫面（規格：「只有兩邊都有、但內容不同才需要跳出比較畫面」）。
  - 依 `SYNC_STORES` 順序處理，處理子表前先把已決定的 `adopt` 套到外鍵上。

- [ ] **Step 1: 先寫會失敗的測試**

```js
// tests/reconcile.test.js
import { describe, it, expect } from 'vitest';
import { reconcileByNaturalKey } from '../src/sync/reconcile.js';

const map = entries => new Map(entries.map(([uid, store, payload]) => [uid, { store, payload: { uid, ...payload } }]));

describe('reconcileByNaturalKey', () => {
  it('兩邊各自產生 uid 的同一個孩子會被配對起來', () => {
    const { adopt, differing } = reconcileByNaturalKey({
      localRecords: map([['local-1', 'children', { name: '測試童', birthDate: '2024-01-01' }]]),
      cloudRecords: map([['cloud-1', 'children', { name: '測試童', birthDate: '2024-01-01' }]]),
    });
    expect(adopt.get('local-1')).toBe('cloud-1');
    expect(differing).toEqual([]);
  });

  it('不同的孩子不會被配對', () => {
    const { adopt } = reconcileByNaturalKey({
      localRecords: map([['local-1', 'children', { name: '甲童', birthDate: '2024-01-01' }]]),
      cloudRecords: map([['cloud-1', 'children', { name: '乙童', birthDate: '2024-02-02' }]]),
    });
    expect(adopt.size).toBe(0);
  });

  it('配對成功但內容不同 → 列入 differing 等使用者決定', () => {
    const { adopt, differing } = reconcileByNaturalKey({
      localRecords: map([['local-1', 'behaviorObservations', { reportId: 'r1', title: '午睡', narrative: '本機版' }]]),
      cloudRecords: map([['cloud-1', 'behaviorObservations', { reportId: 'r1', title: '午睡', narrative: '雲端版' }]]),
    });
    expect(adopt.get('local-1')).toBe('cloud-1');
    expect(differing).toEqual([{ localUid: 'local-1', cloudUid: 'cloud-1', store: 'behaviorObservations' }]);
  });

  it('只有 uid／updatedAt／isNew 不同不算內容不同', () => {
    const { differing } = reconcileByNaturalKey({
      localRecords: map([['local-1', 'children', { name: '測試童', birthDate: '2024-01-01', updatedAt: 'T1', isNew: true }]]),
      cloudRecords: map([['cloud-1', 'children', { name: '測試童', birthDate: '2024-01-01', updatedAt: 'T2', isNew: false }]]),
    });
    expect(differing).toEqual([]);
  });

  it('父記錄配對後，子記錄才配得起來', () => {
    const { adopt } = reconcileByNaturalKey({
      localRecords: map([
        ['local-child', 'children', { name: '測試童', birthDate: '2024-01-01' }],
        ['local-form', 'forms', { childId: 'local-child', tier: 'Ⅳ', period: '115年06月' }],
      ]),
      cloudRecords: map([
        ['cloud-child', 'children', { name: '測試童', birthDate: '2024-01-01' }],
        ['cloud-form', 'forms', { childId: 'cloud-child', tier: 'Ⅳ', period: '115年06月' }],
      ]),
    });
    expect(adopt.get('local-child')).toBe('cloud-child');
    expect(adopt.get('local-form')).toBe('cloud-form');
  });

  it('父記錄配不起來時子記錄也不會亂配（避免把兩個孩子的總表混在一起）', () => {
    const { adopt } = reconcileByNaturalKey({
      localRecords: map([
        ['local-child', 'children', { name: '甲童', birthDate: '2024-01-01' }],
        ['local-form', 'forms', { childId: 'local-child', tier: 'Ⅳ', period: '115年06月' }],
      ]),
      cloudRecords: map([
        ['cloud-child', 'children', { name: '乙童', birthDate: '2024-02-02' }],
        ['cloud-form', 'forms', { childId: 'cloud-child', tier: 'Ⅳ', period: '115年06月' }],
      ]),
    });
    expect(adopt.size).toBe(0);
  });

  it('uid 已經一致的記錄不需要配對', () => {
    const { adopt, differing } = reconcileByNaturalKey({
      localRecords: map([['same', 'children', { name: '測試童', birthDate: '2024-01-01' }]]),
      cloudRecords: map([['same', 'children', { name: '測試童', birthDate: '2024-01-01' }]]),
    });
    expect(adopt.size).toBe(0);
    expect(differing).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/reconcile.test.js`
Expected: FAIL — 找不到 `src/sync/reconcile.js`。

- [ ] **Step 3: 實作**

```js
// src/sync/reconcile.js
import { SYNC_STORES, canonicalJson, storeSpec } from './syncStores.js';

// Fields that say nothing about whether two records hold the same information.
const IGNORED_FIELDS = new Set(['uid', 'updatedAt', 'isNew', 'createdAt']);

function comparable(payload) {
  return canonicalJson(
    Object.fromEntries(Object.entries(payload).filter(([key]) => !IGNORED_FIELDS.has(key)))
  );
}

// Rewrites a payload's foreign keys through the adoptions decided so far, so a child record's
// natural key is expressed in the cloud's uids before being looked up.
function remapRefs(storeName, payload, adopt) {
  const { refs } = storeSpec(storeName);
  const remapped = { ...payload };
  for (const [field, ref] of Object.entries(refs)) {
    const value = payload[field];
    if (ref.kind === 'id') {
      remapped[field] = adopt.get(value) || value;
    } else if (ref.kind === 'idArray') {
      remapped[field] = (value || []).map(uid => adopt.get(uid) || uid);
    } else {
      remapped[field] = Object.fromEntries(
        Object.entries(value || {}).map(([uid, inner]) => [adopt.get(uid) || uid, inner])
      );
    }
  }
  return remapped;
}

// Runs once, on a device's first sign-in, when there is no sync state to tell local and cloud
// records apart. Both sides invented their own uid for records the teacher kept in step by
// hand-carried backup files, so without this pass every record would look cloud-only *and*
// local-only and the first sync would silently duplicate the entire dataset.
//
// Matching walks SYNC_STORES in dependency order because a child record's natural key contains
// its parent's uid: the parent has to be paired up first for the child's key to line up at all.
// That ordering is also what stops two different children's forms being confused for each other.
export function reconcileByNaturalKey({ localRecords, cloudRecords }) {
  const adopt = new Map();
  const differing = [];

  for (const { store, naturalKey } of SYNC_STORES) {
    const cloudByKey = new Map();
    for (const [uid, entry] of cloudRecords) {
      if (entry.store !== store) continue;
      cloudByKey.set(naturalKey(entry.payload), uid);
    }

    for (const [uid, entry] of localRecords) {
      if (entry.store !== store) continue;
      const localPayload = remapRefs(store, entry.payload, adopt);
      const cloudUid = cloudByKey.get(naturalKey(localPayload));
      if (!cloudUid || cloudUid === uid) continue;

      adopt.set(uid, cloudUid);
      if (comparable(localPayload) !== comparable(cloudRecords.get(cloudUid).payload)) {
        differing.push({ localUid: uid, cloudUid, store });
      }
    }
  }

  return { adopt, differing };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/reconcile.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sync/reconcile.js tests/reconcile.test.js
git commit -m "$(cat <<'EOF'
feat: match local and cloud records by natural key on first sign-in

Two devices kept in step by hand-carried backups hold different uids for the
same record; without this pass the first sync would duplicate everything.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Google 登入（Google Identity Services token flow）

**Files:**
- Create: `src/sync/googleAuth.js`
- Test: Create `tests/googleAuth.test.js`

**Interfaces:**
- Produces:
  - `SCOPES = 'openid profile https://www.googleapis.com/auth/drive.file'`
  - `SYNC_MODE_KEY = 'c-form-sync-mode'`、`SYNC_NAME_KEY = 'c-form-sync-name'`
  - `readSyncMode()` → `'google'`｜`'guest'`｜`null`（沒選過）
  - `writeSyncMode(mode)`、`readDisplayName()`、`clearSyncMode()`
  - `isOffline()` → boolean（`navigator.onLine === false`）
  - `createGoogleAuth({ clientId, loadGis, fetchUserInfo })` → 物件：
    - `signIn()` → `Promise<{ name }>`；會跳 Google 同意畫面。離線時 reject `new Error('OFFLINE')`。
    - `resume()` → `Promise<{ name } | null>`；上次選 `'google'` 時靜默取 token（`prompt: ''`），拿不到回 `null`（代表要顯示「登入已失效」）。
    - `getAccessToken()` → `Promise<string>`；沒有有效 token 就 reject `new Error('AUTH_REQUIRED')`。
    - `signOut()` → 清掉記憶體中的 token 與 `c-form-sync-mode`；**不動任何資料表**。
    - `isSignedIn()` → boolean

- [ ] **Step 1: 先寫會失敗的測試**

```js
// tests/googleAuth.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createGoogleAuth, readSyncMode, writeSyncMode, clearSyncMode, readDisplayName, SCOPES,
} from '../src/sync/googleAuth.js';

// A stand-in for the real GIS token client: captures the callback and lets the test decide what
// Google would have answered.
function fakeGis() {
  const calls = [];
  let callback = null;
  return {
    calls,
    respond: response => callback(response),
    loadGis: async () => ({
      accounts: {
        oauth2: {
          initTokenClient: config => {
            callback = config.callback;
            return { requestAccessToken: options => calls.push(options || {}) };
          },
        },
      },
    }),
  };
}

describe('登入方式記憶', () => {
  beforeEach(() => localStorage.clear());

  it('沒選過時是 null，選過之後記住', () => {
    expect(readSyncMode()).toBe(null);
    writeSyncMode('guest');
    expect(readSyncMode()).toBe('guest');
    clearSyncMode();
    expect(readSyncMode()).toBe(null);
  });
});

describe('createGoogleAuth', () => {
  beforeEach(() => localStorage.clear());

  it('離線時 signIn 直接失敗，不去打 Google', async () => {
    const gis = fakeGis();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const auth = createGoogleAuth({ clientId: 'test-client', loadGis: gis.loadGis });

    await expect(auth.signIn()).rejects.toThrow('OFFLINE');
    expect(gis.calls).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it('登入成功後記住模式與顯示名稱，並拿得到 token', async () => {
    const gis = fakeGis();
    const auth = createGoogleAuth({
      clientId: 'test-client',
      loadGis: gis.loadGis,
      fetchUserInfo: async () => ({ name: '小美' }),
    });

    const pending = auth.signIn();
    await vi.waitFor(() => expect(gis.calls).toHaveLength(1));
    gis.respond({ access_token: 'tok-1', expires_in: 3600 });

    expect(await pending).toEqual({ name: '小美' });
    expect(auth.isSignedIn()).toBe(true);
    expect(await auth.getAccessToken()).toBe('tok-1');
    expect(readSyncMode()).toBe('google');
    expect(readDisplayName()).toBe('小美');
  });

  it('要求的 scope 含 drive.file 與 profile', () => {
    expect(SCOPES).toContain('https://www.googleapis.com/auth/drive.file');
    expect(SCOPES).toContain('profile');
  });

  it('沒有 token 時 getAccessToken 要求重新登入', async () => {
    const gis = fakeGis();
    const auth = createGoogleAuth({ clientId: 'test-client', loadGis: gis.loadGis });
    await expect(auth.getAccessToken()).rejects.toThrow('AUTH_REQUIRED');
  });

  it('resume 在上次是訪客模式時不做任何事', async () => {
    const gis = fakeGis();
    writeSyncMode('guest');
    const auth = createGoogleAuth({ clientId: 'test-client', loadGis: gis.loadGis });
    expect(await auth.resume()).toBe(null);
    expect(gis.calls).toHaveLength(0);
  });

  it('resume 用靜默模式取 token；被收回授權時回 null', async () => {
    const gis = fakeGis();
    writeSyncMode('google');
    localStorage.setItem('c-form-sync-name', '小美');
    const auth = createGoogleAuth({ clientId: 'test-client', loadGis: gis.loadGis });

    const pending = auth.resume();
    await vi.waitFor(() => expect(gis.calls).toHaveLength(1));
    expect(gis.calls[0].prompt).toBe('');
    gis.respond({ error: 'access_denied' });

    expect(await pending).toBe(null);
    expect(auth.isSignedIn()).toBe(false);
  });

  it('登出只清掉 token 與登入模式', async () => {
    const gis = fakeGis();
    const auth = createGoogleAuth({
      clientId: 'test-client', loadGis: gis.loadGis, fetchUserInfo: async () => ({ name: '小美' }),
    });
    const pending = auth.signIn();
    await vi.waitFor(() => expect(gis.calls).toHaveLength(1));
    gis.respond({ access_token: 'tok-1', expires_in: 3600 });
    await pending;

    auth.signOut();
    expect(auth.isSignedIn()).toBe(false);
    expect(readSyncMode()).toBe(null);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/googleAuth.test.js`
Expected: FAIL — 找不到 `src/sync/googleAuth.js`。

- [ ] **Step 3: 實作**

```js
// src/sync/googleAuth.js

// GIS's *token* flow (not the One Tap ID-token flow): all this app needs is an access token for
// Drive plus a display name for the greeting. The token lives in memory only and is never
// persisted — the password gate is a soft deterrent, so anything on disk is readable by whoever
// has the device, and a Drive-scoped token is worth far more than the local copy of the data.
export const SCOPES = 'openid profile https://www.googleapis.com/auth/drive.file';
export const SYNC_MODE_KEY = 'c-form-sync-mode';
export const SYNC_NAME_KEY = 'c-form-sync-name';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export function readSyncMode() {
  return localStorage.getItem(SYNC_MODE_KEY);
}

export function writeSyncMode(mode) {
  localStorage.setItem(SYNC_MODE_KEY, mode);
}

export function clearSyncMode() {
  localStorage.removeItem(SYNC_MODE_KEY);
}

export function readDisplayName() {
  return localStorage.getItem(SYNC_NAME_KEY) || '';
}

export function isOffline() {
  return navigator.onLine === false;
}

function defaultLoadGis() {
  if (window.google && window.google.accounts) return Promise.resolve(window.google);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error('GIS_LOAD_FAILED'));
    document.head.appendChild(script);
  });
}

async function defaultFetchUserInfo(token) {
  const response = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('USERINFO_FAILED');
  return response.json();
}

export function createGoogleAuth({
  clientId, loadGis = defaultLoadGis, fetchUserInfo = defaultFetchUserInfo,
}) {
  let token = null;
  let expiresAtMs = 0;
  let tokenClient = null;
  let pending = null;

  async function ensureClient() {
    if (tokenClient) return tokenClient;
    const google = await loadGis();
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: response => {
        const resolve = pending;
        pending = null;
        if (!resolve) return;
        if (response && response.access_token) {
          token = response.access_token;
          // Expire a minute early so a request never leaves with a token that dies in flight.
          expiresAtMs = Date.now() + (Number(response.expires_in) || 3600) * 1000 - 60000;
          resolve(response.access_token);
        } else {
          token = null;
          expiresAtMs = 0;
          resolve(null);
        }
      },
    });
    return tokenClient;
  }

  function requestToken(options) {
    return new Promise(resolve => {
      pending = resolve;
      tokenClient.requestAccessToken(options);
    });
  }

  async function signIn() {
    // Checked before touching GIS: a consent popup that can't reach Google just hangs on a blank
    // sheet, which is exactly the "卡住/無反應" the design rules out.
    if (isOffline()) throw new Error('OFFLINE');
    await ensureClient();
    const fresh = await requestToken({});
    if (!fresh) throw new Error('SIGN_IN_CANCELLED');
    const profile = await fetchUserInfo(fresh);
    const name = (profile && profile.name) || '';
    writeSyncMode('google');
    localStorage.setItem(SYNC_NAME_KEY, name);
    return { name };
  }

  // prompt: '' asks for a token without showing anything, which works while Google still has a
  // live session and consent on file. A null return is the "登入已失效，請重新登入" case.
  async function resume() {
    if (readSyncMode() !== 'google') return null;
    if (isOffline()) return null;
    await ensureClient();
    const fresh = await requestToken({ prompt: '' });
    if (!fresh) return null;
    return { name: readDisplayName() };
  }

  async function getAccessToken() {
    if (token && Date.now() < expiresAtMs) return token;
    const refreshed = await resume();
    if (!refreshed || !token) throw new Error('AUTH_REQUIRED');
    return token;
  }

  function signOut() {
    // Signing out pauses syncing; it must not touch IndexedDB. This is the teacher's own device,
    // and wiping the local copy on logout would turn a "先暫停" into data loss.
    token = null;
    expiresAtMs = 0;
    clearSyncMode();
  }

  return { signIn, resume, getAccessToken, signOut, isSignedIn: () => Boolean(token) };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/googleAuth.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sync/googleAuth.js tests/googleAuth.test.js
git commit -m "$(cat <<'EOF'
feat: add Google Identity Services token auth for sync

Access token stays in memory only; logout clears the token and nothing else.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Drive REST 客戶端

**Files:**
- Create: `src/sync/driveClient.js`
- Test: Create `tests/driveClient.test.js`

**Interfaces:**
- Consumes: Task 10 的 `auth.getAccessToken()`。
- Produces:
  - `FOLDER_NAME = '育英公托填表系統'`、`MANIFEST_NAME = 'sync-manifest.json'`、`FORMAT_VERSION = 1`、`MAX_CONCURRENCY = 5`
  - `DriveFormatError`、`AuthExpiredError`（皆 `extends Error`）
  - `mapWithConcurrency(items, limit, worker)` → `Promise<Array<{ item, ok, value, error }>>`，同時最多 `limit` 個在跑，永不 reject。
  - `createDriveClient({ auth, fetchImpl })` → 物件：
    - `ensureFolder()` → `Promise<string>` folderId。資料夾不存在就建立（含 manifest）；資料夾存在但 manifest 不見了或 `formatVersion` 不是 1 → throw `DriveFormatError`。
    - `listCloud(folderId)` → `Promise<{ records: Map<uid, { store, hash, fileId }>, photos: Map<photoUid, { fileId }>, cloudNow: string }>`；分頁抓完，`cloudNow` 取自回應的 HTTP `Date` 標頭。
    - `uploadRecord(folderId, { uid, store, hash, payload, fileId })` → `Promise<{ fileId }>`
    - `downloadRecord(fileId)` → `Promise<object>`
    - `uploadPhoto(folderId, { photoUid, blob, fileId })` → `Promise<{ fileId }>`
    - `downloadPhoto(fileId)` → `Promise<Blob>`
    - `trashFile(fileId)` → `Promise<void>`
  - 任何回應 401/403 一律 throw `AuthExpiredError`。

- [ ] **Step 1: 先寫會失敗的測試**

```js
// tests/driveClient.test.js
import { describe, it, expect } from 'vitest';
import {
  createDriveClient, mapWithConcurrency, DriveFormatError, AuthExpiredError, FOLDER_NAME,
} from '../src/sync/driveClient.js';

const auth = { getAccessToken: async () => 'tok' };

// A scripted fetch: each entry matches on a substring of the URL and returns a canned response.
function scriptedFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET', body: options.body });
    const route = routes.find(
      r => String(url).includes(r.match) && (!r.method || r.method === (options.method || 'GET'))
    );
    if (!route) throw new Error(`unscripted request: ${url}`);
    return {
      ok: route.status === undefined || route.status < 400,
      status: route.status || 200,
      headers: new Headers({ Date: 'Sat, 13 Sep 2026 06:32:00 GMT', ...(route.headers || {}) }),
      json: async () => route.json,
      blob: async () => route.blob,
    };
  };
  return { fetchImpl, calls };
}

describe('mapWithConcurrency', () => {
  it('不超過並行上限，且回傳每一項的結果', async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async n => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise(r => setTimeout(r, 1));
      inFlight -= 1;
      return n * 2;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(results.map(r => r.value)).toEqual([2, 4, 6, 8, 10, 12, 14]);
  });

  it('單一項失敗不會中斷其他項（一張壞照片不該拖垮整批）', async () => {
    const results = await mapWithConcurrency(['a', 'bad', 'c'], 2, async item => {
      if (item === 'bad') throw new Error('boom');
      return item.toUpperCase();
    });
    expect(results.map(r => r.ok)).toEqual([true, false, true]);
    expect(results[1].error.message).toBe('boom');
    expect(results[2].value).toBe('C');
  });
});

describe('ensureFolder', () => {
  it('資料夾不存在時建立資料夾與守門檔', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      { match: 'files?q=', json: { files: [] } },
      { match: 'drive/v3/files', method: 'POST', json: { id: 'new-folder' } },
      { match: 'upload/drive/v3/files', method: 'POST', json: { id: 'manifest-file' } },
    ]);
    const drive = createDriveClient({ auth, fetchImpl });
    expect(await drive.ensureFolder()).toBe('new-folder');
    expect(calls.some(c => c.url.includes(encodeURIComponent(FOLDER_NAME)))).toBe(true);
  });

  it('資料夾存在且守門檔正常時直接回傳 folderId', async () => {
    const { fetchImpl } = scriptedFetch([
      { match: encodeURIComponent(FOLDER_NAME), json: { files: [{ id: 'folder-1' }] } },
      { match: encodeURIComponent('sync-manifest.json'), json: { files: [{ id: 'manifest-1' }] } },
      { match: 'manifest-1?alt=media', json: { formatVersion: 1 } },
    ]);
    const drive = createDriveClient({ auth, fetchImpl });
    expect(await drive.ensureFolder()).toBe('folder-1');
  });

  it('資料夾存在但守門檔不見了 → 停止同步並報格式錯誤', async () => {
    const { fetchImpl } = scriptedFetch([
      { match: encodeURIComponent(FOLDER_NAME), json: { files: [{ id: 'folder-1' }] } },
      { match: encodeURIComponent('sync-manifest.json'), json: { files: [] } },
    ]);
    const drive = createDriveClient({ auth, fetchImpl });
    await expect(drive.ensureFolder()).rejects.toBeInstanceOf(DriveFormatError);
  });

  it('守門檔的 formatVersion 不認識 → 報格式錯誤', async () => {
    const { fetchImpl } = scriptedFetch([
      { match: encodeURIComponent(FOLDER_NAME), json: { files: [{ id: 'folder-1' }] } },
      { match: encodeURIComponent('sync-manifest.json'), json: { files: [{ id: 'manifest-1' }] } },
      { match: 'manifest-1?alt=media', json: { formatVersion: 99 } },
    ]);
    const drive = createDriveClient({ auth, fetchImpl });
    await expect(drive.ensureFolder()).rejects.toBeInstanceOf(DriveFormatError);
  });
});

describe('listCloud', () => {
  it('跨頁抓完所有檔案，分開記錄與照片，並取雲端時間', async () => {
    let page = 0;
    const fetchImpl = async url => {
      page += 1;
      const body = page === 1
        ? {
            nextPageToken: 'page2',
            files: [{
              id: 'f1', name: 'rec-u1.json',
              appProperties: { cformUid: 'u1', cformStore: 'children', cformHash: 'h1' },
            }],
          }
        : {
            files: [{ id: 'f2', name: 'photo-p1.jpg', appProperties: { cformPhotoUid: 'p1' } }],
          };
      expect(String(url)).toContain('files?q=');
      return {
        ok: true, status: 200,
        headers: new Headers({ Date: 'Sat, 13 Sep 2026 06:32:00 GMT' }),
        json: async () => body,
      };
    };

    const drive = createDriveClient({ auth, fetchImpl });
    const { records, photos, cloudNow } = await drive.listCloud('folder-1');
    expect(records.get('u1')).toEqual({ store: 'children', hash: 'h1', fileId: 'f1' });
    expect(photos.get('p1')).toEqual({ fileId: 'f2' });
    expect(new Date(cloudNow).toISOString()).toBe('2026-09-13T06:32:00.000Z');
  });
});

describe('uploadRecord / downloadRecord / trashFile', () => {
  it('新記錄用 POST 建檔，並把 uid/store/hash 存進 appProperties', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      { match: 'upload/drive/v3/files', method: 'POST', json: { id: 'new-file' } },
    ]);
    const drive = createDriveClient({ auth, fetchImpl });
    const result = await drive.uploadRecord('folder-1', {
      uid: 'u1', store: 'children', hash: 'h1', payload: { uid: 'u1', name: '測試童' },
    });
    expect(result).toEqual({ fileId: 'new-file' });
    const sent = await calls[0].body.text();
    expect(sent).toContain('"cformUid":"u1"');
    expect(sent).toContain('"cformHash":"h1"');
  });

  it('已存在的記錄用 PATCH 更新同一個檔案（讓 Drive 自己留版本歷史）', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      { match: 'upload/drive/v3/files/existing', method: 'PATCH', json: { id: 'existing' } },
    ]);
    const drive = createDriveClient({ auth, fetchImpl });
    await drive.uploadRecord('folder-1', {
      uid: 'u1', store: 'children', hash: 'h2', payload: {}, fileId: 'existing',
    });
    expect(calls[0].method).toBe('PATCH');
  });

  it('下載記錄回傳解析後的內容', async () => {
    const { fetchImpl } = scriptedFetch([
      { match: 'files/f1?alt=media', json: { uid: 'u1', name: '測試童' } },
    ]);
    const drive = createDriveClient({ auth, fetchImpl });
    expect(await drive.downloadRecord('f1')).toEqual({ uid: 'u1', name: '測試童' });
  });

  it('刪除是丟垃圾桶（保留 Drive 的 30 天還原空間），不是永久刪除', async () => {
    const { fetchImpl, calls } = scriptedFetch([{ match: 'files/f1', method: 'PATCH', json: {} }]);
    const drive = createDriveClient({ auth, fetchImpl });
    await drive.trashFile('f1');
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].body).toContain('"trashed":true');
  });

  it('401 一律當成登入失效', async () => {
    const { fetchImpl } = scriptedFetch([{ match: 'files/f1?alt=media', status: 401, json: {} }]);
    const drive = createDriveClient({ auth, fetchImpl });
    await expect(drive.downloadRecord('f1')).rejects.toBeInstanceOf(AuthExpiredError);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/driveClient.test.js`
Expected: FAIL — 找不到 `src/sync/driveClient.js`。

- [ ] **Step 3: 實作**

```js
// src/sync/driveClient.js

// A plain, visible folder in My Drive rather than appDataFolder: the design asks for a folder the
// teacher can open in the Drive web UI and copy for herself. The drive.file scope still limits
// this app to files it created, so nothing else in her Drive is reachable.
export const FOLDER_NAME = '育英公托填表系統';
export const MANIFEST_NAME = 'sync-manifest.json';
export const FORMAT_VERSION = 1;
export const MAX_CONCURRENCY = 5;

const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

// Thrown when the cloud folder is not shaped the way this app left it (manifest deleted, or a
// formatVersion from a newer build). Everything stops: guessing whether the remaining files are
// a complete dataset is how you turn a manual mistake into silent data loss.
export class DriveFormatError extends Error {}
export class AuthExpiredError extends Error {}

// Small worker pool. One request at a time would make a first sync on a new device pay the
// round-trip latency once per record; unbounded parallelism gets rate-limited instead. Never
// rejects — a single unreadable photo is reported in its own result and the batch continues.
export async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;

  async function run() {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { item: items[index], ok: true, value: await worker(items[index]), error: null };
      } catch (error) {
        results[index] = { item: items[index], ok: false, value: null, error };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export function createDriveClient({ auth, fetchImpl = (...args) => fetch(...args) }) {
  async function request(url, options = {}) {
    const token = await auth.getAccessToken();
    const response = await fetchImpl(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
    // 403 covers a revoked grant as well as quota; both need the teacher to act, and both are
    // surfaced as the same persistent "登入已失效" warning rather than a vanishing toast.
    if (response.status === 401 || response.status === 403) throw new AuthExpiredError('AUTH_EXPIRED');
    if (!response.ok) throw new Error(`DRIVE_${response.status}`);
    return response;
  }

  async function listQuery(query) {
    const url =
      `${FILES_URL}?q=${encodeURIComponent(query)}` +
      `&fields=${encodeURIComponent('files(id,name,appProperties)')}&spaces=drive&pageSize=1000`;
    const response = await request(url);
    return (await response.json()).files || [];
  }

  // The body must be a Blob, not a concatenated string: photo bytes do not survive string
  // concatenation. Blob parts keep the binary part untouched.
  async function multipartUpload({ metadata, body, contentType, fileId }) {
    const boundary = 'cform-boundary-7f3a';
    const head =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`;
    const blob = new Blob([head, body, `\r\n--${boundary}--`], {
      type: `multipart/related; boundary=${boundary}`,
    });
    // Updating the same fileId rather than replacing the file is what gives the design's first
    // safety net for free: Drive keeps ~30 days of prior versions per file, restorable from the
    // Drive web UI with no version bookkeeping of our own.
    const url = fileId
      ? `${UPLOAD_URL}/${fileId}?uploadType=multipart&fields=id`
      : `${UPLOAD_URL}?uploadType=multipart&fields=id`;
    const response = await request(url, {
      method: fileId ? 'PATCH' : 'POST',
      body: blob,
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    });
    return (await response.json()).id;
  }

  async function ensureFolder() {
    const found = await listQuery(
      `name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`
    );
    if (found.length === 0) {
      const created = await request(`${FILES_URL}?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
      });
      const folderId = (await created.json()).id;
      await multipartUpload({
        metadata: { name: MANIFEST_NAME, parents: [folderId] },
        body: JSON.stringify({ formatVersion: FORMAT_VERSION }),
        contentType: 'application/json',
      });
      return folderId;
    }

    const folderId = found[0].id;
    const manifests = await listQuery(
      `name='${MANIFEST_NAME}' and '${folderId}' in parents and trashed=false`
    );
    if (manifests.length === 0) throw new DriveFormatError('MANIFEST_MISSING');
    const manifest = await (await request(`${FILES_URL}/${manifests[0].id}?alt=media`)).json();
    if (!manifest || manifest.formatVersion !== FORMAT_VERSION) throw new DriveFormatError('MANIFEST_VERSION');
    return folderId;
  }

  async function listCloud(folderId) {
    const records = new Map();
    const photos = new Map();
    let pageToken = '';
    let cloudNow = null;

    do {
      const query = `'${folderId}' in parents and trashed=false`;
      const url =
        `${FILES_URL}?q=${encodeURIComponent(query)}` +
        `&fields=${encodeURIComponent('nextPageToken,files(id,name,appProperties)')}` +
        `&spaces=drive&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`;
      const response = await request(url);
      // The cloud's own clock, taken from the response header. A device whose clock has drifted
      // would otherwise label a sync with a time that is simply wrong.
      cloudNow = cloudNow || response.headers.get('Date');
      const body = await response.json();

      for (const file of body.files || []) {
        const props = file.appProperties || {};
        if (props.cformPhotoUid) {
          photos.set(props.cformPhotoUid, { fileId: file.id });
        } else if (props.cformUid) {
          records.set(props.cformUid, { store: props.cformStore, hash: props.cformHash, fileId: file.id });
        }
        // Anything else (the manifest, or a file the teacher dropped in herself) is ignored.
      }
      pageToken = body.nextPageToken || '';
    } while (pageToken);

    return { records, photos, cloudNow: cloudNow || new Date().toISOString() };
  }

  // The content hash rides along in appProperties so one files.list answers "what changed" for
  // the entire dataset without downloading a single record.
  async function uploadRecord(folderId, { uid, store, hash, payload, fileId }) {
    const metadata = fileId
      ? { appProperties: { cformUid: uid, cformStore: store, cformHash: hash } }
      : {
          name: `rec-${uid}.json`,
          parents: [folderId],
          appProperties: { cformUid: uid, cformStore: store, cformHash: hash },
        };
    const id = await multipartUpload({
      metadata, body: JSON.stringify(payload), contentType: 'application/json', fileId,
    });
    return { fileId: id };
  }

  async function downloadRecord(fileId) {
    return (await request(`${FILES_URL}/${fileId}?alt=media`)).json();
  }

  async function uploadPhoto(folderId, { photoUid, blob, fileId }) {
    const metadata = fileId
      ? { appProperties: { cformPhotoUid: photoUid } }
      : { name: `photo-${photoUid}.jpg`, parents: [folderId], appProperties: { cformPhotoUid: photoUid } };
    const id = await multipartUpload({
      metadata, body: blob, contentType: blob.type || 'image/jpeg', fileId,
    });
    return { fileId: id };
  }

  async function downloadPhoto(fileId) {
    return (await request(`${FILES_URL}/${fileId}?alt=media`)).blob();
  }

  async function trashFile(fileId) {
    await request(`${FILES_URL}/${fileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    });
  }

  return { ensureFolder, listCloud, uploadRecord, downloadRecord, uploadPhoto, downloadPhoto, trashFile };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/driveClient.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sync/driveClient.js tests/driveClient.test.js
git commit -m "$(cat <<'EOF'
feat: add Drive REST client for per-record sync files

One file per record with its content hash in appProperties, so one files.list
answers "what changed" without downloading anything.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: 照片同步

**Files:**
- Create: `src/sync/photoSync.js`
- Test: Create `tests/photoSync.test.js`

**Interfaces:**
- Consumes: Task 4 的 `readSyncState`／`writeSyncState`／`deleteSyncState`；Task 5 的 `PHOTO_STORE`；Task 6 的 `readLocalSnapshot`；Task 11 的 `mapWithConcurrency`／`MAX_CONCURRENCY`。
- Produces: `syncPhotos({ drive, folderId, snapshot, cloudPhotos, state, cloudNow })` → `Promise<{ uploaded, downloaded, trashed, failed }>`（全部是數字）
  - **上傳**：本機 `highlightEntries` 的 photos 裡有 blob、但 `state` 沒有該 `photoUid` 的項目 → 上傳並寫入 `syncState`（`{ uid: photoUid, store: 'photo', hash: null, fileId, syncedAt: cloudNow }`）。
  - **下載**：本機描述子存在但 `blob` 是 undefined、而雲端有該檔 → 下載後塞回對應記錄的 photos。
  - **刪除**：雲端有、`state` 也有（代表這台傳過）、但本機描述子已不存在 → `trashFile` 並 `deleteSyncState`。
  - 單張失敗只累加 `failed`，不中斷。

- [ ] **Step 1: 先寫會失敗的測試**

```js
// tests/photoSync.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { syncPhotos } from '../src/sync/photoSync.js';
import { readLocalSnapshot } from '../src/sync/localSnapshot.js';
import { readSyncState, writeSyncState } from '../src/storage/syncStateDb.js';
import { addChild, clearAllData } from '../src/storage/db.js';
import {
  addParentReport, addHighlightEntry, listHighlightEntriesForReport,
} from '../src/storage/parentReportDb.js';
import { runRequest } from '../src/storage/dbCore.js';

const CLOUD_NOW = '2026-09-13T06:32:00.000Z';

function fakeDrive({ downloads = {} } = {}) {
  const uploaded = [];
  const trashed = [];
  return {
    uploaded, trashed,
    uploadPhoto: async (folderId, { photoUid }) => {
      uploaded.push(photoUid);
      return { fileId: `file-${photoUid}` };
    },
    downloadPhoto: async fileId => {
      if (downloads[fileId] === 'broken') throw new Error('corrupt');
      return new Blob(['photo-bytes'], { type: 'image/jpeg' });
    },
    trashFile: async fileId => { trashed.push(fileId); },
  };
}

async function seedEntry(photos) {
  const child = await addChild({ name: '測試童', birthDate: '2024-01-01' });
  const report = await addParentReport({ childId: child.id, tier: 'Ⅳ', period: '115年06月' });
  const entry = await addHighlightEntry({ reportId: report.id, photos, caption: '玩水' });
  return { report, entry };
}

describe('syncPhotos', () => {
  beforeEach(async () => {
    await clearAllData();
    await runRequest('syncState', 'readwrite', store => store.clear());
    await runRequest('tombstones', 'readwrite', store => store.clear());
  });

  it('只上傳還沒同步過的照片，已同步的不重傳', async () => {
    await seedEntry([
      { photoUid: 'p1', width: 960, height: 640, blob: new Blob(['a'], { type: 'image/jpeg' }) },
      { photoUid: 'p2', width: 960, height: 640, blob: new Blob(['b'], { type: 'image/jpeg' }) },
    ]);
    await writeSyncState({ uid: 'p1', store: 'photo', hash: null, fileId: 'file-p1', syncedAt: CLOUD_NOW });

    const drive = fakeDrive();
    const result = await syncPhotos({
      drive, folderId: 'folder-1',
      snapshot: await readLocalSnapshot(),
      cloudPhotos: new Map([['p1', { fileId: 'file-p1' }]]),
      state: await readSyncState(), cloudNow: CLOUD_NOW,
    });

    expect(drive.uploaded).toEqual(['p2']);
    expect(result.uploaded).toBe(1);
    expect((await readSyncState()).get('p2')).toMatchObject({ store: 'photo', fileId: 'file-p2' });
  });

  it('改了文字說明但照片沒換時不重傳照片', async () => {
    await seedEntry([
      { photoUid: 'p1', width: 960, height: 640, blob: new Blob(['a'], { type: 'image/jpeg' }) },
    ]);
    await writeSyncState({ uid: 'p1', store: 'photo', hash: null, fileId: 'file-p1', syncedAt: CLOUD_NOW });

    const drive = fakeDrive();
    await syncPhotos({
      drive, folderId: 'folder-1',
      snapshot: await readLocalSnapshot(),
      cloudPhotos: new Map([['p1', { fileId: 'file-p1' }]]),
      state: await readSyncState(), cloudNow: CLOUD_NOW,
    });
    expect(drive.uploaded).toEqual([]);
  });

  it('補下載本機只有描述子、還沒有實體的照片', async () => {
    const { report } = await seedEntry([{ photoUid: 'p9', width: 960, height: 640, type: 'image/jpeg' }]);

    const drive = fakeDrive();
    const result = await syncPhotos({
      drive, folderId: 'folder-1',
      snapshot: await readLocalSnapshot(),
      cloudPhotos: new Map([['p9', { fileId: 'file-p9' }]]),
      state: await readSyncState(), cloudNow: CLOUD_NOW,
    });

    expect(result.downloaded).toBe(1);
    const entries = await listHighlightEntriesForReport(report.id);
    expect(entries[0].photos[0].blob).toBeTruthy();
  });

  it('本機已刪掉的照片，雲端那份也丟進垃圾桶', async () => {
    await seedEntry([
      { photoUid: 'p1', width: 960, height: 640, blob: new Blob(['a'], { type: 'image/jpeg' }) },
    ]);
    await writeSyncState({ uid: 'p1', store: 'photo', hash: null, fileId: 'file-p1', syncedAt: CLOUD_NOW });
    await writeSyncState({ uid: 'gone', store: 'photo', hash: null, fileId: 'file-gone', syncedAt: CLOUD_NOW });

    const drive = fakeDrive();
    const result = await syncPhotos({
      drive, folderId: 'folder-1',
      snapshot: await readLocalSnapshot(),
      cloudPhotos: new Map([['p1', { fileId: 'file-p1' }], ['gone', { fileId: 'file-gone' }]]),
      state: await readSyncState(), cloudNow: CLOUD_NOW,
    });

    expect(drive.trashed).toEqual(['file-gone']);
    expect(result.trashed).toBe(1);
    expect((await readSyncState()).has('gone')).toBe(false);
  });

  it('從沒同步過、本機也沒有的雲端照片不會被誤刪（可能是別台剛上傳的）', async () => {
    await seedEntry([
      { photoUid: 'p1', width: 960, height: 640, blob: new Blob(['a'], { type: 'image/jpeg' }) },
    ]);

    const drive = fakeDrive();
    await syncPhotos({
      drive, folderId: 'folder-1',
      snapshot: await readLocalSnapshot(),
      cloudPhotos: new Map([['stranger', { fileId: 'file-stranger' }]]),
      state: await readSyncState(), cloudNow: CLOUD_NOW,
    });
    expect(drive.trashed).toEqual([]);
  });

  it('單張照片讀不出來 → 跳過、記為失敗、其他照片照常處理', async () => {
    const { report } = await seedEntry([
      { photoUid: 'bad', width: 960, height: 640, type: 'image/jpeg' },
      { photoUid: 'good', width: 960, height: 640, type: 'image/jpeg' },
    ]);

    const drive = fakeDrive({ downloads: { 'file-bad': 'broken' } });
    const result = await syncPhotos({
      drive, folderId: 'folder-1',
      snapshot: await readLocalSnapshot(),
      cloudPhotos: new Map([['bad', { fileId: 'file-bad' }], ['good', { fileId: 'file-good' }]]),
      state: await readSyncState(), cloudNow: CLOUD_NOW,
    });

    expect(result.failed).toBe(1);
    expect(result.downloaded).toBe(1);
    const photos = (await listHighlightEntriesForReport(report.id))[0].photos;
    expect(photos.find(p => p.photoUid === 'good').blob).toBeTruthy();
  });
});
```

> fake-indexeddb 無法原樣還原真實 `Blob`（讀回來是普通物件），所以上面只斷言 `toBeTruthy()`，不斷言 `instanceof Blob`。真實瀏覽器的驗證放在 Task 18。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/photoSync.test.js`
Expected: FAIL — 找不到 `src/sync/photoSync.js`。

- [ ] **Step 3: 實作**

```js
// src/sync/photoSync.js
import { runRequest } from '../storage/dbCore.js';
import { writeSyncState, deleteSyncState } from '../storage/syncStateDb.js';
import { mapWithConcurrency, MAX_CONCURRENCY } from './driveClient.js';
import { PHOTO_STORE } from './syncStores.js';

// A photo's sync state lives in the syncState store keyed by photoUid, never as a flag on the
// record itself. Writing "synced: true" back onto the 點滴分享 entry would bump its updatedAt and
// make the record look locally edited, which would bounce it back up as a fake change on every
// single sync.
function collectLocalPhotos(snapshot) {
  const descriptors = new Map();
  for (const entry of snapshot.records.values()) {
    if (entry.store !== PHOTO_STORE) continue;
    for (const photo of entry.record.photos || []) {
      if (photo && photo.photoUid) descriptors.set(photo.photoUid, { entry, photo });
    }
  }
  return descriptors;
}

async function attachDownloadedPhoto(entry, photoUid, blob) {
  const stored = await runRequest(entry.store, 'readonly', store => store.get(entry.id));
  if (!stored) return;
  const photos = (stored.photos || []).map(photo =>
    photo.photoUid === photoUid ? { ...photo, blob } : photo
  );
  // Raw put, not putRecord: filling in bytes the cloud already has is not a local edit, and
  // bumping updatedAt here would schedule a pointless re-upload of the whole record.
  await runRequest(entry.store, 'readwrite', store => store.put({ ...stored, photos, id: entry.id }));
  entry.record.photos = photos;
}

export async function syncPhotos({ drive, folderId, snapshot, cloudPhotos, state, cloudNow }) {
  const localPhotos = collectLocalPhotos(snapshot);

  const toUpload = [];
  const toDownload = [];
  for (const [photoUid, { entry, photo }] of localPhotos) {
    if (photo.blob && !state.has(photoUid)) {
      toUpload.push({ photoUid, blob: photo.blob });
    } else if (!photo.blob && cloudPhotos.has(photoUid)) {
      // Descriptor without bytes: this record arrived from the cloud and its photo has not been
      // fetched yet. Each photo is its own file, so an interrupted first sync resumes here.
      toDownload.push({ photoUid, entry, fileId: cloudPhotos.get(photoUid).fileId });
    }
  }

  // Only photos this device has synced before are candidates for deletion. A cloud photo we have
  // never seen is another device's brand-new upload, not a leftover — trashing it would be the
  // "刪了又跑出來" bug in reverse.
  const toTrash = [];
  for (const [photoUid, cloudPhoto] of cloudPhotos) {
    if (!localPhotos.has(photoUid) && state.has(photoUid)) {
      toTrash.push({ photoUid, fileId: cloudPhoto.fileId });
    }
  }

  const uploads = await mapWithConcurrency(toUpload, MAX_CONCURRENCY, async ({ photoUid, blob }) => {
    const { fileId } = await drive.uploadPhoto(folderId, { photoUid, blob });
    await writeSyncState({ uid: photoUid, store: 'photo', hash: null, fileId, syncedAt: cloudNow });
  });

  const downloads = await mapWithConcurrency(toDownload, MAX_CONCURRENCY, async ({ photoUid, entry, fileId }) => {
    const blob = await drive.downloadPhoto(fileId);
    await attachDownloadedPhoto(entry, photoUid, blob);
    await writeSyncState({ uid: photoUid, store: 'photo', hash: null, fileId, syncedAt: cloudNow });
  });

  const trashes = await mapWithConcurrency(toTrash, MAX_CONCURRENCY, async ({ photoUid, fileId }) => {
    await drive.trashFile(fileId);
    await deleteSyncState(photoUid);
  });

  const all = [...uploads, ...downloads, ...trashes];
  return {
    uploaded: uploads.filter(r => r.ok).length,
    downloaded: downloads.filter(r => r.ok).length,
    trashed: trashes.filter(r => r.ok).length,
    failed: all.filter(r => !r.ok).length,
  };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/photoSync.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sync/photoSync.js tests/photoSync.test.js
git commit -m "$(cat <<'EOF'
feat: sync 點滴分享 photos as individual Drive files

Photo sync state lives in syncState keyed by photoUid, so marking a photo
synced never mutates the record and never triggers a fake re-upload.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: 同步引擎（編排 + debounce + 觸發）

**Files:**
- Create: `src/sync/syncEngine.js`
- Test: Create `tests/syncEngine.test.js`

**Interfaces:**
- Consumes: Task 4／5／6／7／8／9／11／12 的全部輸出。
- Produces: `createSyncEngine({ drive, resolveConflicts, onStatus, debounceMs = 2000 })` → 物件：
  - `runSync()` → `Promise<status>`；跑完整流程，同一時間只會有一個在跑。
  - `scheduleSync()` → 節流後呼叫 `runSync`（`setWriteListener` 直接接這個）。
  - `getStatus()` → `{ phase, textSyncedAt, photoSyncedAt, photoPending, needsReview, error }`
    - `phase`：`'idle'`｜`'syncing'`｜`'done'`｜`'auth'`｜`'format'`｜`'error'`
    - `error`：`null`｜`'AUTH_EXPIRED'`｜`'FORMAT'`｜`'NETWORK'`
  - `resolveConflicts(conflicts)` 由呼叫端提供：吃 `Array<{ uid, store, fields, localPayload, cloudPayload }>`，回 `Promise<Array<{ uid, choice }>>`，`choice` 為 `'local'`｜`'cloud'`｜`'both'`。

- [ ] **Step 1: 先寫會失敗的測試**

```js
// tests/syncEngine.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSyncEngine } from '../src/sync/syncEngine.js';
import { readSyncState } from '../src/storage/syncStateDb.js';
import { addChild, listChildren, deleteChild, clearAllData } from '../src/storage/db.js';
import { runRequest, putRecord } from '../src/storage/dbCore.js';
import { AuthExpiredError, DriveFormatError } from '../src/sync/driveClient.js';

const CLOUD_NOW = 'Sat, 13 Sep 2026 06:32:00 GMT';

// An in-memory stand-in for the whole Drive folder.
function fakeDrive(initial = {}) {
  const files = new Map(Object.entries(initial.records || {})); // fileId -> { uid, store, hash, payload }
  let nextId = 1;
  return {
    files,
    ensureFolder: async () => 'folder-1',
    listCloud: async () => ({
      records: new Map([...files].map(([fileId, f]) => [f.uid, { store: f.store, hash: f.hash, fileId }])),
      photos: new Map(),
      cloudNow: CLOUD_NOW,
    }),
    uploadRecord: async (folderId, { uid, store, hash, payload, fileId }) => {
      const id = fileId || `file-${nextId++}`;
      files.set(id, { uid, store, hash, payload });
      return { fileId: id };
    },
    downloadRecord: async fileId => files.get(fileId).payload,
    uploadPhoto: async () => ({ fileId: `file-photo-${nextId++}` }),
    downloadPhoto: async () => new Blob(['x'], { type: 'image/jpeg' }),
    trashFile: async fileId => { files.delete(fileId); },
  };
}

async function reset() {
  await clearAllData();
  await runRequest('syncState', 'readwrite', store => store.clear());
  await runRequest('tombstones', 'readwrite', store => store.clear());
}

describe('runSync', () => {
  beforeEach(reset);

  it('第一次同步把本機記錄全部上傳，並記下同步基準', async () => {
    const child = await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const drive = fakeDrive();
    const engine = createSyncEngine({ drive, resolveConflicts: async () => [] });

    const status = await engine.runSync();

    expect([...drive.files.values()].map(f => f.payload.name)).toEqual(['測試童']);
    expect(status.phase).toBe('done');
    expect(new Date(status.textSyncedAt).toISOString()).toBe('2026-09-13T06:32:00.000Z');
    expect((await readSyncState()).get(child.uid)).toMatchObject({ store: 'children' });
  });

  it('雲端獨有的記錄直接下載補齊', async () => {
    const drive = fakeDrive({
      records: {
        'file-a': {
          uid: 'cloud-child', store: 'children', hash: 'h1',
          payload: { uid: 'cloud-child', name: '雲端童', birthDate: '2024-02-02', updatedAt: '2026-09-12T00:00:00.000Z' },
        },
      },
    });
    const engine = createSyncEngine({ drive, resolveConflicts: async () => [] });
    await engine.runSync();

    expect((await listChildren()).map(c => c.name)).toEqual(['雲端童']);
  });

  it('已同步過的記錄沒改動時不重傳', async () => {
    await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const drive = fakeDrive();
    const engine = createSyncEngine({ drive, resolveConflicts: async () => [] });
    await engine.runSync();

    const uploadSpy = vi.spyOn(drive, 'uploadRecord');
    await engine.runSync();
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('本機刪除會把雲端那份丟進垃圾桶', async () => {
    const child = await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const drive = fakeDrive();
    const engine = createSyncEngine({ drive, resolveConflicts: async () => [] });
    await engine.runSync();
    expect(drive.files.size).toBe(1);

    await deleteChild(child.id);
    await engine.runSync();

    expect(drive.files.size).toBe(0);
    expect(await runRequest('tombstones', 'readonly', store => store.getAll())).toEqual([]);
  });

  it('雲端刪除會同步刪掉本機那份', async () => {
    await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const drive = fakeDrive();
    const engine = createSyncEngine({ drive, resolveConflicts: async () => [] });
    await engine.runSync();

    drive.files.clear();
    await engine.runSync();

    expect(await listChildren()).toEqual([]);
  });

  it('兩邊改了不同欄位時自動合併，不問使用者', async () => {
    const child = await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const drive = fakeDrive();
    const engine = createSyncEngine({
      drive,
      resolveConflicts: async () => { throw new Error('不該問使用者'); },
    });
    await engine.runSync();

    // 雲端改生日、本機改名字。
    const [fileId, file] = [...drive.files][0];
    drive.files.set(fileId, {
      ...file, hash: 'changed',
      payload: { ...file.payload, birthDate: '2024-03-03', updatedAt: '2026-09-13T07:00:00.000Z' },
    });
    await putRecord('children', { ...child, name: '改名' });

    await engine.runSync();

    const stored = (await listChildren())[0];
    expect(stored.name).toBe('改名');
    expect(stored.birthDate).toBe('2024-03-03');
  });

  it('兩邊改了同一個欄位時詢問使用者，選「保留雲端」就採雲端值', async () => {
    const child = await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const drive = fakeDrive();
    const asked = [];
    const engine = createSyncEngine({
      drive,
      resolveConflicts: async conflicts => {
        asked.push(...conflicts);
        return conflicts.map(c => ({ uid: c.uid, choice: 'cloud' }));
      },
    });
    await engine.runSync();

    const [fileId, file] = [...drive.files][0];
    drive.files.set(fileId, {
      ...file, hash: 'changed',
      payload: { ...file.payload, name: '雲端改的', updatedAt: '2026-09-13T07:00:00.000Z' },
    });
    await putRecord('children', { ...child, name: '本機改的' });

    await engine.runSync();

    expect(asked).toHaveLength(1);
    expect(asked[0].fields).toEqual([{ field: 'name', local: '本機改的', cloud: '雲端改的' }]);
    expect((await listChildren())[0].name).toBe('雲端改的');
  });

  it('選「都保留」會變成兩筆並標記待確認', async () => {
    const child = await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const drive = fakeDrive();
    const engine = createSyncEngine({
      drive,
      resolveConflicts: async conflicts => conflicts.map(c => ({ uid: c.uid, choice: 'both' })),
    });
    await engine.runSync();

    const [fileId, file] = [...drive.files][0];
    drive.files.set(fileId, {
      ...file, hash: 'changed',
      payload: { ...file.payload, name: '雲端改的', updatedAt: '2026-09-13T07:00:00.000Z' },
    });
    await putRecord('children', { ...child, name: '本機改的' });

    const status = await engine.runSync();

    const children = await listChildren();
    expect(children.map(c => c.name).sort()).toEqual(['本機改的', '雲端改的']);
    expect(children.every(c => c.needsReview === true)).toBe(true);
    expect(status.needsReview).toBe(2);
  });

  it('登入失效時停下來並回報 auth 狀態', async () => {
    await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const drive = fakeDrive();
    drive.ensureFolder = async () => { throw new AuthExpiredError('AUTH_EXPIRED'); };

    const engine = createSyncEngine({ drive, resolveConflicts: async () => [] });
    const status = await engine.runSync();

    expect(status.phase).toBe('auth');
    expect(status.error).toBe('AUTH_EXPIRED');
  });

  it('雲端資料夾格式壞掉時整個停止，不寫入任何東西', async () => {
    await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const drive = fakeDrive();
    drive.ensureFolder = async () => { throw new DriveFormatError('MANIFEST_MISSING'); };

    const engine = createSyncEngine({ drive, resolveConflicts: async () => [] });
    const status = await engine.runSync();

    expect(status.phase).toBe('format');
    expect(drive.files.size).toBe(0);
    expect((await readSyncState()).size).toBe(0);
  });

  it('連續存檔只會觸發一次同步（debounce）', async () => {
    await addChild({ name: '測試童', birthDate: '2024-01-01' });
    const drive = fakeDrive();
    const engine = createSyncEngine({ drive, resolveConflicts: async () => [], debounceMs: 10 });
    const spy = vi.spyOn(drive, 'listCloud');

    engine.scheduleSync();
    engine.scheduleSync();
    engine.scheduleSync();
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1), { timeout: 500 });
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/syncEngine.test.js`
Expected: FAIL — 找不到 `src/sync/syncEngine.js`。

- [ ] **Step 3: 實作**

```js
// src/sync/syncEngine.js
import { newUid, runRequest, putRecord } from '../storage/dbCore.js';
import {
  readSyncState, writeSyncState, deleteSyncState,
  listTombstones, deleteTombstone, purgeExpiredTombstones,
} from '../storage/syncStateDb.js';
import { readLocalSnapshot, applyRemoteRecord, deleteLocalByUid, adoptUid } from './localSnapshot.js';
import { SYNC_STORES, hashPayload, PHOTO_STORE } from './syncStores.js';
import { planSync } from './diff.js';
import { mergeFields } from './fieldMerge.js';
import { reconcileByNaturalKey } from './reconcile.js';
import { mapWithConcurrency, MAX_CONCURRENCY, AuthExpiredError, DriveFormatError } from './driveClient.js';
import { syncPhotos } from './photoSync.js';

const STORE_ORDER = new Map(SYNC_STORES.map((spec, index) => [spec.store, index]));

function byDependencyOrder(a, b) {
  return STORE_ORDER.get(a.store) - STORE_ORDER.get(b.store);
}

export function createSyncEngine({ drive, resolveConflicts, onStatus = () => {}, debounceMs = 2000 }) {
  let status = {
    phase: 'idle', textSyncedAt: null, photoSyncedAt: null, photoPending: 0, needsReview: 0, error: null,
  };
  let running = null;
  let debounceTimer = null;

  function setStatus(changes) {
    status = { ...status, ...changes };
    onStatus(status);
    return status;
  }

  // The payload itself, not just its hash, is the base of the next three-way merge: without it
  // there is no way to tell "only the cloud changed this field" from a real disagreement.
  async function persistBase(uid, store, payload, fileId, cloudNow) {
    await writeSyncState({
      uid, store, hash: await hashPayload(payload), base: payload, fileId, syncedAt: cloudNow,
    });
  }

  // 都保留 = two records, both flagged so the teacher can sort them out later. The design is
  // explicit that the system must not guess a combined result.
  async function keepBoth(uid, store, cloudPayload, snapshot) {
    const localEntry = snapshot.records.get(uid);
    if (localEntry) {
      const stored = await runRequest(store, 'readonly', objectStore => objectStore.get(localEntry.id));
      if (stored) await putRecord(store, { ...stored, needsReview: true });
    }
    const freshUid = newUid();
    await applyRemoteRecord(
      { store, uid: freshUid, payload: { ...cloudPayload, uid: freshUid, needsReview: true } },
      snapshot
    );
  }

  async function runOnce() {
    setStatus({ phase: 'syncing', error: null });

    const folderId = await drive.ensureFolder();
    await purgeExpiredTombstones(Date.now());

    let snapshot = await readLocalSnapshot();
    let state = await readSyncState();
    const { records: cloudRecords, photos: cloudPhotos, cloudNow } = await drive.listCloud(folderId);

    // First sign-in on this device: no base for anything, so uids invented independently on each
    // side have to be matched up by natural key first or the sync duplicates the whole dataset.
    const recordState = new Map([...state].filter(([, row]) => row.store !== 'photo'));
    if (recordState.size === 0 && snapshot.records.size > 0 && cloudRecords.size > 0) {
      const cloudPayloads = new Map();
      await mapWithConcurrency([...cloudRecords], MAX_CONCURRENCY, async ([uid, cloudEntry]) => {
        cloudPayloads.set(uid, {
          store: cloudEntry.store, payload: await drive.downloadRecord(cloudEntry.fileId),
        });
      });

      const { adopt } = reconcileByNaturalKey({
        localRecords: new Map([...snapshot.records].map(([uid, e]) => [uid, { store: e.store, payload: e.payload }])),
        cloudRecords: cloudPayloads,
      });
      for (const [localUid, cloudUid] of adopt) {
        const entry = snapshot.records.get(localUid);
        if (entry) await adoptUid(entry.store, entry.id, cloudUid, snapshot);
      }
      // Adoption rewrote uids, so the payloads and indexes have to be rebuilt before diffing.
      if (adopt.size > 0) snapshot = await readLocalSnapshot();
    }

    const plan = planSync({
      local: snapshot.records, cloud: cloudRecords, state, tombstones: await listTombstones(),
    });

    // --- downloads (cloud-only or cloud-newer) ---
    const downloadTargets = plan.downloads.map(uid => ({ uid, ...cloudRecords.get(uid) }));
    const fetched = await mapWithConcurrency(downloadTargets, MAX_CONCURRENCY, async target => ({
      ...target, payload: await drive.downloadRecord(target.fileId),
    }));

    // Applied in dependency order, then retried once, because a record whose parent arrives later
    // in the same batch defers rather than writing a dangling reference.
    let pendingApply = fetched.filter(r => r.ok).map(r => r.value).sort(byDependencyOrder);
    for (let pass = 0; pass < 2 && pendingApply.length > 0; pass += 1) {
      const deferred = [];
      for (const item of pendingApply) {
        const outcome = await applyRemoteRecord(
          { store: item.store, uid: item.uid, payload: item.payload }, snapshot
        );
        if (outcome === 'deferred') deferred.push(item);
        else await persistBase(item.uid, item.store, item.payload, item.fileId, cloudNow);
      }
      pendingApply = deferred;
    }

    // --- merges (both sides changed since the last agreed base) ---
    const mergeTargets = plan.merges.map(uid => ({ uid, ...cloudRecords.get(uid) }));
    const mergeFetched = await mapWithConcurrency(mergeTargets, MAX_CONCURRENCY, async target => ({
      ...target, payload: await drive.downloadRecord(target.fileId),
    }));

    const conflicts = [];
    const autoMerged = [];
    for (const result of mergeFetched) {
      if (!result.ok) continue;
      const { uid, store, fileId, payload: cloudPayload } = result.value;
      const localEntry = snapshot.records.get(uid);
      if (!localEntry) continue;
      const stateRow = state.get(uid);
      const base = stateRow ? stateRow.base || null : null;
      const { merged, conflicts: clashes } = mergeFields(base, localEntry.payload, cloudPayload, {
        unionArrayFields: store === PHOTO_STORE ? ['photos'] : [],
      });
      if (clashes.length === 0) {
        autoMerged.push({ uid, store, fileId, merged });
      } else {
        conflicts.push({
          uid, store, fileId, fields: clashes, localPayload: localEntry.payload, cloudPayload,
        });
      }
    }

    for (const item of autoMerged.sort(byDependencyOrder)) {
      await applyRemoteRecord({ store: item.store, uid: item.uid, payload: item.merged }, snapshot);
    }

    if (conflicts.length > 0) {
      const answers = await resolveConflicts(conflicts.map(c => ({
        uid: c.uid, store: c.store, fields: c.fields, localPayload: c.localPayload, cloudPayload: c.cloudPayload,
      })));
      const choices = new Map(answers.map(answer => [answer.uid, answer.choice]));
      for (const conflict of conflicts.sort(byDependencyOrder)) {
        const choice = choices.get(conflict.uid) || 'local';
        if (choice === 'cloud') {
          await applyRemoteRecord(
            { store: conflict.store, uid: conflict.uid, payload: conflict.cloudPayload }, snapshot
          );
        } else if (choice === 'both') {
          await keepBoth(conflict.uid, conflict.store, conflict.cloudPayload, snapshot);
        }
        // 'local' needs no local write; the upload pass below pushes it to the cloud.
      }
      snapshot = await readLocalSnapshot();
    }

    // --- uploads (local-only, local-newer, and everything a merge/conflict just settled) ---
    const settledUids = [...autoMerged, ...conflicts].map(item => item.uid);
    const uploadUids = new Set([...plan.creates, ...plan.uploads, ...settledUids]);
    // 都保留 minted brand-new uids; they are in neither the plan nor the state, so pick them up
    // by scanning for records the cloud has never seen.
    for (const [uid] of snapshot.records) {
      if (!state.has(uid) && !cloudRecords.has(uid)) uploadUids.add(uid);
    }

    const uploadTargets = [...uploadUids]
      .map(uid => {
        const entry = snapshot.records.get(uid);
        if (!entry) return null;
        const known = state.get(uid) || cloudRecords.get(uid);
        return { uid, store: entry.store, payload: entry.payload, fileId: known && known.fileId };
      })
      .filter(Boolean);

    const uploaded = await mapWithConcurrency(uploadTargets, MAX_CONCURRENCY, async target => {
      const hash = await hashPayload(target.payload);
      const { fileId } = await drive.uploadRecord(folderId, {
        uid: target.uid, store: target.store, hash, payload: target.payload, fileId: target.fileId,
      });
      await persistBase(target.uid, target.store, target.payload, fileId, cloudNow);
    });

    // --- deletes both ways ---
    await mapWithConcurrency(plan.trashes, MAX_CONCURRENCY, async ({ uid, fileId }) => {
      await drive.trashFile(fileId);
      await deleteSyncState(uid);
      await deleteTombstone(uid);
    });
    // A tombstone whose cloud file is already gone has done its job.
    for (const tombstone of await listTombstones()) {
      if (!cloudRecords.has(tombstone.uid)) await deleteTombstone(tombstone.uid);
    }

    for (const uid of plan.localDeletes) {
      const entry = snapshot.records.get(uid);
      if (entry) await deleteLocalByUid(entry.store, uid, snapshot);
      await deleteSyncState(uid);
    }

    // Records already identical on both sides still need a base row, or the next sync with a
    // one-sided edit would see "no base" and escalate it to a conflict.
    for (const uid of plan.upToDate) {
      const stateRow = state.get(uid);
      if (stateRow && stateRow.base) continue;
      const entry = snapshot.records.get(uid);
      const cloudEntry = cloudRecords.get(uid);
      if (entry && cloudEntry) await persistBase(uid, entry.store, entry.payload, cloudEntry.fileId, cloudNow);
    }

    // --- photos ---
    state = await readSyncState();
    snapshot = await readLocalSnapshot();
    const photoResult = await syncPhotos({ drive, folderId, snapshot, cloudPhotos, state, cloudNow });

    const needsReview = [...snapshot.records.values()].filter(entry => entry.record.needsReview).length;
    const textFailed = [...fetched, ...mergeFetched, ...uploaded].some(result => !result.ok);

    return setStatus({
      phase: 'done',
      textSyncedAt: textFailed ? status.textSyncedAt : cloudNow,
      photoSyncedAt: photoResult.failed > 0 ? status.photoSyncedAt : cloudNow,
      photoPending: photoResult.failed,
      needsReview,
      error: textFailed ? 'NETWORK' : null,
    });
  }

  async function runSync() {
    // Overlapping syncs would read a snapshot the other one is midway through changing, so a
    // second call just waits for the one in flight.
    if (running) return running;
    running = (async () => {
      try {
        return await runOnce();
      } catch (err) {
        if (err instanceof AuthExpiredError) return setStatus({ phase: 'auth', error: 'AUTH_EXPIRED' });
        if (err instanceof DriveFormatError) return setStatus({ phase: 'format', error: 'FORMAT' });
        return setStatus({ phase: 'error', error: 'NETWORK' });
      } finally {
        running = null;
      }
    })();
    return running;
  }

  // Every keystroke-driven save would otherwise be its own round trip.
  function scheduleSync() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      runSync();
    }, debounceMs);
  }

  return { runSync, scheduleSync, getStatus: () => status };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/syncEngine.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sync/syncEngine.js tests/syncEngine.test.js
git commit -m "$(cat <<'EOF'
feat: add sync engine orchestrating diff, merge, transfer and deletes

Stores the last-agreed payload as a merge base, so different-field edits on two
devices merge silently and only same-field clashes reach the teacher.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: 登入選擇畫面

**Files:**
- Create: `src/ui/signInChoiceView.js`
- Modify: `src/styles.css`（附加樣式）
- Test: Create `tests/signInChoiceView.test.js`

**Interfaces:**
- Consumes: Task 10 的 `readSyncMode`／`writeSyncMode`／`isOffline`。
- Produces:
  - `needsSignInChoice()` → boolean（`readSyncMode() === null`）
  - `renderSignInChoiceView(container, { onGoogle, onGuest })` → 畫出兩個按鈕；按「使用 Google 登入」呼叫 `onGoogle()`，離線時改在畫面上顯示「目前離線，暫時無法登入」且**不**呼叫 `onGoogle`；按「以訪客身份繼續」寫入 `'guest'` 後呼叫 `onGuest()`。`onGoogle` 失敗時顯示「登入失敗，請再試一次」並留在此畫面。

- [ ] **Step 1: 先寫會失敗的測試**

```js
// tests/signInChoiceView.test.js
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
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/signInChoiceView.test.js`
Expected: FAIL — 找不到 `src/ui/signInChoiceView.js`。

- [ ] **Step 3: 實作**

```js
// src/ui/signInChoiceView.js
import { readSyncMode, writeSyncMode, isOffline } from '../sync/googleAuth.js';

export function needsSignInChoice() {
  return readSyncMode() === null;
}

// Shown once, right after the password gate, and never again — the answer is remembered in
// localStorage. Guest is a first-class choice here, not a fallback: the app has always worked
// offline with manual backups and must keep doing so.
export function renderSignInChoiceView(container, { onGoogle, onGuest }) {
  container.innerHTML = `
    <div class="sign-in-choice">
      <h2 class="sign-in-choice__title">要讓資料在裝置之間自動同步嗎？</h2>
      <p class="sign-in-choice__hint">登入 Google 帳號後，這台裝置的資料會自動跟你其他裝置同步，不用再手動匯出匯入。</p>
      <button type="button" class="btn btn--primary" data-action="sign-in-google">使用 Google 登入</button>
      <button type="button" class="btn btn--outline" data-action="continue-guest">以訪客身份繼續</button>
      <p class="field-error" data-error></p>
    </div>
  `;

  const googleButton = container.querySelector('[data-action="sign-in-google"]');
  const errorEl = container.querySelector('[data-error]');

  googleButton.addEventListener('click', async () => {
    if (isOffline()) {
      errorEl.textContent = '目前離線，暫時無法登入';
      return;
    }
    errorEl.textContent = '';
    googleButton.disabled = true;
    try {
      await onGoogle();
    } catch (err) {
      errorEl.textContent = '登入失敗，請再試一次';
    } finally {
      googleButton.disabled = false;
    }
  });

  container.querySelector('[data-action="continue-guest"]').addEventListener('click', () => {
    writeSyncMode('guest');
    onGuest();
  });
}
```

- [ ] **Step 4: 加上樣式**

在 `src/styles.css` 最後加上：

```css
.sign-in-choice {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 26rem;
  margin: 3rem auto;
  text-align: center;
}

.sign-in-choice__hint {
  color: #555;
  font-size: 0.9rem;
  line-height: 1.6;
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run tests/signInChoiceView.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui/signInChoiceView.js src/styles.css tests/signInChoiceView.test.js
git commit -m "$(cat <<'EOF'
feat: add one-time Google/guest sign-in choice screen

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: 標題列問候語與同步狀態

**Files:**
- Create: `src/ui/syncHeader.js`
- Modify: `src/styles.css`（附加樣式）
- Test: Create `tests/syncHeader.test.js`

**Interfaces:**
- Consumes: Task 10 的 `isOffline`；既有的 `src/ui/escapeHtml.js`。
- Produces:
  - `greetingFor(date)` → `'早安'`｜`'午安'`｜`'晚安'`（純函式）
  - `formatSyncStatus(status)` → 字串（純函式），吃 Task 13 的 status 物件：
    - `error: 'AUTH_EXPIRED'` → `'登入已失效，請重新登入'`
    - `error: 'FORMAT'` → `'雲端資料夾異常，已停止同步'`
    - `phase: 'syncing'` → `'同步中…'`
    - `photoPending > 0` → `'文字資料：HH:MM　照片：同步失敗，還有 N 張未上傳'`
    - `error: 'NETWORK'` → `'同步失敗，稍後會自動重試'`
    - 其他有 `textSyncedAt` → `'上次同步：HH:MM'`；都沒有 → `''`
  - `renderSyncHeader(slot, { mode, name, status, onSignIn, onSignOut, now })` → 依模式畫出內容並回傳 `{ update(nextStatus) }`。
    - `mode: 'google'` → `「${greetingFor(now())}，${name}」` + 同步狀態文字 + 「登出」。
    - `mode: 'guest'` → 「使用 Google 登入」按鈕；離線點擊顯示「目前離線，暫時無法登入」。
    - `error` 是 `AUTH_EXPIRED`／`FORMAT` 時狀態文字帶 `data-persistent="true"`，**不自動消失**。

- [ ] **Step 1: 先寫會失敗的測試**

```js
// tests/syncHeader.test.js
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

  it('照片同步失敗時拆開顯示，不用一個時間誤導使用者', () => {
    const text = formatSyncStatus({ ...base, photoPending: 3, photoSyncedAt: null });
    expect(text).toContain('文字資料：');
    expect(text).toContain('照片：同步失敗，還有 3 張未上傳');
  });

  it('同步中', () => {
    expect(formatSyncStatus({ ...base, phase: 'syncing' })).toBe('同步中…');
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
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/syncHeader.test.js`
Expected: FAIL — 找不到 `src/ui/syncHeader.js`。

- [ ] **Step 3: 實作**

```js
// src/ui/syncHeader.js
import { isOffline } from '../sync/googleAuth.js';
import { escapeHtml } from './escapeHtml.js';

export function greetingFor(date) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return '早安';
  if (hour >= 12 && hour < 18) return '午安';
  return '晚安';
}

// The clock time comes from the *cloud's* timestamp, not Date.now(): a device whose clock has
// drifted would otherwise print a sync time that never happened.
function clockTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatSyncStatus(status) {
  if (status.error === 'AUTH_EXPIRED') return '登入已失效，請重新登入';
  if (status.error === 'FORMAT') return '雲端資料夾異常，已停止同步';
  if (status.phase === 'syncing') return '同步中…';
  // A single rolled-up time would claim the photos made it too. Splitting them is the difference
  // between an honest status and one that quietly loses a teacher's photos.
  if (status.photoPending > 0) {
    return `文字資料：${clockTime(status.textSyncedAt)}　照片：同步失敗，還有 ${status.photoPending} 張未上傳`;
  }
  if (status.error === 'NETWORK') return '同步失敗，稍後會自動重試';
  if (status.textSyncedAt) return `上次同步：${clockTime(status.textSyncedAt)}`;
  return '';
}

const PERSISTENT_ERRORS = new Set(['AUTH_EXPIRED', 'FORMAT']);

export function renderSyncHeader(slot, { mode, name, status, onSignIn, onSignOut, now = () => new Date() }) {
  if (mode === 'google') {
    slot.innerHTML = `
      <span class="sync-header__greeting" data-sync-greeting>${escapeHtml(`${greetingFor(now())}，${name}`)}</span>
      <span class="sync-header__status" data-sync-status></span>
      <button type="button" class="btn btn--header btn--ghost" data-action="sync-sign-out">登出</button>
    `;
    slot.querySelector('[data-action="sync-sign-out"]').addEventListener('click', onSignOut);
  } else {
    slot.innerHTML = `
      <button type="button" class="btn btn--header" data-action="sync-sign-in">使用 Google 登入</button>
      <span class="sync-header__status" data-sync-status></span>
    `;
    slot.querySelector('[data-action="sync-sign-in"]').addEventListener('click', async () => {
      const el = slot.querySelector('[data-sync-status]');
      if (isOffline()) {
        el.textContent = '目前離線，暫時無法登入';
        return;
      }
      el.textContent = '';
      await onSignIn();
    });
  }

  const statusEl = slot.querySelector('[data-sync-status]');

  function update(nextStatus) {
    statusEl.textContent = formatSyncStatus(nextStatus);
    // Marked so styles.css can render it as a standing warning rather than something that fades;
    // an expired login is only fixable by the teacher and must not disappear on its own.
    if (PERSISTENT_ERRORS.has(nextStatus.error)) statusEl.dataset.persistent = 'true';
    else delete statusEl.dataset.persistent;
  }

  update(status);
  return { update };
}
```

- [ ] **Step 4: 加上樣式**

`src/styles.css` 最後加上：

```css
.sync-header__greeting {
  font-size: 0.9rem;
  white-space: nowrap;
}

.sync-header__status {
  font-size: 0.8rem;
  color: #eaf2fb;
}

.sync-header__status[data-persistent='true'] {
  background: #ffe8e6;
  color: #a32015;
  border-radius: 0.3rem;
  padding: 0.15rem 0.4rem;
  font-weight: 600;
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run tests/syncHeader.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui/syncHeader.js src/styles.css tests/syncHeader.test.js
git commit -m "$(cat <<'EOF'
feat: add header greeting and sync status display

Splits text vs photo status when photos partly fail, so one rolled-up time can
never imply photos were uploaded when they weren't.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: 衝突比較畫面

**Files:**
- Create: `src/ui/conflictResolveView.js`
- Modify: `src/styles.css`（附加樣式）
- Test: Create `tests/conflictResolveView.test.js`

**Interfaces:**
- Consumes: 既有的 `src/ui/escapeHtml.js`。
- Produces: `renderConflictResolveView(container, { conflicts })` → `Promise<Array<{ uid, choice }>>`
  - 吃 Task 13 傳來的 `Array<{ uid, store, fields, localPayload, cloudPayload }>`，`fields` 是 `Array<{ field, local, cloud }>`。
  - 每筆衝突顯示資料表的中文標題、每個衝突欄位的兩邊值，三個按鈕：保留這台裝置的／保留雲端的／都保留。
  - 全部選完（每筆都有選擇）「完成」才可按，按下後 resolve；未選到的預設 `'local'`。

- [ ] **Step 1: 先寫會失敗的測試**

```js
// tests/conflictResolveView.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { renderConflictResolveView } from '../src/ui/conflictResolveView.js';

describe('renderConflictResolveView', () => {
  let container;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  const conflicts = [
    {
      uid: 'u1', store: 'behaviorObservations',
      fields: [{ field: 'narrative', local: '本機寫的觀察', cloud: '雲端寫的觀察' }],
      localPayload: { title: '午睡' }, cloudPayload: { title: '午睡' },
    },
  ];

  it('顯示兩邊的內容與三個選項', () => {
    renderConflictResolveView(container, { conflicts });
    expect(container.textContent).toContain('本機寫的觀察');
    expect(container.textContent).toContain('雲端寫的觀察');
    expect(container.querySelector('[data-choice="local"][data-uid="u1"]').textContent).toContain('保留');
    expect(container.querySelector('[data-choice="cloud"][data-uid="u1"]')).toBeTruthy();
    expect(container.querySelector('[data-choice="both"][data-uid="u1"]')).toBeTruthy();
  });

  it('資料表與欄位名稱用中文顯示', () => {
    renderConflictResolveView(container, { conflicts });
    expect(container.textContent).toContain('行為觀察');
    expect(container.textContent).toContain('文字紀錄');
  });

  it('全部選完才回傳結果', async () => {
    const twoConflicts = [
      conflicts[0],
      {
        uid: 'u2', store: 'highlightEntries',
        fields: [{ field: 'caption', local: 'A', cloud: 'B' }],
        localPayload: {}, cloudPayload: {},
      },
    ];
    const pending = renderConflictResolveView(container, { conflicts: twoConflicts });

    container.querySelector('[data-choice="cloud"][data-uid="u1"]').click();
    expect(container.querySelector('[data-action="conflicts-done"]').disabled).toBe(true);

    container.querySelector('[data-choice="both"][data-uid="u2"]').click();
    container.querySelector('[data-action="conflicts-done"]').click();

    expect(await pending).toEqual([
      { uid: 'u1', choice: 'cloud' },
      { uid: 'u2', choice: 'both' },
    ]);
  });

  it('「都保留」的說明講清楚會變成兩筆', () => {
    renderConflictResolveView(container, { conflicts });
    expect(container.textContent).toContain('兩筆');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/conflictResolveView.test.js`
Expected: FAIL — 找不到 `src/ui/conflictResolveView.js`。

- [ ] **Step 3: 實作**

```js
// src/ui/conflictResolveView.js
import { escapeHtml } from './escapeHtml.js';

const STORE_LABELS = {
  children: '幼兒基本資料',
  forms: '適性總表',
  entries: '觀察紀錄',
  parentReports: '適性紀錄（家長版）',
  coursePlanEntries: '課程計畫',
  courseOccurrences: '課程出席紀錄',
  developmentRecordEntries: '適性發展紀錄',
  behaviorObservations: '行為觀察',
  highlightEntries: '點滴分享',
  monthlyCoursePlans: '月計畫',
  planSlots: '月計畫時段',
  planSlotItems: '月計畫活動',
  childItemOverrides: '月計畫個別調整',
};

const FIELD_LABELS = {
  name: '姓名', birthDate: '出生日期', tier: '月齡階段', period: '紀錄年月',
  indicatorCode: '指標代碼', activityName: '活動名稱', indicatorText: '指標內容',
  date: '日期', status: '狀態', note: '備註', narrative: '文字紀錄', domain: '領域',
  title: '標題', caption: '描述', photos: '照片', replacementText: '替代活動',
};

function valueText(value) {
  if (value === undefined || value === null || value === '') return '（空白）';
  if (Array.isArray(value)) return `${value.length} 項`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function conflictCard(conflict) {
  const rows = conflict.fields
    .map(
      field => `
        <div class="conflict-card__field">
          <span class="conflict-card__field-name">${escapeHtml(FIELD_LABELS[field.field] || field.field)}</span>
          <div class="conflict-card__side"><strong>這台裝置</strong><span>${escapeHtml(valueText(field.local))}</span></div>
          <div class="conflict-card__side"><strong>雲端</strong><span>${escapeHtml(valueText(field.cloud))}</span></div>
        </div>
      `
    )
    .join('');

  const uid = escapeHtml(conflict.uid);
  return `
    <div class="conflict-card" data-conflict="${uid}">
      <h3 class="conflict-card__title">${escapeHtml(STORE_LABELS[conflict.store] || conflict.store)}</h3>
      ${rows}
      <div class="conflict-card__actions">
        <button type="button" class="btn btn--outline btn--small" data-choice="local" data-uid="${uid}">保留這台裝置的</button>
        <button type="button" class="btn btn--outline btn--small" data-choice="cloud" data-uid="${uid}">保留雲端的</button>
        <button type="button" class="btn btn--outline btn--small" data-choice="both" data-uid="${uid}">都保留</button>
      </div>
    </div>
  `;
}

// Only reached for genuine same-field disagreements — everything else was merged without asking.
export function renderConflictResolveView(container, { conflicts }) {
  container.innerHTML = `
    <div class="conflict-view">
      <div class="page-header">
        <h2 class="page-header__title">有 ${conflicts.length} 筆資料兩邊都改過</h2>
      </div>
      <p class="conflict-view__hint">請選擇每一筆要保留哪一份。選「都保留」會變成兩筆記錄並標上「待確認」，讓你之後自己整理。</p>
      ${conflicts.map(conflictCard).join('')}
      <button type="button" class="btn btn--primary" data-action="conflicts-done" disabled>完成</button>
    </div>
  `;

  const choices = new Map();
  const doneButton = container.querySelector('[data-action="conflicts-done"]');

  for (const button of container.querySelectorAll('[data-choice]')) {
    button.addEventListener('click', () => {
      const { uid, choice } = button.dataset;
      choices.set(uid, choice);
      for (const sibling of container.querySelectorAll(`[data-uid="${uid}"]`)) {
        sibling.classList.toggle('btn--primary', sibling === button);
        sibling.classList.toggle('btn--outline', sibling !== button);
      }
      doneButton.disabled = choices.size !== conflicts.length;
    });
  }

  return new Promise(resolve => {
    doneButton.addEventListener('click', () => {
      resolve(conflicts.map(conflict => ({ uid: conflict.uid, choice: choices.get(conflict.uid) || 'local' })));
    });
  });
}
```

- [ ] **Step 4: 加上樣式**

`src/styles.css` 最後加上：

```css
.conflict-view__hint {
  color: #555;
  font-size: 0.9rem;
  line-height: 1.6;
  margin-bottom: 1rem;
}

.conflict-card {
  border: 1px solid #d8d8d2;
  border-radius: 0.4rem;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
}

.conflict-card__field {
  display: grid;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}

.conflict-card__field-name {
  font-weight: 600;
  font-size: 0.85rem;
}

.conflict-card__side {
  display: flex;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.conflict-card__side strong {
  flex: 0 0 5rem;
  color: #666;
  font-weight: 500;
}

.conflict-card__actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run tests/conflictResolveView.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui/conflictResolveView.js src/styles.css tests/conflictResolveView.test.js
git commit -m "$(cat <<'EOF'
feat: add conflict comparison screen with keep-local/cloud/both

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: 接線（gate hook、wireSyncControls、web 進入點）

**Files:**
- Modify: `src/app.js`（`mountApp` 的參數與檔尾解鎖分支）
- Create: `src/sync/wireSyncControls.js`
- Create: `src/webEntry.js`
- Test: Create `tests/wireSyncControls.test.js`；`tests/app.test.js` 加兩個 gate 測試（若檔案不存在就新建）

**Interfaces:**
- Consumes: Task 2 的 `setWriteListener`；Task 10 的 `createGoogleAuth`／`readSyncMode`／`readDisplayName`／`isOffline`；Task 11 的 `createDriveClient`；Task 13 的 `createSyncEngine`；Task 14／15／16 的三個畫面。
- Produces:
  - `mountApp(container, { onUnlock, gate } = {})` — `gate(container, { onDone })` 若提供，密碼過關後先跑它，`onDone()` 才進主畫面。沒提供就跟現在完全一樣。
  - `wireSyncControls({ clientId, syncSlot, createAuth, createDrive, createEngine })` → `{ gate }`；後三個參數有預設值，測試時可注入假的。
  - `src/webEntry.js` re-export `mountApp`／`wireBackupControls`／`wireSyncControls`。

- [ ] **Step 1: 先寫會失敗的測試**

```js
// tests/wireSyncControls.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { wireSyncControls } from '../src/sync/wireSyncControls.js';
import { writeSyncMode } from '../src/sync/googleAuth.js';

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

  beforeEach(() => {
    localStorage.clear();
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

  it('登出後標題列回到訪客模式，本機資料不動', async () => {
    writeSyncMode('google');
    localStorage.setItem('c-form-sync-name', '小美');
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
  });
});
```

`tests/app.test.js` 加上（若檔案不存在就新建，並 import `mountApp`、`unlock`、`vi`）：

```js
describe('mountApp 的 gate hook', () => {
  it('密碼過關後先跑 gate，gate 完成才進主畫面', async () => {
    await unlock('0975248749');
    const container = document.createElement('div');
    document.body.appendChild(container);

    let release;
    const gate = vi.fn((gateContainer, { onDone }) => {
      gateContainer.textContent = 'gate';
      release = onDone;
    });

    mountApp(container, { gate });
    await vi.waitFor(() => expect(gate).toHaveBeenCalled());
    expect(container.textContent).toBe('gate');

    release();
    await vi.waitFor(() => expect(container.textContent).not.toBe('gate'));
  });

  it('沒給 gate 時行為不變（離線版走這條路）', async () => {
    await unlock('0975248749');
    const container = document.createElement('div');
    document.body.appendChild(container);
    mountApp(container);
    await vi.waitFor(() => expect(container.textContent).not.toBe(''));
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/wireSyncControls.test.js tests/app.test.js`
Expected: FAIL — 找不到 `src/sync/wireSyncControls.js`、`mountApp` 不認得 `gate`。

- [ ] **Step 3: 在 `src/app.js` 加上 gate hook**

簽章改成：

```js
export function mountApp(container, { onUnlock, gate } = {}) {
```

把檔尾的 `handleUnlock` 與 `if (isUnlocked())` 整段換成：

```js
  // The hosted build passes a `gate` so the sign-in choice screen can run between the password
  // gate and the app. Kept as an injected hook rather than an import so the offline build's
  // bundle contains no login or sync code at all.
  function start() {
    if (gate) {
      gate(container, { onDone: showReportTypeSelect });
      return;
    }
    showReportTypeSelect();
  }

  function handleUnlock() {
    start();
    if (onUnlock) onUnlock();
  }

  if (isUnlocked()) {
    start();
  } else {
    renderPasswordGate(container, { onUnlock: handleUnlock });
  }
```

- [ ] **Step 4: 實作 `src/sync/wireSyncControls.js`**

```js
// src/sync/wireSyncControls.js
import { setWriteListener } from '../storage/dbCore.js';
import { createGoogleAuth, readSyncMode, readDisplayName, isOffline } from './googleAuth.js';
import { createDriveClient } from './driveClient.js';
import { createSyncEngine } from './syncEngine.js';
import { needsSignInChoice, renderSignInChoiceView } from '../ui/signInChoiceView.js';
import { renderSyncHeader } from '../ui/syncHeader.js';
import { renderConflictResolveView } from '../ui/conflictResolveView.js';

export function wireSyncControls({
  clientId,
  syncSlot,
  createAuth = config => createGoogleAuth(config),
  createDrive = config => createDriveClient(config),
  createEngine = config => createSyncEngine(config),
}) {
  const auth = createAuth({ clientId });
  const drive = createDrive({ auth });
  let header = null;
  let appContainer = null;
  let resumeApp = null;

  // The conflict screen takes over the app area, then hands it back. It is the only part of sync
  // allowed to interrupt the teacher, and only for genuine same-field disagreements.
  async function resolveConflicts(conflicts) {
    if (!appContainer) return conflicts.map(conflict => ({ uid: conflict.uid, choice: 'local' }));
    const choices = await renderConflictResolveView(appContainer, { conflicts });
    if (resumeApp) resumeApp();
    return choices;
  }

  const engine = createEngine({
    drive,
    resolveConflicts,
    onStatus: status => header && header.update(status),
  });

  function paintHeader(mode) {
    header = renderSyncHeader(syncSlot, {
      mode,
      name: readDisplayName(),
      status: engine.getStatus(),
      onSignIn: async () => {
        try {
          await auth.signIn();
          startSyncing();
        } catch (err) {
          if (err.message !== 'OFFLINE') header.update({ ...engine.getStatus(), error: 'NETWORK' });
        }
      },
      onSignOut: () => {
        auth.signOut();
        setWriteListener(null);
        paintHeader('guest');
      },
    });
  }

  function startSyncing() {
    paintHeader('google');
    // The design's two triggers: after a save (debounced) and on open / back to foreground.
    setWriteListener(() => engine.scheduleSync());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) engine.scheduleSync();
    });
    window.addEventListener('online', () => engine.scheduleSync());
    engine.runSync();
  }

  async function gate(container, { onDone }) {
    appContainer = container;
    resumeApp = onDone;

    if (needsSignInChoice()) {
      renderSignInChoiceView(container, {
        onGoogle: async () => {
          await auth.signIn();
          startSyncing();
          onDone();
        },
        onGuest: () => {
          paintHeader('guest');
          onDone();
        },
      });
      return;
    }

    if (readSyncMode() === 'google') {
      if (isOffline()) {
        // Starting offline is normal, not an error: the app is local-first and will sync when the
        // network comes back (the 'online' listener above).
        paintHeader('google');
        setWriteListener(() => engine.scheduleSync());
        window.addEventListener('online', () => engine.scheduleSync());
        onDone();
        return;
      }
      const resumed = await auth.resume();
      if (resumed) {
        startSyncing();
      } else {
        paintHeader('google');
        header.update({ ...engine.getStatus(), phase: 'auth', error: 'AUTH_EXPIRED' });
      }
      onDone();
      return;
    }

    paintHeader('guest');
    onDone();
  }

  return { gate };
}
```

- [ ] **Step 5: 建立 `src/webEntry.js`**

```js
// src/webEntry.js
//
// The hosted build's entry point. It exists purely so the offline build (scripts/build.mjs,
// entry src/app.js) never pulls a byte of login or sync code into dist/TableC.html.
export { mountApp, wireBackupControls } from './app.js';
export { wireSyncControls } from './sync/wireSyncControls.js';
```

- [ ] **Step 6: 跑測試確認通過**

Run: `npx vitest run tests/wireSyncControls.test.js tests/app.test.js`
Expected: PASS

- [ ] **Step 7: 確認離線版真的沒有同步程式碼**

Run: `npm run build`
Run: `grep -c "googleapis.com" dist/TableC.html`
Expected: 印出 `0`（`grep` 找不到時 exit code 為 1，屬正常）。若出現任何 >0 的數字，代表 `src/app.js` 或它的下游意外 import 了同步模組，必須修掉才算完成。

- [ ] **Step 8: Commit**

```bash
git add src/app.js src/sync/wireSyncControls.js src/webEntry.js tests/wireSyncControls.test.js tests/app.test.js
git commit -m "$(cat <<'EOF'
feat: wire sign-in choice, header and sync engine behind a gate hook

app.js takes an injected gate instead of importing sync code, so the offline
single-file build stays free of login and network code.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: PWA 建置調整與實機驗證

**Files:**
- Modify: `scripts/build-web.mjs`（entryPoints、CSP、標題列、bootstrap、Service Worker）
- Modify: `src/styles.css`（`.sync-header` 版面）
- Test: 手動實機驗證（OAuth 與 Drive 無法在 jsdom 驗證）

**Interfaces:**
- Consumes: Task 17 的 `CFormApp.wireSyncControls`、`mountApp({ gate })`。
- Produces: `site/index.html`／`site/sw.js` 內含 Client ID、放行 Google 網域的 CSP、`#sync-slot`。

- [ ] **Step 1: 改 esbuild 進入點**

`scripts/build-web.mjs` 的 `esbuild.build` 呼叫改成：

```js
const result = await esbuild.build({
  entryPoints: ['src/webEntry.js'],
  bundle: true,
  format: 'iife',
  globalName: 'CFormApp',
  write: false,
  target: ['chrome100', 'safari15'],
});
```

- [ ] **Step 2: 放行 Google 網域的 CSP 與 Client ID 常數**

CSP 那一行 `<meta>` 換成：

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com; frame-src https://accounts.google.com; base-uri 'none'; form-action 'none';">
```

（`script-src` 給 GIS 的 `gsi/client`；`frame-src` 給同意畫面；`connect-src` 給 Drive REST 與 userinfo。只開這三個網域，不用 `*`。）

在 `const html = ` 之前加上：

```js
// Public by design — an OAuth Client ID is not a secret (the client secret is, and this app
// doesn't use one: GIS's token flow doesn't need it).
const GOOGLE_CLIENT_ID = '841383586205-ohr1uhsrii1tg3oevtcacimc4sviekcr.apps.googleusercontent.com';
```

- [ ] **Step 3: 標題列加同步插槽**

`app-header__actions` 那個 `<div>` 換成：

```html
  <div class="app-header__actions">
    <div class="sync-header" id="sync-slot"></div>
    <button type="button" class="btn btn--header" id="export-backup" title="此備份檔為未加密的完整資料（含幼兒姓名、出生日期等個資），請勿放在共用雲端資料夾">匯出備份</button>
    <label class="btn btn--header btn--header-file">匯入備份 <input type="file" id="import-backup" accept="application/json"></label>
  </div>
```

（插槽放在備份按鈕**左邊**，符合規格「標題列、備份按鈕左邊」。）

`src/styles.css` 加上：

```css
.sync-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}
```

- [ ] **Step 4: bootstrap 接線**

inline bootstrap 換成：

```js
document.addEventListener('DOMContentLoaded', () => {
  const backupControls = CFormApp.wireBackupControls({
    exportButton: document.getElementById('export-backup'),
    importInput: document.getElementById('import-backup'),
  });
  const syncControls = CFormApp.wireSyncControls({
    clientId: '${GOOGLE_CLIENT_ID}',
    syncSlot: document.getElementById('sync-slot'),
  });
  CFormApp.mountApp(document.getElementById('app'), {
    onUnlock: backupControls.updateLockState,
    gate: syncControls.gate,
  });
});
```

- [ ] **Step 5: Service Worker 只處理同源 GET**

fetch handler 換成：

```js
self.addEventListener('fetch', event => {
  // Only same-origin GETs are cacheable. The old handler tried to cache.put() every request,
  // which throws on a POST and on an opaque cross-origin response — and on failure fell back to
  // caches.match(), resolving with undefined and breaking every Drive API call while offline.
  // Anything else goes straight to the network so the sync layer sees real errors.
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

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
```

- [ ] **Step 6: 建置並確認產出**

Run: `npm run build:web`
Run: `grep -c "841383586205" site/index.html`
Expected: ≥ 1。

Run: `grep -c "accounts.google.com" site/index.html`
Expected: ≥ 1。

Run: `npx vitest run tests/`
Expected: PASS（全部測試）。

- [ ] **Step 7: 實機驗證（無法自動化，必做）**

在真實瀏覽器跑一次 `site/`（例如 `npx serve site`）。注意 OAuth 需要先把該來源加進 Google Cloud Console 的「已授權的 JavaScript 來源」。逐項確認：

1. 輸入密碼 → 出現登入選擇畫面 → 選「使用 Google 登入」→ Google 同意畫面出現 → 回到 App，標題列顯示「早安／午安／晚安，<名字>」。
2. Google 雲端硬碟網頁上看得到 `育英公托填表系統` 資料夾，裡面有 `sync-manifest.json` 與 `rec-*.json`。
3. 新增一個幼兒（用測試資料，不要用真實幼兒資料）→ 等幾秒 → 另一台裝置（或無痕視窗登入同一帳號）重新整理 → 該幼兒出現。
4. 在點滴分享上傳一張照片 → Drive 出現 `photo-*.jpg`；只改該則的文字說明再等同步 → Drive 上那個照片檔**沒有**新版本（照片沒被重傳）。
5. 在 A 裝置刪除該則點滴分享 → B 裝置同步後也消失；Drive 垃圾桶裡找得到那個檔案。
6. 關掉網路 → 按登出，再按「使用 Google 登入」→ 顯示「目前離線，暫時無法登入」。
7. 登出 → 確認本機資料**還在**。
8. 手動把 Drive 上的 `sync-manifest.json` 丟進垃圾桶 → 重新整理 App → 標題列出現「雲端資料夾異常，已停止同步」，且 Drive 上沒有新增任何檔案。
9. 兩台裝置同時改同一則行為觀察的同一段文字 → 同步時出現比較畫面；選「都保留」→ 變成兩筆。
10. 匯出備份 → 匯入到一台全新的瀏覽器 → 登入同一帳號 → **沒有**產生重複幼兒（自然鍵配對生效）。

把 1–10 的實際結果寫進 commit message 或 PR 描述（只寫測試資料，不要寫真實幼兒姓名）。**任何一項不通過就不算完成。**

- [ ] **Step 8: Commit（含部署快照）**

```bash
npm run build:web
cp site/index.html index.html
cp site/sw.js sw.js
git add scripts/build-web.mjs src/styles.css index.html sw.js
git commit -m "$(cat <<'EOF'
feat: enable Google sign-in and cloud sync in the hosted build

CSP opens only accounts.google.com / googleapis.com / oauth2.googleapis.com,
and the service worker now only caches same-origin GETs so Drive calls pass
through untouched.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## 已知簡化（實作時照這樣做，不要自行補上）

- **不做上傳前的無失真壓縮**（規格「照片壓縮設定」最後一點建議可做）。每筆記錄的 JSON 只有幾百 bytes，gzip 之後省下的量小於多一層編解碼的程式碼與失敗風險；照片本身已經是 JPEG，再壓也沒有用。**若之後量測顯示文字上傳真的是瓶頸再補**。
- **不做本機「最近刪除」清單 UI**。規格要求的 30 天緩衝由 Google Drive 自己的垃圾桶提供（`trashed:true`，30 天後自動清除），版本歷史同樣是 Drive 內建。本機只留 30 天墓碑用來傳遞刪除意圖，沒有還原畫面。
- **`needsReview` 只在同步狀態顯示筆數**（「都保留」產生的兩筆都會帶這個旗標），不在每個列表畫面加「待確認」標記。等使用者實際碰到衝突、確認需要更明顯的提示再加。
- **不重新壓縮既有照片**（規格已明列）。
- **不換 WebP**（規格已明列，`docx` v9.0.2 只認 jpg/png/gif/bmp）。

---

## Self-Review

**1. Spec coverage**

| 規格要求 | 對應 Task |
|---|---|
| 只涵蓋 PWA 版、離線版不動 | 17（gate hook、`webEntry.js`、Step 7 的 grep 驗證）、18 |
| 每個同步資料表補 `updatedAt` | 2、3 |
| 沿用密碼保護不變 | 17（gate 在密碼過關之後才跑，`passwordGate.js` 未修改） |
| 第一次顯示登入選擇畫面、記住選擇 | 14、17 |
| 問候語 + 名字、三個時段 | 15 |
| 訪客模式顯示登入按鈕 | 15、17 |
| 離線按登入 → 「目前離線，暫時無法登入」 | 10（`signIn` 擋 OFFLINE）、14、15 |
| 登出只停止同步、不清資料 | 10（`signOut`）、17（`setWriteListener(null)`） |
| 存在雲端硬碟看得到的一般資料夾 | 11（`FOLDER_NAME`，非 appDataFolder） |
| 自動同步：存檔後 debounce + 開啟/回前景 | 13（`scheduleSync`）、17（`visibilitychange`／`online`） |
| 只更新不同的地方 | 5（雜湊）、7（`planSync`）、11（`appProperties` 帶雜湊） |
| 首次登入只在兩邊都有且內容不同才詢問 | 9、13 |
| 換新裝置直接補齊下載 | 7（`downloads`）、13 |
| 一筆存一筆、可中斷續傳 | 6（`applyRemoteRecord`）、12、13（逐筆 `persistBase`） |
| 4~6 個並行 | 11（`MAX_CONCURRENCY = 5`） |
| 誰比較新以雲端時間為準 | 11（HTTP `Date`）、13、15 |
| 衝突畫面：保留 A／B／都保留 | 16、13 |
| 都保留 = 兩筆 + 待確認 | 13（`keepBoth`）、16 |
| 不同欄位自動合併 | 8、13 |
| 照片標記已同步、只傳新的、改文字不重傳照片 | 12 |
| 照片刪除會同步 | 12 |
| Drive 版本歷史 + 30 天緩衝 | 11（PATCH 同一 fileId、`trashed:true`）、4（`TOMBSTONE_TTL_MS`） |
| 維持 JPEG、`maxEdge` 改 960、只影響新照片 | 1 |
| 上次同步時間 + 部分失敗拆開顯示 | 15 |
| 同步到一半斷網保留已完成部分 | 6、12、13 |
| 登入過期 → 不會自動消失的警示 | 11（`AuthExpiredError`）、13、15（`data-persistent`）、17 |
| 雲端資料夾格式跑掉 → 整個停止 | 11（`DriveFormatError` + manifest 檢查）、13 |
| 單張照片損毀 → 跳過、標記失敗、繼續 | 11（`mapWithConcurrency`）、12 |
| 文字上傳前無失真壓縮 | **刻意不做**，見上面「已知簡化」 |

**2. Placeholder scan** — 無 TBD／TODO；每個步驟都含可直接貼上的程式碼與 `Run:`／`Expected:`。

**3. Type consistency**

- `syncState` 的資料列統一為 `{ uid, store, hash, base, fileId, syncedAt }`（Task 4 定義、Task 13 `persistBase` 寫入並讀 `.base`、Task 12 照片列為 `{ uid: photoUid, store: 'photo', hash: null, fileId, syncedAt }`，無 `base`）。
- `status` 物件六個欄位 `{ phase, textSyncedAt, photoSyncedAt, photoPending, needsReview, error }` 在 Task 13／15／17 一致。
- `drive` 介面七個方法 `ensureFolder`／`listCloud`／`uploadRecord`／`downloadRecord`／`uploadPhoto`／`downloadPhoto`／`trashFile` 在 Task 11 定義，Task 12／13 使用，名稱一致。
- `resolveConflicts` 輸入 `{ uid, store, fields, localPayload, cloudPayload }`、`fields` 為 `{ field, local, cloud }`、輸出 `{ uid, choice }`，在 Task 13／16／17 一致。
- `mapWithConcurrency` 回傳 `{ item, ok, value, error }`，Task 11 定義、Task 12／13 以 `.ok`／`.value` 取用，一致。
