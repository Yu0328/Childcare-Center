# 統一匯入（首頁自動辨識匯入） — 設計文件

日期：2026-08-18

## 背景與問題

目前三個表單各自有獨立的 docx 匯入按鈕，都要先進到該表單的列表頁才看得到：
適性總表／適性紀錄在 `childListView.js`，課程月計畫在 `monthlyPlanListView.js`。使用者
要匯入前，得先自己判斷這份檔案屬於哪個表單、切到對應畫面才能匯入。

本次需求：在首頁（`reportTypeSelectView.js`，選擇要填寫的表那一頁）新增一個「匯入檔案」
按鈕，支援一次選多個 `.docx` 檔案，每個檔案**自動辨識**屬於三者中的哪一種，各自路由到
對應的既有解析器與預覽畫面——使用者不必先選表單類型再匯入。

## 範圍

1. 新增 `src/import/unifiedDocxImport.js`：對單一檔案做類型偵測（`detectDocxImportType`），
   再呼叫對應的既有解析器並回傳 `{ type, parsed }`（`parseUnifiedDocxImport`）。
2. `src/ui/reportTypeSelectView.js` 新增「匯入檔案」按鈕＋多選檔案 input，沿用既有
   `processImportQueue`（`src/ui/importQueue.js`，本次不修改）逐檔顯示對應的既有預覽畫面
   （`renderImportPreviewView`／`renderParentReportImportPreviewView`／
   `renderMonthlyPlanImportPreviewView`，三者簽章一致、本次不修改）。
3. 三個表單既有列表頁上各自的匯入按鈕**維持不變、不移除**——首頁的統一按鈕是新增的另一個
   入口，不是取代；使用者已經進到某表單列表頁時，仍可用原本該頁的匯入按鈕。

不涵蓋：
- 匯入備份（`c-form-backup-*.json`）——那是完全不同的整庫還原機制，與本次無關。
- PDF 或非 docx 格式。
- 修改三個既有解析器／預覽畫面本身的行為。

## 一、類型偵測 `detectDocxImportType(file)`

不做真正的 XML parse，比照既有三個解析器的慣例：用 JSZip 讀出 `word/document.xml`
（必要時再讀 `word/header*.xml`），對原始 XML 文字做 regex 判斷，回傳
`'assessment' | 'parent-report' | 'monthly-plan' | null`（`null` 代表無法辨識）。

判斷順序（依特徵獨特程度由高到低，第一個命中就回傳）：

1. **適性紀錄 (parent-report)**：文字含「點滴分享」或「行為觀察」。這兩個是
   `parentReportDocxExport.js` 固定會輸出的區塊標題（`buildHighlightsTable` 一律輸出
   「點滴分享」標題列，即使 `highlightEntries` 是空陣列也一樣），適性總表／課程月計畫的
   匯出都不含這兩個詞。
2. **課程月計畫 (monthly-plan)**：文字（`document.xml` 或任一 `header*.xml`）含
   `/\d{1,3}年\d{1,2}月課程計畫/`——這正是 `monthlyPlanDocxExport.js` 自己輸出的標題
   `${period}課程計畫`，也是既有 `monthlyPlanDocxImport.js` 用來抓期別的同一個錨點
   pattern（沿用既有慣例，非另創新的判斷邏輯）。適性紀錄的標題是「每月課程計畫表」（無
   年月數字直接相接「課程計畫」，中間隔著「每月」二字），不會誤判。
3. **適性總表 (assessment)**：文字含「幼兒姓名」。這是 `docxExport.js` 固定輸出的欄位
   （`幼兒姓名：${child.name} ...`）。適性紀錄也有這個欄位，但因為適性紀錄一定會先在第 1
   步被攔截，走到第 3 步時只剩總表符合。
4. 以上都不符合 → 回傳 `null`（無法辨識）。

若 `null`，`parseUnifiedDocxImport` 丟出例外（訊息「無法辨識檔案類型」），沿用
`processImportQueue` 既有的「解析失敗即略過此檔、彙整到最後的略過清單」邏輯，不需要另外
處理——這條路徑今天就已經被三個既有匯入器的「餵錯檔案可能拋例外」情況覆蓋。

## 二、`parseUnifiedDocxImport(file)`

```js
async function parseUnifiedDocxImport(file) {
  const type = await detectDocxImportType(file);
  if (!type) throw new Error('無法辨識檔案類型');
  if (type === 'parent-report') return { type, parsed: await parseParentReportDocxImport(file) };
  if (type === 'monthly-plan') return { type, parsed: await parseMonthlyPlanDocxImport(file) };
  return { type, parsed: await parseDocxImport(file) };
}
```

偵測時讀一次 zip、真正解析時各解析器再各自讀一次 zip（不共用已讀取的 zip 物件）——三個
解析器目前都是 `parse(data) => JSZip.loadAsync(data)` 的獨立函式，`file` 是可重複讀取的
`File`/`Blob`，重讀一次的成本對這種 KB 等級的 docx 可忽略，換來的是不用改動任何既有解析
器的簽章或內部實作。

## 三、UI：`reportTypeSelectView.js`

比照 `childListView.js` 既有的按鈕／隱藏 input／`data-error="import"` 版面慣例：

```html
<button type="button" class="btn btn--purple" data-action="import-any-docx">匯入檔案</button>
<input type="file" accept=".docx" data-field="import-any-file" multiple hidden>
<p class="field-error field-error--center" data-error="import"></p>
```

選檔後呼叫 `processImportQueue(fileInput.files, { parseFn: parseUnifiedDocxImport,
renderPreview, container, backToList: () => renderReportTypeSelectView(container,
{ onSelectType }) })`。`renderPreview` 是一個小型 dispatcher，依 `parsed.type` 選擇對應
的既有預覽畫面元件並轉呼叫（`parsed.parsed` 才是各預覽畫面原本期望的 `parsed` 物件）：

```js
function renderUnifiedImportPreview(container, { parsed: { type, parsed }, onCancel, onImported }) {
  const render = {
    assessment: renderImportPreviewView,
    'parent-report': renderParentReportImportPreviewView,
    'monthly-plan': renderMonthlyPlanImportPreviewView,
  }[type];
  render(container, { parsed, onCancel, onImported });
}
```

三個預覽畫面簽章都是 `(container, { parsed, onCancel, onImported })`，且都能自行比對／
新建 Child，不需要预先選定表單類型或 Child——這正是能直接重用的原因。

## 測試

- `tests/unifiedDocxImport.test.js`：對 `detectDocxImportType`／`parseUnifiedDocxImport`
  做 round-trip 測試——分別用 `generateDocxBlob`／`generateParentReportDocxBlob`／
  `generateMonthlyPlanDocxBlob` 產生一份檔案，確認偵測結果正確、且回傳的 `parsed` 內容跟
  該類型既有解析器直接解析的結果一致。另加一個「內容完全無關的 docx（無任何已知標記）」
  測資，確認回傳 `null` / 拋例外。
- `tests/reportTypeSelectView.test.js`（新檔案，或視既有檔案結構加入）：比照
  `childListView.test.js` 的 `selectFile`／`buildSampleXxxDocxFile` 模式，驗證選一個總表
  檔案、一個適性紀錄檔案、一個課程月計畫檔案時，各自開出正確的確認匯入畫面（用畫面上的
  標題文字「確認匯入內容」「確認匯入內容（適性紀錄）」「確認匯入內容（課程月計畫）」區分）；
  另測「連續選兩個不同類型的檔案，依序各自跳出對應畫面」（多檔案佇列＋混合類型）。

## 非目標（本次不做）

- 移除三個表單各自列表頁上原有的匯入按鈕。
- 匯入備份／PDF。
- 修改既有三個解析器或三個預覽畫面本身的行為。
- 偵測不到類型時提供「手動選擇要匯入到哪個表單」的補救 UI——直接歸類為略過並列在錯誤
  摘要即可，比照既有「解析失敗即略過」慣例，不特別加額外的手動指定流程（YAGNI；若之後
  發現常常誤判、需要人工救援，再回頭處理）。

## 驗收方式

- 在首頁一次選取三種類型（各一份）＋一份無關 docx，確認三份各自正確路由到對應預覽畫面
  且資料正確，第四份出現在略過清單裡，不影響前三份的匯入結果。
- 既有三個表單列表頁的原匯入按鈕行為不受影響（既有測試維持綠燈）。
