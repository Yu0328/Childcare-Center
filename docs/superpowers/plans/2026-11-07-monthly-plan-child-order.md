# 月計畫自訂幼兒順序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 老師在月計畫「管理幼兒」裡用「依序點號碼」排幼兒順序，存進 `plan.childIds`，Word 與切換幼兒按鈕照這個順序。

**Architecture:** 兩個純函式（`src/domain/childOrder.js`）算順序；`monthlyPlanEditorView.js` 的管理幼兒視窗加一個排序畫面並在儲存時用這兩個函式產生 `childIds`。不新增欄位、不改 DB 版本。

**Tech Stack:** vanilla JS、vitest + jsdom + fake-indexeddb、esbuild。

**Spec:** `docs/superpowers/specs/2026-11-07-monthly-plan-child-order-design.md`

## Global Constraints

- 新增月計畫畫面（`monthlyPlanListView.js`）不動。
- 打勾畫面不顯示號碼、名單順序維持 `listChildren()` 的順序。
- 排序畫面不出現打勾框（不能因排序把幼兒移出月計畫）。
- 文字：按鈕「排順序」、標題「依序點選幼兒」、提示「沒點到的會照原本順序排在後面」、按鈕「完成」「取消」。號碼用 ①②③…（`String.fromCodePoint(0x2460 + n - 1)`，超過 20 改用 `${n}.`）。
- 按「儲存」才寫入；排序的「完成」只改視窗內暫存順序。

## Review Focus

- 已排好順序、沒按「排順序」只勾了一個新幼兒就儲存：原順序要保留，新幼兒接最後（現在的儲存會照 `listChildren()` 重建、打亂順序）→ Task 2 測試。
- 排序後又取消勾選某個幼兒再儲存：他被移出，其餘順序不變 → Task 1 `finalChildIds` 測試。
- 排序畫面點了幾個後按「取消」，或整個視窗按「取消」：順序回到開視窗前 → Task 2 測試。
- 點一個已有號碼的幼兒：取消號碼、後面號碼往前補 → Task 2 測試。

---

### Task 1: 順序計算純函式

**Files:**
- Create: `src/domain/childOrder.js`
- Test: `tests/childOrder.test.js`

**Interfaces:**
- Produces:
  - `applyTapOrder(currentIds: Array, tappedIds: Array) → Array` — `[...tappedIds, ...currentIds 中沒被點到的（原順序）]`。
  - `finalChildIds(orderedIds: Array, checkedIds: Array) → Array` — `orderedIds` 中仍在 `checkedIds` 的（照 `orderedIds` 順序），再接上 `checkedIds` 中不在 `orderedIds` 的（照 `checkedIds` 順序）。

- [ ] **Step 1: 寫失敗測試** `tests/childOrder.test.js`：
  - `applyTapOrder([1,2,3,4], [3])` → `[3,1,2,4]`
  - `applyTapOrder([1,2,3,4], [4,2,1,3])` → `[4,2,1,3]`
  - `applyTapOrder([1,2,3], [])` → `[1,2,3]`
  - `finalChildIds([3,1,2], [1,2,3])` → `[3,1,2]`（順序以 ordered 為準）
  - `finalChildIds([3,1,2], [1,2,3,5])` → `[3,1,2,5]`（新勾的接最後）
  - `finalChildIds([3,1,2], [2,3])` → `[3,2]`（取消勾選的移出）
- [ ] **Step 2:** `npx vitest run tests/childOrder.test.js` → FAIL（模組不存在）
- [ ] **Step 3:** 在 `src/domain/childOrder.js` 實作兩個函式（各一兩行 filter/concat）。
- [ ] **Step 4:** 同指令 → PASS
- [ ] **Step 5:** `git add src/domain/childOrder.js tests/childOrder.test.js && git commit -m "feat(月計畫): 幼兒順序計算"`

### Task 2: 管理幼兒視窗的排序畫面與儲存

**Files:**
- Modify: `src/ui/monthlyPlanEditorView.js`（管理幼兒表單 HTML 約 216-238 行；取消 handler 約 316 行；`save-children` handler 約 384-418 行）
- Modify: `src/styles`（或專案現有 CSS 所在檔）— 排序清單樣式
- Test: `tests/monthlyPlanEditorView.test.js`（沿用該檔 `describe` 內管理幼兒測試的 fixture：`childA`、`childB`、`plan`、`waitFor`）

**Interfaces:**
- Consumes: `applyTapOrder`、`finalChildIds`（Task 1）。

**行為：**
- 視窗內暫存 `order`（初值 `plan.childIds`）。打勾畫面的「幼兒」legend 那行右邊加 `<button type="button" class="btn btn--outline btn--small" data-action="sort-children">排順序</button>`。
- 按「排順序」：隱藏打勾畫面（fieldset + 儲存/取消那排），顯示排序畫面 `data-sort-children`：標題、提示、`finalChildIds(order, 目前有勾的 id（照名單順序）)` 每個一顆 `<button type="button" data-sort-child="${id}">`，前面號碼位 `data-sort-number`；底下「完成」`data-action="sort-done"`、「取消」`data-action="sort-cancel"`。
- 點 `data-sort-child`：沒號碼 → 加到 `tapped` 尾端；有號碼 → 從 `tapped` 移除，重畫所有號碼。
- 「完成」：`order = applyTapOrder(finalChildIds(order, checked), tapped)`，回打勾畫面。「取消」：丟掉 `tapped`，回打勾畫面。
- 整個視窗的「取消」（既有 `cancel-manage-children`）：`order` 重設為 `plan.childIds`，並回到打勾畫面。
- `save-children`：`newChildIds = finalChildIds(order, 有勾的 id（照 listChildren 順序）)`，取代現在的 `allChildren.filter(...).map(...)`；其餘（tier、seed、刪除被移出者資料、重畫）不變。

- [ ] **Step 1: 寫失敗測試**（加在既有管理幼兒 describe 裡，plan 需有 ≥3 位幼兒時自建 `childC`）：
  1. 「排順序後儲存，childIds 照點的順序」：plan.childIds `[A,B,C]` → 開管理幼兒 → 點「排順序」→ 點 C、A → 「完成」→「儲存」→ 等重畫 → `getMonthlyCoursePlan` 的 `childIds` 等於 `[C,A,B]`；`[data-switch-child]` 按鈕的順序也是 C、A、B。
  2. 「再點一次取消號碼」：排序畫面點 A、B、再點 A → B 的 `data-sort-number` 是 ①、A 沒有號碼。
  3. 「沒排序只勾新幼兒，原順序保留」：plan.childIds `[B,A]`（建 plan 時就給這個順序）→ 勾 C →「儲存」→ `childIds` 等於 `[B,A,C]`（不可用 `.sort()` 比）。
  4. 「排序後取消，不改順序」：點「排順序」→ 點 C →「取消」→「儲存」→ `childIds` 等於原本 `[A,B,C]`；另測整個視窗「取消」後重開再「儲存」也是原順序。
  5. 「排序畫面沒有打勾框」：排序畫面內 `querySelector('input[type=checkbox]')` 為 null。
- [ ] **Step 2:** `npx vitest run tests/monthlyPlanEditorView.test.js` → 新測試 FAIL
- [ ] **Step 3:** 依上方「行為」實作；樣式照 `panel-form` 現有風格，已點的號碼用主色、未點的淡灰。
- [ ] **Step 4:** `npx vitest run tests/` → 全部 PASS
- [ ] **Step 5:** `git commit -m "feat(月計畫): 管理幼兒可依序點選排幼兒順序"`

### Task 3: Word 照順序輸出 + 實機驗證

**Files:**
- Test: `tests/monthlyPlanDocxExport.test.js`

- [ ] **Step 1: 寫測試**「照 plan.childIds 的順序輸出」：`children` 傳 `[A,B]`、`plan.childIds` 為 `[B,A]`，解開 `word/document.xml`，B 的名字出現位置在 A 之前。
- [ ] **Step 2:** 跑該檔；若 FAIL，把 `generateMonthlyPlanDocxBlob` 的 `children.filter(c => plan.childIds.includes(c.id))` 改成依 `plan.childIds` 對應取出（略過找不到的），再跑到 PASS。（編輯器傳入的 `children` 已照 `childIds` 載入，所以這是防呆。）
- [ ] **Step 3:** `npm run build`，用 Playwright 開 `dist/TableC.html`：建 3 位幼兒與月計畫 → 管理幼兒 → 排順序 → 點選 → 完成 → 儲存，確認切換按鈕順序；手機寬度（390px）下排序畫面不溢出。截圖確認。
- [ ] **Step 4:** `git commit -m "test(月計畫): Word 照幼兒順序輸出"`
