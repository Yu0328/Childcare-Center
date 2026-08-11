# 課程計畫表彙整成總表 — 設計文件

日期：2026-08-11

## 背景與問題

適性總表（C表）的觀察紀錄（ObservationEntry）目前完全由老師逐筆手動輸入。但老師每月已經在「適性紀錄(家長版)」的課程計畫表裡記錄了同樣性質的資料（指標代碼＋實施日期＋是否達成＋說明），只是拆成好幾個月份、好幾份適性紀錄分開存放。老師希望能把同一個階段、跨月份的多份適性紀錄之課程計畫表資料，一次彙整成一份完整的適性總表，不用重新謄寫一次。

彙整範圍限定在「課程計畫表」這個區塊——適性紀錄的其他三個區塊（適性發展紀錄表、行為觀察、點滴分享）不在此次範圍內，因為總表本身沒有對應的欄位。

彙整只在同一階段內進行，不跨階段（因為總表的指標清單本來就是依階段決定，跨階段彙整沒有對應的指標可放）。

## 範圍

本文件涵蓋：
1. 適性總表的觀察紀錄新增「發展中△」狀態，取代原本「已達成／未達成」的二分法
2. 新增「從適性紀錄彙整」流程：選幼兒（已在既有畫面完成）→ 選階段 → 複選同階段的適性紀錄 → 建立一份新總表
3. 對應的 docx 匯出調整（發展中的符號顯示）

不涵蓋：適性發展紀錄表／行為觀察／點滴分享的彙整；總表資料回填到適性紀錄（反向彙整）；跨階段彙整。

## 一、總表資料模型變更：達成 → 已發展／發展中

**現況**：`ObservationEntry.achieved` 是布林值，UI 是一個「已達成」checkbox，docx 匯出時 true 顯示「○」、false 顯示空白。

**變更**：
- 新增 `status` 欄位，值為 `'developed'`（已發展○）或 `'developing'`（發展中△），語意與用詞跟課程計畫表的 `CourseOccurrence.status` 完全一致
- UI（`formEditorView.js`）的新增／編輯觀察紀錄表單，checkbox 換成跟 `courseplanTabView.js` 一樣的 radio group（已發展○／發展中△，預設已發展○）
- **舊資料相容**：既有 IndexedDB 紀錄只有 `achieved` 沒有 `status`。不寫遷移程式，改在唯一的資料讀取點 `listEntriesForForm()`（`src/storage/db.js`）回傳前正規化：沒有 `status` 時，用 `achieved ? 'developed' : 'developing'` 補上。`formEditorView.js` 和 `docxExport.js` 收到的都是正規化後的資料，不需要各自處理相容邏輯
- docx 匯出（`docxExport.js`）：日期欄符號依 `status` 顯示「○」或「△」（取代原本只看 `achieved` 顯示「○」或空白的邏輯，作法比照 `parentReportDocxExport.js` 已有的 `developed`/`developing` 符號判斷）；表頭「【發展中】」文字順手補上「△」符號，跟課程計畫表匯出的表頭用語一致

## 二、彙整邏輯

新函式 `aggregateCoursePlanIntoForm({ childId, tier, reportIds })`，放在新檔 `src/domain/aggregateCoursePlan.js`（因為橫跨 `storage/db.js` 與 `storage/parentReportDb.js` 兩個 storage 模組，不屬於單一既有檔案）。

處理流程：

1. 依 `reportIds` 讀出每份適性紀錄（ParentReport），依 `period` 排序
2. 對每份報表：讀出其全部 `CoursePlanEntry`；對每筆 entry 再讀出全部 `CourseOccurrence`
3. 對每筆 occurrence：
   - `absent === true`（請假／未執行）→ 不帶入，直接跳過
   - 用 `getIndicator(entry.indicatorCode)` 查指標；查不到、或查到但 `indicator.tier !== tier`（指標不屬於目標階段）→ 記錄一筆「讀取失敗」項目（`{ reportPeriod, indicatorCode, activityName, reason }`），不寫入總表
   - 其餘轉成待寫入資料：`{ indicatorCode: entry.indicatorCode, date: occurrence.date, status: occurrence.status, note: occurrence.note }`（`CoursePlanEntry.activityName` 不帶入，總表的觀察紀錄本來就沒有活動名稱欄位）
4. 呼叫 `addForm({ childId, tier, period })` 建立一份新的 AssessmentForm；`period` 自動組成所選報表期別的清單，依步驟 1 排序後以「、」串接，並加上「彙整」後綴，例如「115年01月、02月、03月彙整」
5. 對步驟 3 產生的每筆待寫入資料呼叫 `addEntry({ formId, indicatorCode, date, status, note })`
6. 回傳 `{ form, failed }`

呼叫端（UI）拿到 `failed`：
- 空陣列 → 直接導向新總表的編輯畫面（`formEditorView`）
- 非空 → 在彙整畫面就地顯示「已建立總表，但以下 N 筆因故無法帶入」清單（指標代碼＋所屬報表期別＋原因），並提供「前往查看總表」按鈕；已成功寫入的部分不受影響，不因為有失敗項目就整個中止或回滾

## 三、UI 流程

**入口**：適性總表的「幼兒表單清單頁」（`formListView.js`）標題列，`h2` 旁邊加一顆「從適性紀錄彙整」按鈕。

**新畫面** `src/ui/aggregateCoursePlanView.js`：

1. 讀該幼兒全部 `ParentReport`（`listParentReportsForChild`），依 `tier` 分組
   - 若該幼兒完全沒有適性紀錄 → 顯示「這位幼兒尚無適性紀錄可彙整」，不顯示後續表單
2. 階段下拉選單：只列出「該幼兒至少有一份適性紀錄」的階段（不是固定列出全部 5 階段）
3. 切換階段時，底下顯示該階段全部適性紀錄的複選清單（依期別排序，顯示期別文字），可個別勾選；不特別做全選/取消全選按鈕（清單通常只有幾筆，YAGNI）
4. 「建立總表」按鈕：至少勾選一筆才能送出（沒勾選時顯示欄位錯誤訊息，比照既有表單的 `field-error` 樣式）
5. 送出後呼叫 `aggregateCoursePlanIntoForm`：
   - 無失敗項目 → 呼叫 `onCreated(form)`，由 `app.js` 導向 `showFormEditor(child, form)`
   - 有失敗項目 → 畫面內顯示失敗清單＋「前往查看總表」按鈕，按下後才呼叫 `onCreated(form)`

**路由**：`app.js` 新增 `showAggregateSelect(child)`，從 `showFormList` 進入；`formListView.js` 的新按鈕觸發 `onAggregate` 回呼。

## 四、測試

- `aggregateCoursePlanIntoForm` 的 vitest 單元測試：
  - 多份同階段報表合併成一份總表
  - `absent=true` 的實施紀錄不帶入
  - 指標代碼查不到、或指標階段跟目標階段不符 → 進入 `failed`，不中斷其餘資料寫入
  - `period` 標籤依期別排序組合
- `formEditorView.js`：新 radio group 新增／編輯行為測試；讀取只有 `achieved` 沒有 `status` 的舊資料時正確 fallback
- `docxExport.js`：`status='developing'` 顯示「△」、`status='developed'` 顯示「○」
- `aggregateCoursePlanView.js`：無適性紀錄時的提示、階段切換、複選送出、失敗清單顯示

## 非目標（本次不做）

- 適性發展紀錄表／行為觀察／點滴分享的彙整
- 總表資料反向帶回適性紀錄
- 跨階段彙整
- 彙整後的總表與來源適性紀錄之間的關聯追蹤（例如「這份總表是從哪幾份適性紀錄彙整來的」不特別記錄，彙整後總表就是一份獨立的普通總表，比照手動建立的總表管理）

## 驗收方式

- 建立測試幼兒＋同一階段三份不同月份的適性紀錄，各自填寫課程計畫表（含已發展／發展中／請假三種狀態），執行彙整後確認新總表的觀察紀錄正確對應（請假不出現、已發展／發展中狀態正確）
- 刻意在其中一份適性紀錄填入不存在的指標代碼（或跨階段的指標代碼），確認彙整後正確列在失敗清單、其餘資料仍正常寫入
- 確認舊資料（只有 `achieved` 沒有 `status`）在總表編輯畫面與 docx 匯出都能正確顯示，不出現錯誤或空白
- 確認彙整多次（選擇有重疊的來源報表）會各自建立獨立的新總表，互不影響
