# 「加入主畫面」按鈕 — 設計

## 目標
網頁版頂端（訪客：登入｜**安裝**｜備份；Google：立即同步｜**安裝**｜登出）加一顆按鈕，讓老師把系統加到主畫面。按鈕文字電腦版「加入主畫面」、手機版「安裝」（`headerButtonLabel`）。老師大多用 iPhone。

## 何時顯示（`src/pwa/installPrompt.js` 的 `installKind()`）
| 情況 | kind | 按鈕 |
|---|---|---|
| 已從主畫面打開（`display-mode: standalone` 或 `navigator.standalone`） | `null` | 隱藏 |
| LINE 內建瀏覽器（UA 含 ` Line/`） | `'line'` | 顯示 |
| iPhone／iPad（含 iPadOS 偽裝成 Mac 的 UA） | `'ios'` | 顯示 |
| 瀏覽器送出 `beforeinstallprompt`（Android Chrome、電腦 Chrome／Edge） | `'prompt'` | 顯示 |
| 其他（不支援安裝） | `null` | 隱藏 |

`beforeinstallprompt` 可能晚於畫面出現才觸發，按鈕先藏著、收到後再出現；`appinstalled` 後隱藏。離線版 TableC.html 沒有同步頂端列，自然不會有這顆按鈕。

## 按下後：一律先跳出說明視窗
標題「安裝到主畫面」，無小標題，直接進內容：

1. 安裝後，育英公托填表系統會像一般 App 一樣出現在{手機主畫面／電腦桌面}。點圖示就能直接打開，不用再開瀏覽器找網址，畫面也會{用滿整個螢幕／比較大}，填表時看得更清楚。
2. 這不是從{App Store／Play 商店／另外}下載的程式，而是把這個網站加到{主畫面／電腦}上。它幾乎不佔空間，也不會要求任何額外的權限。
3. 只有 iPhone（`ios`）顯示，依登入狀態擇一：
   - Google：安裝後用同一個 Google 帳號登入，資料會自動同步過來。
   - 訪客：iPhone 上安裝後的 App 和 Safari 是分開存資料的。請先按「備份 → 匯出備份」，裝好後在 App 裡「匯入備份」，就能把資料完整帶過去。
4. 怎麼安裝，依 kind：
   - `ios`：直接播放操作說明裡同一段「加到主畫面（iPhone）」動畫示範（`mountDemo`），標題改成「跟著以下步驟，大約 10 秒就能完成」；底部〔我知道了〕。
   - `prompt`：〔立即安裝〕→ 系統安裝視窗（`deferred.prompt()`，只能用一次）。
   - `line`：說明 LINE 裡不能直接安裝，〔用瀏覽器開啟〕按鈕連到本頁加上 `openExternalBrowser=1`（LINE 支援的參數，會改用手機預設瀏覽器打開），並附手動做法。

iPhone 的步驟文字以操作說明的 demo 為唯一來源（同一份文字），按鈕名稱以 iOS 實際的「加入」為準。

## 操作說明更新
- 「加到主畫面（iPhone）」：步驟文字改成上面的說法（含沒有「⋯」時直接點分享圖示、iPad 在右上角），附註說明頂端「安裝」按鈕、資料分開存、以及 Safari 會清掉太久沒開的網站資料而安裝後不會。
- 「加到主畫面（Android）」「安裝到電腦（Chrome）」：改成「按上方『安裝／加入主畫面』→〔立即安裝〕→ 系統的〔安裝〕」，原本選單的做法移到附註當備案。

## iPhone 主畫面名稱
`build-web.mjs` 加 `<meta name="apple-mobile-web-app-title" content="育英公托填表">`，圖示名稱不再被截斷。

## 驗收
- 單元測試：`installKind()` 各情況、頂端按鈕在兩種模式出現於正確位置、視窗內容依 kind／登入狀態。
- Playwright 驅動網頁版：模擬 iPhone UA 與 `beforeinstallprompt`。
- **實機**：用 iPhone 實際加入主畫面並在 App 裡完成一次 Google 登入（模擬測不出獨立視窗下的登入彈窗行為）。
