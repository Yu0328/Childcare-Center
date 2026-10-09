# 課程月計畫個別項目 — 實作計畫

Spec: `docs/superpowers/specs/2026-10-09-monthly-plan-child-only-items-design.md`

每個 task 先寫失敗的測試，再寫實作，`npx vitest run tests/` 全綠才進下一個。

## Task 1 — 資料層（`src/storage/monthlyPlanDb.js`）

- `addPlanSlotItem({ ..., childId })`：`childId !== undefined` 才放進記錄。
- `itemVisibleToChild(item, childId)`：`item.childId === undefined || item.childId === childId`，export 給畫面與匯出共用。
- `deleteChildOnlyItemsForChild(planId, childId)`：列出計畫所有 slot 的項目，`childId` 相符者走 `deletePlanSlotItem`。
- 測試（`tests/monthlyPlanDb.test.js`）：無 `childId` 時欄位不存在；`itemVisibleToChild` 三種情況；`deleteChildOnlyItemsForChild` 只刪該幼兒的個別項目＋其 override。

## Task 2 — 移除幼兒時清掉個別項目

- `src/storage/db.js` `deleteChild`、`monthlyPlanEditorView.js` 管理幼兒儲存：在 `deleteChildItemOverridesForChild` 旁加呼叫 `deleteChildOnlyItemsForChild`。
- 測試：`deleteChild` 後個別項目消失（`tests/db.test.js` 或既有 deleteChild 測試所在檔）；編輯畫面移出幼兒後個別項目消失。

## Task 3 — 備份與同步

- `backup.js` 匯入：有 `childId` 的項目經 `childIdMap` 對應，對不到就略過（也不放進 `itemIdMap`，其 override 自然對不到項目——override 迴圈需略過 `itemIdMap` 沒有的項目）。
- `syncStores.js`：planSlotItems `refs` 加 `childId: CHILD_REF`；`naturalKey` 有 `childId` 時附加。
- 測試：`tests/backup.test.js` round-trip 與 dead-child；`tests/syncStores.test.js` serialize/deserialize 與 naturalKey。

## Task 4 — Word 匯出

- `monthlyPlanDocxExport.js` `contentRow` 收 `childId`，用 `itemVisibleToChild` 篩選。
- 測試（`tests/monthlyPlanDocxExport.test.js`）：個別項目只出現在所屬幼兒的表格。

## Task 5 — 編輯畫面

- `dayCellHtml`、`renderPanelItems` 用 `itemVisibleToChild` 篩選；個別項目加「個別」標籤（月曆：`.monthly-calendar__item-tag`；面板：沿用 `.indicator-block__code`）。
- 新增表單最上方：「適用幼兒」`.tier-switch`（同階段共用／僅限○○）＋ `[data-also-add]` 區塊（「同時新增給：」＋ `.panel-form__checkbox-list`），只在選「僅限」且有其他同階段幼兒時顯示；切回共用時清掉勾選。
- 送出：共用 → 一筆無 `childId`；僅限 → 目前幼兒＋每個勾選的幼兒各一筆。
- 刪除：個別項目用個別確認文字。
- `refreshCellAndPanel` 不變（仍重畫同階段所有幼兒的格子，個別項目由篩選決定誰看得到）。
- CSS：`.monthly-calendar__item-tag`（沿用 `.indicator-block__code` 的配色，字級配合格子）。
- 測試（`tests/monthlyPlanEditorView.test.js`）：spec「測試」一節列出的畫面行為。

## Task 6 — 操作說明

- `helpContent.js`：`dayPanel` 支援 `childOnly` 參數畫出「適用幼兒」；新增 demo `plan-makeup`「幫一位幼兒補課」；`plan-day` 的 note 補一句。
- 跑 `tests/helpContent.test.js`／`helpDemo.test.js`／`helpView.test.js`。

## Task 7 — 實機驗證

- `npm run build`，Playwright 開 `dist/TableC.html`：建立兩位同階段幼兒的月計畫，走「僅限＋同時新增給」，在 1400px 與 390px 寬各截圖，確認排版與只出現在對的幼兒格子；匯出 Word 確認。
