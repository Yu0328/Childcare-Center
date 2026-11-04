# 月計畫每位幼兒各自一份＋套用 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 月計畫的項目全部屬於單一幼兒；拿掉指定新增；加「套用其他幼兒月計畫」；舊共用項目打開時自動拆開；一次性通知。

**Architecture:** 資料結構不變（PlanSlotItem 一律帶 `childId`）。`splitSharedItems` 在編輯畫面載入時把舊共用項目拆成每人一份（uid 固定算法，兩台裝置各拆也會同步成同一筆）。`copyMonthlyPlan` 整月取代。套用視窗從 `copyCoursePlanPanel.js` 抽出共用的 `copyFromChildPanel.js`。

**Tech Stack:** vanilla JS、IndexedDB、vitest + jsdom + fake-indexeddb、esbuild。

## Global Constraints
- Spec: `docs/superpowers/specs/2026-11-04-monthly-plan-per-child-copy-design.md`。
- 共用項目沒有 `childId` 欄位（不是 null）— 新程式不再產生，但讀取端（`itemVisibleToChild`、Word 匯出）保留相容。
- 按鈕文字：「套用其他幼兒月計畫」／手機「套用」（`headerButtonLabel`）。
- 通知 localStorage key：`${CENTER.storagePrefix}-monthly-plan-per-child-notice`。
- 測試用 `npx vitest run tests/`。

---

### Task 1: `splitSharedItems(plan, children)`（`src/storage/monthlyPlanDb.js`）
- 對 plan 每個 slot 的每個無 `childId` 項目：給 `plan.childTiers[c.id] === slot.tier` 的每位幼兒加一份 `{...欄位, childId: c.id, uid: item.uid && c.uid ? `${item.uid}~${c.uid}` : undefined}`；同 slot 裡已有同 uid 的就略過（重跑／中斷後安全）。
- 該幼兒掛在共用項目上的 override：`putRecord` 改 `itemId` 為新項目 id。
- 最後 `deletePlanSlotItem(shared.id)`。
- 以 `serializeByKey(`split:${plan.id}`)` 包起來，同時兩次呼叫不重複。
- 測試（`tests/monthlyPlanDb.test.js`）：依年齡層一人一份、不同年齡層不拿到、override 改指向、共用被刪、跑兩次結果相同、uid 為 `共用uid~幼兒uid`。

### Task 2: `src/domain/copyMonthlyPlan.js`
- `childItemCounts(plan)` → `Map(childId → 筆數)`。
- `copyMonthlyPlan({ plan, targetChildId, sourceChildId })`：記下目標舊項目 → 對來源每個項目 `getOrCreatePlanSlot({ planId, tier: plan.childTiers[target], weekIndex, weekday })` 後 `addPlanSlotItem({..., childId: target})` → 刪舊項目（`deletePlanSlotItem`，順帶清 override）。同一人不動作。
- 測試（`tests/copyMonthlyPlan.test.js`）：取代、跨年齡層放進目標 slot、override 不複製且目標舊 override 清掉、來源不變、同一人不動作。

### Task 3: 預設活動每人一份（`src/domain/monthlyCoursePlan.js`）
- `seedDefaultPlanSlots({ planId, children: [{ id, tier }], weeks })`：每位幼兒在預設的星期，若該 slot 沒有他看得到的項目才加 `{activityName, childId: id}`。
- 呼叫端：`monthlyPlanListView.js` 新增計畫、`monthlyPlanEditorView.js` 管理幼兒儲存。
- 新加入的幼兒因此也會有預設活動（比規格寫的「空的」更好用，規格同步更新）。
- 更新 `tests/monthlyCoursePlan.test.js`。

### Task 4: Word 匯入每人一份（`src/ui/monthlyPlanImportPreviewView.js`）
- 改成對每位 resolved child、其年齡層的 slots 各建一份帶 `childId` 的項目，`itemIdsBySlotKey` 改以 `${childId}:${weekIndex}:${weekday}` 為鍵，override 掛在自己那份。
- 更新 `tests/monthlyPlanImportPreviewView.test.js`。

### Task 5: 共用套用視窗 `src/ui/copyFromChildPanel.js`
- `renderCopyFromChildPanel(host, { trigger, title, emptyText, sources: [{ id, label }], confirmMessage: async id => string, copy: async id => void, onChange, confirmCopy })`。
- `copyCoursePlanPanel.js` 改用它（行為、文字不變，`tests/copyCoursePlanPanel.test.js` 照舊通過）。

### Task 6: 編輯畫面（`src/ui/monthlyPlanEditorView.js`、`src/styles.css`）
- `loadEditorData` 開頭 `await splitSharedItems(plan, children)`。
- 拿掉：指定新增開關／提示／加選／`＋N`／`tab-layout--individual`／`data-individual-note`／`lockedNow`／「個別」標籤，及對應 CSS。一位幼兒時不顯示工具列。
- 新增一律 `childId: child.id`；刪除確認一律「確定要刪除${child.name}的「${name}」嗎？此操作無法復原。」；`refreshCellAndPanel` 只重畫目前幼兒的格子。
- 標題列加 `data-action="copy-monthly-plan"` 按鈕＋`<div data-copy-plan-host>`，用 Task 5 視窗：來源＝計畫中其他筆數 > 0 的幼兒，label `名字（N 筆）`；空時「這份月計畫裡沒有其他已排課的幼兒。」；確認文字依規格；完成後重畫並停在目標幼兒。
- 改寫 `tests/monthlyPlanEditorView.test.js` 的個別項目與共用測試。

### Task 7: 一次性通知 `src/ui/monthlyPlanNotice.js`
- `maybeShowMonthlyPlanNotice({ hasPlans, storage = localStorage })`：已看過就不動；沒有月計畫就只寫入旗標；否則寫入旗標並開 `<dialog class="form-popup form-popup--wide">`（照 `installDialog.js`），內容照規格，「我知道了」關閉。
- `monthlyPlanListView.js` 呼叫。測試 `tests/monthlyPlanNotice.test.js`。

### Task 8: 操作說明（`src/ui/helpContent.js`、`src/ui/helpView.js`）
- 「安排一天的活動」note 改為只加到目前這位幼兒；「幫一位幼兒補課」改為切換幼兒 → 打開那天 → 新增；新增「套用其他幼兒的月計畫」demo；月計畫編輯畫面的 mini 版加「套用」按鈕、拿掉指定新增開關。
- `HELP_OUTDATED_CHAPTERS = ['monthly-plan']`：章節清單與「看影片的這一段」旁加「此段為舊版畫面，請參考下方文字說明」。
- 更新 help 測試。

### Task 9: 收尾
- CLAUDE.md 月計畫段落、規格同步；`npm test`；`npm run build` 後用 Playwright 驅動 `dist/TableC.html`（1400px、390px）：舊資料拆分、套用、通知；commit。
