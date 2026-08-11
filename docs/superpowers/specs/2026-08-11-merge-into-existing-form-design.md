# 彙整進現有總表 — 設計文件

日期：2026-08-11

## 背景與問題

「課程計畫表彙整成總表」功能（見 `docs/superpowers/specs/2026-08-11-courseplan-aggregation-design.md`）目前每次彙整都會建立一份全新的適性總表。實際使用後發現：老師常常是先彙整過一批適性紀錄成一份總表，過一陣子又有新的月份適性紀錄要補進「同一份」總表，而不是每次都另開一份新總表。本文件新增「合併進現有總表」的選項，作為既有「建立新總表」的替代路徑。

## 範圍

本文件涵蓋：
1. `aggregateCoursePlanIntoForm` 新增合併進現有總表的能力（含重複資料自動跳過、紀錄年月範圍自動擴大）
2. 彙整選擇畫面新增「建立新總表／合併進現有總表」選項
3. `storage/db.js` 新增 `updateForm`

不涵蓋：跨階段合併（沿用既有限制，只能同階段）、合併關聯的追蹤記錄（不記錄「這份總表是被哪幾次彙整動作寫入的」，合併後就是一份普通總表）。

## 一、資料層：`storage/db.js` 新增 `updateForm`

比照既有 `updateEntry` 的寫法：

```js
export async function updateForm(id, changes) {
  const existing = await runRequest('forms', 'readonly', store => store.get(id));
  if (!existing) throw new Error(`Form ${id} not found`);
  const updated = { ...existing, ...changes, id };
  await runRequest('forms', 'readwrite', store => store.put(updated));
  return updated;
}
```

## 二、`aggregateCoursePlanIntoForm` 變更

新增可選參數 `targetFormId`（`src/domain/aggregateCoursePlan.js`）：

- **未帶 `targetFormId`**：行為與現況完全相同——建立一份新總表，寫入全部可寫入的資料。
- **帶 `targetFormId`**：
  1. 讀出 `targetFormId` 現有的觀察紀錄（`listEntriesForForm`）。
  2. 依現有邏輯算出這次要寫入的資料列（排除請假、排除找不到指標的），每一列在寫入前跟「目前已存在／已決定要寫入」的紀錄比對：`indicatorCode`＋`date`＋`status`＋`note` 四者完全相同視為重複，跳過不寫入，計入回傳的 `skippedDuplicates`（比對集合隨著本次新寫入的資料累積，同一批次內彼此重複也會被抓到，不只是跟總表原本就有的資料比對）。
  3. 紀錄年月自動擴大範圍：把 `targetFormId` 現有的 `period`（可能本身已經是「115年05月-115年06月」這種範圍）跟本次選定的適性紀錄期別放在一起，取全體最小值與最大值，套用既有的「單一期別不加範圍符號」規則。用 `updateForm` 寫回。
  4. 其餘資料用既有的 `addEntry({ formId: targetFormId, ... })` 寫入。
- 回傳值從 `{ form, failed }` 擴充為 `{ form, failed, skippedDuplicates }`；未帶 `targetFormId` 時 `skippedDuplicates` 固定是 `0`。

### 期別範圍合併的字串處理

沿用既有 `aggregateCoursePlanIntoForm` 建立新總表時「用 `-` 串起最小-最大期別、相同則不加範圍符號」的邏輯，新增一個共用小函式把「一個既有 period 字串（可能是單一期別或範圍）」與「一組新期別字串」合併成新的 min-max period 字串：拆解既有 period 字串（用 `-` 拆成一或兩段），跟新期別字串放在同一個陣列排序後取頭尾。

## 三、UI：`aggregateCoursePlanView.js`

在「選擇要彙整的適性紀錄」下方新增一組單選（radio）：

- 「建立新總表」（預設選中，維持現況行為）
- 「合併進現有總表」——選中後，底下多一個下拉選單，列出**該幼兒、目前選定階段**的現有總表（`listFormsForChild(child.id)` 篩該階段），選項文字顯示期別（如「115年05月-115年06月」）。
  - 若該階段沒有任何現有總表，這個單選選項要停用（不能選），維持只能建立新總表。

切換「階段」下拉時，適性紀錄複選清單跟現有總表下拉選單都要重新依新階段刷新（現有總表下拉若刷新後變成沒有選項，自動切回「建立新總表」）。

送出時：
- 「建立新總表」→ 呼叫 `aggregateCoursePlanIntoForm({ childId, tier, reportIds })`（不帶 `targetFormId`），行為同現況。
- 「合併進現有總表」→ 多驗證一項：必須已選定要合併進去的總表，否則顯示欄位錯誤訊息；驗證通過後呼叫 `aggregateCoursePlanIntoForm({ childId, tier, reportIds, targetFormId })`。

結果處理（沿用既有「有問題就先列出來，按按鈕才導向總表」的模式，新增 `skippedDuplicates` 的呈現）：
- `failed.length === 0 && skippedDuplicates === 0` → 直接呼叫 `onCreated(form)` 導向總表編輯畫面。
- 否則 → 在畫面上列出失敗清單（沿用既有格式）＋一行「已跳過 N 筆重複資料」（`skippedDuplicates > 0` 時才顯示），並提供「前往查看總表」按鈕，按下才呼叫 `onCreated(form)`。

## 四、測試

- `aggregateCoursePlanIntoForm`：
  - 帶 `targetFormId` 時寫入現有總表，不建立新總表
  - 完全相同（指標代碼＋日期＋狀態＋說明）的紀錄自動跳過，計入 `skippedDuplicates`；同一批次內彼此重複也會被抓到
  - 紀錄年月範圍正確擴大（含「現有總表本身已是範圍」與「現有總表原本是單一期別」兩種情況）
  - 未帶 `targetFormId` 時 `skippedDuplicates` 固定為 0，行為與現況一致（回歸測試）
- `aggregateCoursePlanView.js`：
  - 該階段沒有現有總表時，「合併進現有總表」選項停用
  - 切換階段後現有總表下拉選單正確刷新；刷新後若無選項自動切回建立新總表
  - 選「合併進現有總表」但沒選目標總表時顯示欄位錯誤
  - 有跳過的重複資料時畫面正確顯示筆數與提示

## 驗收方式

- 建立一份總表（可以是彙整產生或手動新增皆可），先合併進一批適性紀錄的課程計畫資料，確認觀察紀錄正確寫入、紀錄年月正確擴大
- 重複勾選同一份已合併過的適性紀錄再合併一次，確認完全相同的紀錄被跳過、沒有出現重複列，畫面正確顯示跳過筆數
- 確認該階段沒有任何現有總表時，「合併進現有總表」選項無法選取
- 確認切換階段後現有總表清單正確刷新
