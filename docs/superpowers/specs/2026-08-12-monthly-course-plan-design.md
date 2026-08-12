# 課程月計畫 — 設計文件

日期：2026-08-12

## 背景與問題

托育中心每個月要為整班（跨小朋友）排一份「課程月計畫」：以週一到週五為單位，規劃每天要做的活動／指標。週一固定是大團體活動、週二固定是節氣主題，其餘上課日則依每位小朋友當月的階段（Ⅰ~Ⅴ）挑選對應的發展指標搭配活動名稱。

目前這份文件完全在 Word 手工排版：同一階段的小朋友，週三、週四規劃的指標內容通常一模一樣，老師卻要在每個小朋友的表格裡重複貼上同樣的指標代碼、活動名稱、指標內容文字，再手動把某些項目改成紅字（未達成）或劃掉（請假／改做其他活動）。這份規劃跟現有「適性總表」「適性紀錄(家長版)」是不同性質的文件（前者是計畫，後兩者是事後紀錄），本次新增為第三種表單類型。

參考文件：`陳小安C表-2.docx` 同目錄下的 `115年03月西瓜班月計畫-2.docx`（整班多位小朋友的月計畫範例）與 `115年06月週計畫表(1).pdf`（含紅字／劃線標記的視覺範例，兩者格式一致，皆稱本文件的「課程月計畫」）。

## 範圍

本文件涵蓋：
1. 新表單類型「課程月計畫」的資料模型（MonthlyCoursePlan / PlanSlot / ChildItemOverride）
2. 月曆展開邏輯（依年月切出週一～週五、切成第一～第五週）
3. 建立與編輯畫面（左：每位小朋友一塊日曆表；右：點選格子後的編輯面板）
4. docx 匯出（比照參考 PDF 的紅字／劃線視覺）

不涵蓋：docx 匯入、班級管理（常駐分班）、停課／國定假日自動判斷、與「適性紀錄(家長版)」課程計畫表資料的串接。

## 一、資料模型

新增獨立的 storage 模組 `src/storage/coursePlanDb.js`（比照 `parentReportDb.js` 的獨立性——這是跟 Child 表關聯、但生命週期與資料形狀都不同於 AssessmentForm／ParentReport 的另一種實體）。

**MonthlyCoursePlan**
- `id`
- `period`：民國年月字串，如 `"115年06月"`
- `childIds`：陣列，本計畫涵蓋的小朋友（建立時多選，之後可再增減）
- `childTiers`：`{ [childId]: tier }`，建立當下依 `suggestTier(child.birthDate, asOfDate)`（`asOfDate` 用該 `period` 換算出的當月第一天）算出每位小朋友當月的階段，可個別手動覆蓋（比照 AssessmentForm 既有的階段覆蓋模式，覆蓋值就地存在這個物件裡，不另建 override 表）

**PlanSlot（同階段共用的一天內容）**
- `id`
- `planId`
- `tier`：Ⅰ~Ⅴ
- `weekIndex`：1~5
- `weekday`：1~5（一~五）
- `items`：陣列，`{ itemId, indicatorCode或null, activityName, indicatorText }`（`indicatorCode` 為 null 時代表純活動、無對應指標）

同一個 `planId` 底下，每個出現過的 `(tier, weekIndex, weekday)` 至多一筆 PlanSlot；沒有使用者編輯過的組合不建立資料列，畫面上動態顯示空清單即可（YAGNI，不用預先把整月全部格子塞空列）。

**ChildItemOverride（單一小朋友對某個共用項目的標記）**
- `id`
- `planId`
- `childId`
- `itemId`（對應 PlanSlot.items 裡的 itemId）
- `notAchieved`：bool（未達成 → 紅字）
- `replaced`：bool（請假／改做其他活動 → 劃掉）
- `replacementText`：string（`replaced` 為 true 時，劃掉後面接的替代活動文字；可留空）

刪除一個 PlanSlot item 時，一併清掉所有引用該 `itemId` 的 ChildItemOverride（比照現有刪除 CoursePlanEntry 時級聯刪除 CourseOccurrence 的作法）。

## 二、月曆展開邏輯

新函式放在 `src/domain/monthlyCalendar.js`：

- 輸入 `period`（`"115年06月"`），換算西元年月
- 列出當月所有週一～週五（跳過週六日）
- 依「週一為起點」切成第一～第五週：第一天所在週的週一（可能落在上個月，若當月 1 號不是週一，第一週就只從當月實際第一個工作日開始，不補上個月的日期）到最後一天所在週的週五（若月底提前於週五結束，最後一週就只到當月最後一個工作日）
- 每週輸出 `{ weekIndex, dateRange: "MM/DD-MM/DD", days: [{ weekday, date, dateLabel: "MM/DD(一)" }, ...] }`

不處理國定假日／停課：這些日子跟一般上課日一樣正常展開，內容由老師直接打字（例如活動名稱直接填「端午節放假」），不是特殊狀態。

## 三、畫面

### 入口與清單

`reportTypeSelectView.js` 新增第三個選項「課程月計畫」，導向新的清單畫面 `src/ui/monthlyPlanListView.js`（比照 `formListView.js`：列出既有的 MonthlyCoursePlan，可新增／刪除／點入編輯）。

新增流程：選期別（年月）→ 多選小朋友（沿用 `childListView.js` 的清單，用 checkbox 取代單選按鈕，或另開一個多選版本）→ 建立後直接進編輯畫面。

### 編輯畫面 `src/ui/monthlyPlanEditorView.js`

**左側**：每位小朋友一塊日曆表，版面對齊參考文件——表頭列（日期/姓名｜第一~五週的日期範圍）、每週五個工作日各一列（日期列＋內容列）。內容列文字：
- 有指標的項目顯示 `代碼【活動名稱】指標內容`
- 純活動項目只顯示活動名稱
- 套用該小朋友自己的 ChildItemOverride：`notAchieved` → 紅字，`replaced` → 該項目文字加劃掉樣式並在後面接 `replacementText`（若有填）

同階段的小朋友，非週一週二的格子預設顯示相同內容（因為讀的是同一筆 PlanSlot），差異只來自各自的 override。

**右側面板**：點選左側任一小朋友日曆表中的任一天格子觸發：
- 面板最上方即時顯示「目前編輯：{小朋友姓名} 第{N}週 {日期}({星期)}」
- 中段：該格所屬 PlanSlot（`tier`+`weekIndex`+`weekday`，跟哪個小朋友無關，同階段共用）的項目清單，可逐項編輯：
  - 指標下拉（`getIndicatorsForTier(tier)`，選取後自動帶入 `activityName`／`indicatorText`，選完仍可手動改文字或改選別的指標）
  - 或不選指標、直接打活動名稱（純活動）
  - 新增／刪除項目
  - 週一／週二預設帶一個項目（`大團體活動`／`節氣`），一樣走這個編輯 UI，不特殊鎖定，只是建立計畫時預先幫忙塞好
- 下段（僅在點選來源是特定小朋友的格子時顯示，因為 override 是小朋友專屬）：該格每個項目各自的「未達成」「請假／其他活動代替」勾選，勾了後者可再填替代活動文字

面板編輯即改即存（比照現有表單頁多處採用的「送出後立刻寫回、重繪清單」模式），不做草稿暫存／取消機制（YAGNI，跟現有其他編輯面板一致）。

## 四、docx 匯出

新檔 `src/export/monthlyPlanDocxExport.js`，比照 `parentReportDocxExport.js` 的表格產生方式（`docx` 套件、`docxShared.js` 共用頁面設定）：

- 每位小朋友一張表，結構同編輯畫面左側（表頭週次列＋週一~週五×五週）
- 未達成項目：`TextRun` 加 `color: 'FF0000'`
- 請假／其他活動項目：原文字 `TextRun` 加 `strike: true`；`replacementText` 若有值，另起一個不劃掉的 `TextRun` 接在後面
- 兩者皆有（未達成且被取代）：同一個 `TextRun` 同時套 `color: 'FF0000'` 與 `strike: true`
- 表格框線、欄寬、字級：對照範例文件逐一比對調整（第一次落地時必須跟真實範例文件視覺比對，比照專案既有 docx 匯出功能的驗收方式）

## 測試

- `monthlyCalendar.js`：月初非週一／月底非週五的切週邊界、五週皆滿／最後一週只有 1~2 天等情況
- `coursePlanDb.js`：PlanSlot 的新增/更新/刪除、刪除 item 時級聯刪除對應 ChildItemOverride
- `monthlyPlanEditorView.js`：同階段共用內容正確反映到所有該階段小朋友的畫面；override 只影響單一小朋友；指標選取自動帶入文字後仍可手動覆蓋
- `monthlyPlanDocxExport.js`：未達成／請假／兩者皆有三種標記的 run 樣式正確；純活動（無指標）項目正確顯示

## 非目標（本次不做）

- docx 匯入（本功能只做畫面建立＋匯出，不解析既有 Word 檔案）
- 常駐班級管理（每次建立月計畫都是臨時多選小朋友）
- 停課／國定假日的自動判斷或特殊狀態，一律當一般上課日手動打字
- 與「適性紀錄(家長版)」課程計畫表資料的自動串接或互相帶入

## 驗收方式

- 建立一份跨階段（至少兩個不同階段）、多位小朋友的課程月計畫，確認同階段小朋友的週三/週四內容預設一致
- 對其中一位小朋友的某個項目標記「未達成」、另一位標記「請假」並填替代活動，確認畫面與匯出的 docx 都正確反映（紅字／劃線＋替代文字），且不影響同階段其他小朋友
- 月初非週一、月底非週五的月份（例如範例的 115年06月），確認切週與日期範圍跟參考 PDF 一致
- 匯出的 docx 逐頁跟 `115年06月週計畫表(1).pdf` 比對表格結構、框線、紅字/劃線樣式
