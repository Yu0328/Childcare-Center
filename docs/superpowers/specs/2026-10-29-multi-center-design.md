# 多間公托版本（同一個 GitHub Pages 網站）— 設計

## 目標
主任要先做出四間公托的版本給老師試用，包含目前的育英。各間的 logo、標題和機構全名不同，表單內容相同。目前只能部署在 `yu0328.github.io/Childcare-Center/`，所以每間放在一個子資料夾，各有自己的網址：

```
/Childcare-Center/            ← 舊網址：搬家通知＋自動轉到 yuying/（另含 about／privacy／Google 驗證檔，位置不變）
/Childcare-Center/yuying/     ← 育英
/Childcare-Center/<id>/       ← 之後新增的公托
```

不做「進來先選公托」的分流首頁：主畫面圖示和名稱是跟著網址走的，而且老師可能選錯間。

其他三間的資料（名稱、logo、機構全名）還沒拿到，這次先把架構做好，只放育英一間。之後新增一間＝設定檔多一組＋放 logo，程式不用動。

## 1. 公托設定（`src/centers.js`）
```js
export const CENTERS = [
  {
    id: 'yuying',                                   // 網址資料夾，英文（中文網址貼到 LINE 會變亂碼）
    title: '屏東縣內埔鄉育英公托填表系統',            // 頂端標題、分頁標題、manifest name、操作說明圖解
    shortName: '育英公托填表',                        // 主畫面名稱、安裝說明、操作說明圖解
    institution: '屏東縣內埔鄉育英公設民營托嬰中心',    // 總表、適性紀錄 Word
    monthlyPlanInstitution: '屏東縣內埔鄉育英公設民營托嬰中心-屏東縣政府委託中華頭心手希望教育協會辦理', // 月計畫 Word（整行）
    driveFolderName: '育英公托填表系統',
    dbName: 'c-form-db',                            // 育英沿用舊名，搬家後資料還在
    storagePrefix: 'c-form',                        // localStorage／sessionStorage 鍵的前綴，育英沿用舊名
  },
];
export const CENTER = CENTERS.find(c => c.id === (typeof __CENTER_ID__ === 'undefined' ? 'yuying' : __CENTER_ID__));
```
- 網頁版建置時用 esbuild `define` 傳入 `__CENTER_ID__`；**離線版和測試不傳，固定是育英**，所以離線版完全不受影響。
- logo 放在 `assets/centers/<id>/icon-192.png`、`icon-512.png`（正方形）。育英的就是現在的 `assets/icons/` 兩張，搬過去。
- 新公托的 `dbName`／`storagePrefix` 用 `c-form-<id>-db`／`c-form-<id>`。月計畫那行要不要換協會名稱，要問主任，所以是獨立一欄，不由 `institution` 組出來。

改成讀 `CENTER` 的地方：

| 位置 | 欄位 |
|---|---|
| `scripts/build-web.mjs`：`<title>`、頂端標題、`apple-mobile-web-app-title`、manifest | `title`、`shortName` |
| `src/export/docxExport.js`、`parentReportDocxExport.js` 的 `INSTITUTION_NAME` | `institution` |
| `src/export/monthlyPlanDocxExport.js` 的 `INSTITUTION_NAME` | `monthlyPlanInstitution` |
| `src/sync/driveClient.js` 的 `FOLDER_NAME` | `driveFolderName` |
| `src/storage/dbCore.js` 的 `DB_NAME` | `dbName` |
| `src/sync/googleAuth.js` 三個鍵、`src/storage/syncStateDb.js` 的 `SYNC_FOLDER_KEY` | `storagePrefix` |
| `src/ui/installDialog.js` 說明文字、`src/ui/helpContent.js` 的 `APP_NAME` 與圖解裡的「育英公托填表」 | `title`、`shortName` |

`scripts/build.mjs`（離線版）只改讀取 logo 的路徑（改成 `assets/centers/yuying/`），其餘不動。浮動按鈕位置、操作說明手機版／電腦版這兩個鍵只是畫面偏好，各間共用無妨，不加前綴。

## 2. 每間資料分開
同一個網站底下，瀏覽器的資料庫、localStorage、sessionStorage、快取都是共用的，所以：
- 資料庫名稱、Google 登入／同步相關的鍵、雲端資料夾名稱：每間不同（見上表）。育英全部沿用舊名，搬家後資料都在、不用重新登入。
- **快取**：現在 Service Worker 啟用時會刪掉「名字不是自己的」所有快取，多間並存時會互刪。改成快取名 `c-form-<id>-<hash>`，只刪掉同前綴的舊快取。舊網址的 Service Worker 另外負責刪除改版前的 `c-form-cache-*`。
- Google 授權只認網域，不認資料夾，所以 OAuth 設定不用改。

## 3. 建置（`scripts/build-web.mjs`）
- 對 `CENTERS` 每一間：用 `define: { __CENTER_ID__ }` 打包一次，輸出 `site/<id>/index.html`、`manifest.json`、`sw.js`、`icons/`。`start_url`／`scope` 本來就是相對路徑，註冊 `sw.js` 也是相對路徑，所以每間的 Service Worker 只管自己的資料夾，`updatePrompt.js` 不用改。
- 另外輸出舊網址用的 `site/index.html`（轉址頁）和 `site/sw.js`（見下節）。
- `.github/workflows/deploy.yml` 不用改：about／privacy／Google 驗證檔照樣複製到 `site/` 最外層。

## 4. 舊網址：搬家通知＋自動轉址
目標是老師幾乎什麼都不用做。iPhone 從主畫面打開的 App 和 Safari 分開存資料，請老師重新加到主畫面的話，新圖示是空的（訪客模式資料會像不見了），所以**不要求重新安裝**，舊圖示繼續用。

**`site/index.html`（舊網址頁面）**
- 讀 localStorage 鍵 `c-form-moved-seen`：有的話直接 `location.replace('yuying/')`，不顯示任何東西。
- 沒有的話顯示通知：
  - 「填表系統搬到新網址了，資料都還在，不用重新登入。」
  - 〔繼續使用〕：寫入 `c-form-moved-seen`，然後轉到 `yuying/`。
  - 不是從主畫面圖示打開時（`display-mode: standalone` 與 `navigator.standalone` 都不成立），多顯示新網址、〔複製新網址〕按鈕，以及「請把新網址加入書籤」。
  - 小字：想換成新圖示可以在新網址按「安裝」；沒用 Google 登入的話，請先「備份 → 匯出備份」，裝好後再匯入。
- 舊圖示從主畫面打開時還是在同一個 App 裡（`yuying/` 在舊 manifest 的範圍內），所以資料和登入狀態都還在。
- **「移除通知」（之後另一個小改動）**：只拿掉通知，頁面改成直接轉址，並且永久保留，舊圖示就不會壞掉。

**`site/sw.js`（取代舊網址的 Service Worker）**
- 跟其他間一樣等 `SKIP_WAITING` 才接手。老師手機裡的舊版會照 `updatePrompt.js` 的規則，在安全的時候（回到首頁、沒有填到一半、沒有視窗開著）換上新版並重新整理，接著看到通知頁，**不會打斷正在填的表**。
- 安裝時快取 `./`、`./index.html`，舊圖示沒網路時也能打開並轉過去。
- 啟用時刪掉 `c-form-cache-*`（改版前的快取）和自己的舊版快取。
- 只回應舊網址頁面自己的請求；`yuying/` 等子資料夾的請求一律不攔，交給各自的 Service Worker 或網路。
- 現在網址列打舊網址的人，第一次也是拿到這個頁面（network-first）。

## 5. 這次不改
- 離線版 `dist/TableC.html`
- about／privacy 頁內容、Google 登入畫面上的應用程式名稱
- 操作說明影片，以及圖解裡畫的網址列文字（`yucare.github.io`）
- 不做分流首頁

## 驗證
- **單元測試**：沒有 `__CENTER_ID__` 時 `CENTER` 是育英，且育英的 `dbName`、`storagePrefix`、`driveFolderName`、機構名稱都和改版前完全相同；每間的 `id`、`dbName`、`storagePrefix`、`driveFolderName` 都不重複；每間的 logo 檔都存在。既有的匯出測試照樣通過（機構名稱沒變）。
- **Playwright（用本機伺服器，路徑模擬 `/Childcare-Center/`）**：
  1. 先部署改版前的 `site/` 在最外層，建一位幼兒、登入訪客模式。
  2. 換成新的 `site/`。舊頁面回到首頁後自動更新，出現通知頁 → 〔繼續使用〕→ `yuying/` 裡幼兒還在。
  3. 再開一次舊網址，直接進 `yuying/`，沒有通知。
  4. 暫時在設定加一間假的「測試公托」（不提交）：它看不到育英的資料，標題、圖示、manifest 名稱、三種 Word 的機構名稱都是自己的；育英的快取沒有被它刪掉。
  5. 離線（關網路）時從舊網址打開還能轉到 `yuying/`。
- **實機**：iPhone 從舊的主畫面圖示打開，確認看到通知、按〔繼續使用〕後資料還在。

## 之後新增一間公托
1. `src/centers.js` 加一組設定。
2. `assets/centers/<id>/` 放三張圖：方形 `icon-192.png`、`icon-512.png`（填表系統頂端與主畫面 App），以及圓形 `word-badge.png`（四角透明，Word 匯出頁首用；建置時以 `__CENTER_BADGE__` 傳入 `src/export/docxShared.js`）。原始圖只有方形時，從中間切正方形再切圓即可。
3. 推上 `main`，網址就是 `/Childcare-Center/<id>/`。

## 2026-10-29 補充：第一批三間
- 萬丹 `wandan`、公正 `gongzheng`、岡山壽天 `shoutian`。主畫面名稱取短名（「壽天公托填表」，避免 iPhone 截字）。
- 月計畫那行：萬丹、公正比照育英（機構名稱＋「-屏東縣政府委託中華頭心手希望教育協會辦理」）；壽天是「高雄市政府社會局委託高雄市嬰幼兒托育協會辦理-高雄市岡山壽天公共托嬰中心」。
- 圖：育英 App 圖示改成方形，Word 徽章維持原本的圓形圖（逐位元相同）；萬丹的 Word 徽章把圖縮小一點再切圓，以免小櫻桃被切到；公正還沒有 logo，先用建築照片。
- 月計畫預設：萬丹是週一「戶外活動日」、週二「節氣」、週五「團體課」，週三週四照舊留給適性（`monthlyPlanDefaults`）；壽天是週一、三、四「大團體活動」、週二「節氣」，週五留給適性；其他間沿用育英的週一、週五「大團體活動」、週二「節氣」。
- 月計畫畫面上的暖色格子跟著各間自己的預設日走（`PRESET_WEEKDAYS`），不再寫死週一、二、五；其餘日子填了東西才變綠。
- App 圖示：`icon-192/512.png` 做成 iPhone 風格圓角（四角透明，給 Android／電腦安裝用）；另有方形 `apple-touch-icon.png`（180）給 iPhone，因為 iPhone 會自己修圓角、並把透明四角填黑。填表系統頂端的 logo 維持圓形（CSS `border-radius: 50%`）。
