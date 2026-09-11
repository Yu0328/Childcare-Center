# 手機版「新增」表單改為彈出視窗 — 設計文件

日期：2026-09-11

## 背景與問題

手機版目前是「列表在上、新增表單在下」（`.tab-layout` 在 640px 斷點收成單欄）。
使用者要新增資料時得往下滑到表單，填完送出後列表又跳到最上面，要再滑下去確認剛才
新增的內容——來回滑動的成本隨列表變長而增加。

本次需求：手機版把「新增」表單改成預設隱藏的彈出視窗，由畫面右下角固定的圓形「＋」
按鈕開啟；使用者填到一半想先關掉視窗查看列表，內容不會被清空。電腦版不受影響（表單
仍原地顯示在列表旁邊，不出現「＋」按鈕）。

## 範圍

以下 8 個「列表在上、新增表單在下」的畫面套用本次改動：

| 檔案 | 表單 `data-action` | 標題 |
|---|---|---|
| `src/ui/childListView.js` | `add-child` | 新增幼兒 |
| `src/ui/formListView.js` | `add-form` | 新增適性總表 |
| `src/ui/monthlyPlanListView.js` | `add-plan` | 新增課程月計畫 |
| `src/ui/parentReportListView.js` | `add-report` | 新增適性紀錄 |
| `src/ui/courseplanTabView.js` | `add-entry` | 新增課程計畫項目 |
| `src/ui/developmentRecordTabView.js` | `add-record` | 新增段落 |
| `src/ui/behaviorObservationTabView.js` | `add-observation` | 新增行為觀察 |
| `src/ui/highlightsTabView.js` | `add-highlight` | 新增點滴分享 |

不涵蓋（明確排除，留待之後另外討論）：

- **編輯既有項目**：8 個畫面裡除了 `developmentRecordTabView.js` 既有的卡片內行內編輯
  外，其餘畫面的編輯都是切到獨立編輯頁面，不是本次「新增表單」問題的一部分。
- **`monthlyPlanEditorView.js`**（月計畫的月曆＋側邊面板）：架構跟上述 8 個畫面不同
  （不是「列表＋新增表單」），使用者已明確要求另開討論。
- 桌面版畫面與互動完全不變。

## 架構：共用模組 `src/ui/formPopup.js`

新增一個共用模組，兩個匯出函式：

```js
const MOBILE_QUERY = '(max-width: 640px)';
const isMobile = () => typeof matchMedia === 'function' && matchMedia(MOBILE_QUERY).matches;

// 包住既有的 <form> markup；桌面版帶 open 屬性（等同今天的原地顯示），
// 手機版預設不開，改由 FAB 開啟。
export function formPopupMarkup({ formHtml, fabLabel }) { … }

// container.innerHTML 設定完成後呼叫，綁定 FAB／關閉按鈕／點背景關閉。
export function wireFormPopup(container) { … }
```

`formPopupMarkup` 產生的結構：

```html
<dialog class="form-popup" open>  <!-- 手機版時沒有 open -->
  <button type="button" class="form-popup__close" data-action="close-form-popup" aria-label="關閉">×</button>
  <!-- 原本的 <form class="panel-form" data-action="…"> 原封不動放在這裡 -->
</dialog>
<button type="button" class="fab" data-action="open-form-popup" aria-label="新增幼兒">＋</button>
<!-- FAB 只在手機版渲染 -->
```

`wireFormPopup` 綁定行為：

```js
export function wireFormPopup(container) {
  const dialog = container.querySelector('.form-popup');
  container.querySelector('[data-action="open-form-popup"]')?.addEventListener('click', () => dialog.showModal());
  container.querySelector('[data-action="close-form-popup"]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }); // 點背景關閉
}
```

**8 個畫面各自的改動**：在既有 render 函式的樣板字串中，把原本直接寫出的
`<form class="panel-form" data-action="…">…</form>` 改成用 `formPopupMarkup({ formHtml: `…`, fabLabel: '…' })`
包一層；`container.innerHTML = …` 之後，在既有的 `container.querySelector('[data-action="add-…"]').addEventListener('submit', …)`
旁邊多加一行 `wireFormPopup(container);`。表單欄位、驗證、送出後的處理**完全不動**。

## 為什麼「關閉不清空內容」不用另外寫狀態管理

`dialog.close()` 只是把元素隱藏，不會把 DOM 移除或重建，所以使用者打到一半的欄位值
本來就還在原本的 DOM 節點上，重新 `showModal()` 打開時會直接看到剛剛打的內容——不需要
另外把欄位值存到一份 JS 狀態物件裡、關閉前存起來、打開時再回填。

會清空的唯一情況是「送出成功」：8 個畫面的送出處理程式本來就會呼叫自己的 render 函式
整頁重繪列表（把新項目加進去），這會連帶把 `<dialog>` 重建成空白的——這正是「準備填下
一筆前表單該清空」的預期行為，不算違反「關閉不清空」的原則（那條原則只針對「使用者主
動關閉、還沒送出」的情境）。

## 樣式

`.form-popup`（`<dialog>` 本身瀏覽器預設有置中定位與 `::backdrop` 遮罩，只需要疊加卡片
外觀）：

```css
.form-popup {
  border: none;
  border-radius: 12px;
  padding: 1rem;
  width: min(90vw, 420px);
}
.form-popup::backdrop {
  background: rgba(0, 0, 0, 0.4);
}
.form-popup__close {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
}
```

`.fab`（跟既有 `.btn--primary` 同色系，固定在右下角）：

```css
@media (max-width: 640px) {
  .fab {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--brand);
    color: #fff;
    font-size: 1.5rem;
    border: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    z-index: 10;
  }
}
```

## 已知簡化（明確排除，非遺漏）

- **視窗開著時轉螢幕方向／resize 跨越 640px 斷點**：`open` 屬性是渲染當下依 `matchMedia`
  判斷一次決定的，不會動態跟著視窗大小即時切換。這個 app 是操作用工具，不預期使用者會
  在填表過程中大幅改變視窗寬度，先不處理，之後真的有人反應再加 `resize` 監聽。
- **`<dialog>` 瀏覽器支援度**：現代 iOS Safari／Chrome 都支援，不特別做 polyfill。

## 測試

1. `npx vitest run tests/` — 確認 8 個畫面既有測試在表單被包進 `<dialog>` 後，
   既有的 `container.querySelector('[data-action="…"]')` 等選取邏輯不受影響（`<dialog>`
   不影響子元素的 CSS selector 命中）。
2. Playwright（`devices['iPhone 13']` 模擬）：點 FAB 開啟、確認表單欄位可見且可填寫、
   打字後點背景關閉、重新點 FAB 打開確認內容還在、送出成功後確認視窗清空並關閉、新項目
   出現在列表。
3. Playwright（桌面尺寸）：確認 FAB 不出現、表單一如既往顯示在列表旁邊。
