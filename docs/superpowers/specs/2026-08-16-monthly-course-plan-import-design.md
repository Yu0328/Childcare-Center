# 課程月計畫匯入 — 設計文件

日期：2026-08-16

## 背景與問題

「課程月計畫」（見 `docs/superpowers/specs/2026-08-12-monthly-course-plan-design.md`）目前只能在畫面上新增/編輯，並可匯出成 docx（`src/export/monthlyPlanDocxExport.js`），但無法匯入——不論是把匯出的檔案重新讀回來，還是讀老師手動在 Word 排版的舊檔案。這跟「適性總表」「適性紀錄(家長版)」都已經有 docx 匯入（`src/import/docxImport.js`／`src/import/parentReportDocxImport.js`）不一致。

本次新增匯入功能，比照這兩個既有匯入器的概念：regex 掃 `word/document.xml` 原始 XML（不是真的 XML parser），解析失敗的欄位丟出警告、交給預覽畫面讓使用者確認/修正後才真正寫入資料庫，而不是靜默猜測或直接失敗。

參考文件：`references/月計畫/` 目錄下 5 份真實舊檔（`西瓜班-01/02/10/12月計畫.docx`、`115年06月週計畫表.docx`）。這些檔案彼此排版**不完全一致**（見下方「舊檔案解析」一節），是本次匯入器最大的複雜度來源。

## 範圍

1. 新增 `src/import/monthlyPlanDocxImport.js`：解析一份 docx，回傳結構化的預覽資料（不直接寫入 DB）。
2. 新增 `src/ui/monthlyPlanImportPreviewView.js`：預覽/確認畫面，可編輯期別、每位小朋友的比對結果、每個項目的內容，確認後才寫入 `monthlyPlanDb.js`。
3. `src/ui/monthlyPlanListView.js` 新增匯入按鈕，支援多檔案選取（比照 `childListView.js` 既有的 `processImportQueue` 佇列模式——一次選多個檔案，逐一顯示預覽/確認畫面）。
4. 兩種來源都要能解析：
   - 本 app 自己匯出的 docx（round-trip：匯出後重新匯入不出錯、資料一致）。
   - 老師手動排版的舊檔案（best-effort：盡量解析，抓不準的地方丟警告、預覽畫面留給人工修正，不保證 100% 正確）。

不涵蓋：
- 匯入後合併進「既有」同期別的 MonthlyCoursePlan（每次匯入一律建立全新計畫，比照 `docxImport.js` 匯入總表的既有慣例——重複匯入會產生重複計畫，使用者自行刪除多餘的）。
- 常駐班級名稱的辨識或儲存（`references/月計畫/` 檔名雖含班級名如「西瓜班」，但內文中不存在，且 `MonthlyCoursePlan` 資料模型本來就沒有這個欄位——不是本次要補的缺口）。
- PDF 檔案匯入（`115年06月週計畫表(1).pdf` 只是視覺參考，不解析）。

## 一、期別與小朋友比對

- **期別**：標題「`{period}課程計畫`」文字裡的「N年N月」——不論落在 `word/header*.xml`（本 app 自己的匯出、`115年06月週計畫表.docx` 走這條）還是純內文（`西瓜班-*.docx` 沒有獨立 header part，期別文字直接混在機構名稱／核准文號等雜訊字串中）。Regex 抓 `(\d{1,3})年(\d{1,2})月課程計畫`，不要求前後緊接特定字元（因為前面常接無分隔符的雜訊數字）。抓不到就丟警告、預覽畫面要求手動選期別。
- **小朋友比對**：匯出的 docx 沒有出生日期欄位（只有姓名＋月齡＋階段），無法比照總表/適性紀錄用「姓名＋出生日期」比對。改用**姓名**比對現有小朋友清單：
  - 唯一同名 → 自動帶入該小朋友。
  - 找不到同名，或同名有多位 → 預覽畫面提供下拉選單（現有小朋友清單 + 「建立新小朋友」選項），要求手動指定，不自動猜測。
- **階段（tier）**：
  - 本 app 自己的匯出：姓名欄第三段落固定是 `tierFormLabel(tier)`（如「C表」），直接反查。
  - 舊檔案：姓名欄尾端常附一個表別字母（如 `/D`），用同一套 `tierFormLabel` 對照表反查；抓不到就丟警告、要求手動選階段。

## 二、日曆位置換算

不解析每個日期格上的文字（如「06/01(一)」或舊檔案的「3/3」），而是直接用已知的期別呼叫 `buildMonthlyCalendar(year, month)`（`src/domain/monthlyCalendar.js`），依表格欄位的**第幾欄＝第幾週、列的第幾組日期/內容列＝星期幾**位置對應回 `weekIndex`／`weekday`——理由：解析日期文字容易受格式差異影響出錯，而欄位順序（第一欄週一、第五欄週五）是這份文件既有的固定版面慣例，不論本 app 匯出或舊檔案都遵循同一份原始範本設計。

## 三、日期內容格擷取——本 app 自己匯出的檔案

结構乾淨，可以精確解析（已用真實匯出檔案驗證過 XML 結構）：

- 一格內容 = 一個 `<w:tc>`，裡面每個 PlanSlot 項目是獨立的 `<w:p>`。
- 一個項目的每一行（指標代碼／【活動名稱】／指標內容）各自是獨立的 `<w:r>`，第一行之外的行在該 `<w:r>` 內的 `<w:t>` 前面帶 `<w:br/>`。
- `notAchieved`（未達成）→ 該項目**所有行的 `<w:r>`** 的 `<w:rPr>` 都帶 `<w:color w:val="FF0000"/>`。
- `replaced`（請假／更換課程）→ 所有行的 `<w:r>` 都帶 `<w:strike/>`；若有 `replacementText`，同一個 `<w:p>` 內緊接著再一個**不帶顏色/刪除線**的 `<w:r>`。
- 判斷規則：一個段落內，若存在帶 `<w:strike/>` 的 run，且最後一個 run 不帶 `<w:strike/>`，那個最後的 run 視為 `replacementText`，其餘 run 才是這個項目本身的文字行。
- 純活動項目（無指標代碼）只有一行、一個 `<w:r>`。
- 姓名欄位垂直合併：第一列 `<w:vMerge w:val="restart"/>`，之後每列 `<w:vMerge w:val="continue"/>`（本 app 匯出永遠用完整寫法，不是 bare shorthand）——沿用 `parentReportDocxImport.js`／`docxImport.js` 既有的 `isVMergeContinue` 判斷邏輯即可，不用重寫。

## 四、日期內容格擷取——舊檔案（best-effort）

實際比對 5 份真實舊檔後發現**排版並不統一**，複雜度明顯高於本 app 自己的匯出格式：

- 同一個日期格內，多個項目**擠在同一段落**，沒有清楚的分隔符號，順序也不固定（有時「【活動名稱】指標代碼指標內容」，有時「指標代碼指標內容【活動名稱】」），部分項目後面還黏著無意義的「OK」字樣。
- 「未達成」標記：4/5 份檔案用 `<w:color w:val="FF0000"/>`，1 份完全沒有這個標記。
- 「請假／更換課程」標記：至少兩種不同做法混用——(a) 項目文字加 `<w:strike/>`，緊接**另一個獨立段落**（不是同段落內的 run）純文字「請假」；(b) 完全不動項目本身，直接在**日期格**（不是內容格）附加「（請假）」括號文字，沒有任何刪除線或顏色。

因此舊檔案採**盡力而為**的解析策略，而非精確解析：

- 用指標代碼的既有 pattern（`(?:[ⅠⅡⅢⅣⅤⅥ]|IⅤ|III|IV|II|I|V)-\d-\d+`，沿用 `parentReportDocxImport.js` 的 `INDICATOR_CODE_IN_TEXT_PATTERN`）當作切分項目的錨點：格內文字依代碼出現位置切成多個片段，每個片段用 `normalizeIndicatorCode` 取得代碼、片段中的 `【...】` 取活動名稱、去掉代碼/【】/「OK」雜訊字樣後剩下的文字當指標內容。
- 「未達成」：偵測片段內是否有 `<w:color w:val="FF0000"/>`（限日期內容格，姓名欄尾端表別字母若是紅字裝飾不算，不掃姓名欄）。
- 「請假／更換課程」：
  - 偵測到項目本身有 `<w:strike/>`，且緊接著的下一個段落是純文字（無刪除線）→ 該段落文字當 `replacementText`，套用在這個項目上。
  - 偵測到日期格本身文字含「（請假）」「（更換課程）」（全形/半形括號都要接受）且該格內容沒有任何刪除線標記 → 對該格**所有項目**套用 `replaced: true`，`replacementText` 取括號內文字；丟出警告「此欄位偵測到請假／更換課程標記，已套用到當日所有項目，請確認」，因為這個標記法本身就是綁在整個日子而非單一項目上，無法更精準對應。
- 任何一個小朋友的日期格解析出的內容，跟同階段「canonical」小朋友（該階段第一個出現的小朋友）不一致時，仍以 canonical 為準（PlanSlot 內容本來就是同階段共用，這裡不特別比對差異、不丟警告——YAGNI，若之後發現這個假設在實務上常常不成立，再回頭處理）。
- 解析結果一律進預覽畫面，任何欄位都可手動修改後才送出。

## 五、預覽畫面 `monthlyPlanImportPreviewView.js`

比照 `parentReportImportPreviewView.js` 的既有版面慣例：

- 頂部警告清單（`parsed.warnings`）。
- 期別欄位（可改）。
- 每位小朋友一個區塊：姓名比對下拉選單（唯一同名時預設選中；找不到/同名多位時預設空白、必須手動選或建立新小朋友）、階段（可改）。
- 每格內容以文字方式列出各項目（代碼／活動名稱／指標內容／未達成／請假標記＋替代文字），可勾選排除、可編輯文字內容——比照 `importPreviewView.js` 的 `entryRow`／checkbox include 模式。
- 送出後：對每位「已比對/已建立」的小朋友，寫入一筆新的 `MonthlyCoursePlan`（`addMonthlyCoursePlan`），依 canonical 內容建立 `PlanSlot`＋`PlanSlotItem`（`getOrCreatePlanSlot`／`addPlanSlotItem`），再依每位小朋友各自的 override 呼叫 `setChildItemOverride`。

## 測試

- `monthlyPlanDocxImport.js`：手刻 zip fixture 測試（比照 `docxImport.test.js`）——期別抓取的各種文字排列、姓名欄兩種格式（本 app 匯出的三段式 vs 舊檔案的字母表別後綴）、日期格擷取的兩種來源、未達成/請假兩種標記法（含日期格括號標記那種）、`isVMergeContinue` 沿用既有邏輯不必重測。
- Round-trip acceptance test（比照 `docxExport.acceptance.test.js`／`parentReportDocxExport.acceptance.test.js` 風格，用合成 fixture，非真實資料）：呼叫 `generateMonthlyPlanDocxBlob` 產生 docx → 餵給 `monthlyPlanDocxImport.js` → 驗證解析結果跟原始 plan/slots/items/overrides 資料一致（含 notAchieved／replaced+replacementText／純活動項目三種情況）。
- 開發期間手動對 `references/月計畫/` 的真實檔案跑一次匯入，人工核對預覽畫面的解析結果是否合理（不納入自動化測試、不把任何真實資料寫進程式碼或註解——`references/` 本來就是 gitignored 敏感資料）。

## 非目標（本次不做）

- 匯入合併進既有同期別計畫。
- 班級名稱辨識/儲存。
- PDF 匯入。
- 舊檔案 100% 精確解析——warnings + 可編輯預覽畫面是既定的安全網，不是要在 parser 內把每種舊排版變體都完美處理。

## 驗收方式

- 匯出一份跨階段、多位小朋友的月計畫，重新匯入，確認每位小朋友的每一格內容（含未達成/請假+替代文字/純活動項目）都跟原始資料一致，且不需要在預覽畫面手動修正任何欄位。
- 對 `references/月計畫/` 的 5 份真實舊檔各匯入一次，確認：期別/姓名/階段大致能被抓到或至少清楚要求手動輸入（不是靜默錯誤或整個匯入失敗）；至少能辨識出部分指標代碼與對應項目；未達成/請假兩種既知標記法都至少有部分正確識別；解析不完美的地方都反映在警告清單或需要手動確認的欄位上，而不是悄悄漏掉。
- 同一份檔案匯入兩次，確認建立兩份獨立的 MonthlyCoursePlan（無合併、無報錯）。
