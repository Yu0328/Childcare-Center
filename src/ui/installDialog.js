import { lockBodyScroll, unlockBodyScroll, closeOnBackdropClick } from './formPopup.js';
import { mountDemo } from './helpDemo.js';
import { INSTALL_IPHONE_DEMO } from './helpContent.js';

const STORE = { ios: '從 App Store 下載', android: '從 Play 商店下載', desk: '另外下載' };

// What the header's 加入主畫面／安裝 button opens, every time: why it's worth it, then how.
// kind: 'ios' (instructions only — iPhone never lets a page install itself), 'prompt' (one tap
// into the browser's own install window), or 'line' (LINE's in-app browser can't install at all).
export function openInstallDialog({ kind, guest, device, onInstall, lineUrl }) {
  const onPhone = device !== 'desk';
  const dialog = document.createElement('dialog');
  dialog.className = 'form-popup form-popup--wide install-dialog';
  dialog.innerHTML = `
    <button type="button" class="form-popup__close" data-action="close-form-popup" aria-label="關閉">×</button>
    <div class="entry-form install-dialog__body">
      <h3 class="install-dialog__title">安裝到主畫面</h3>
      <p>安裝後，育英公托填表系統會像一般 App 一樣出現在${onPhone ? '手機主畫面' : '電腦桌面'}。點圖示就能直接打開，不用再開瀏覽器找網址，畫面也會${onPhone ? '用滿整個螢幕' : '比較大'}，填表時看得更清楚。</p>
      <p>這不是${STORE[device]}的程式，而是把這個網站加到${onPhone ? '主畫面' : '電腦'}上。它幾乎不佔空間，也不會要求任何額外的權限。</p>
      ${kind === 'ios'
        ? `<p class="install-dialog__note">${guest
          ? 'iPhone 上安裝後的 App 和 Safari 是分開存資料的。請先按「備份 → 匯出備份」，裝好後在 App 裡「匯入備份」，就能把資料完整帶過去。'
          : '安裝後用同一個 Google 帳號登入，資料會自動同步過來。'}</p>
          <article class="help-demo"></article>`
        : ''}
      ${kind === 'line'
        ? `<p>目前是在 LINE 裡打開的，LINE 裡沒辦法直接安裝。請按下面的按鈕改用瀏覽器打開，再按一次「安裝」。</p>
          <p class="install-dialog__hint">按了沒反應的話：點 LINE 畫面角落的「⋯」選單，選「用 Safari 開啟」或「用瀏覽器開啟」。</p>`
        : ''}
      <div class="entry-form__actions install-dialog__actions">
        ${kind === 'prompt' ? '<button type="button" class="btn btn--primary" data-install-action="prompt">立即安裝</button>' : ''}
        ${kind === 'line' ? '<a class="btn btn--primary" data-install-action="open-browser">用瀏覽器開啟</a>' : ''}
        <button type="button" class="btn btn--ghost" data-install-action="close">${kind === 'prompt' ? '取消' : '我知道了'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);
  // Set as an attribute, not interpolated: the URL comes from location, which a visitor controls.
  dialog.querySelector('[data-install-action="open-browser"]')?.setAttribute('href', lineUrl);

  // The same demo the 操作說明 plays, so the steps here and there never drift apart.
  const demoEl = dialog.querySelector('.help-demo');
  const demo = demoEl && mountDemo(demoEl, { ...INSTALL_IPHONE_DEMO, title: '跟著以下步驟，大約 10 秒就能完成', note: '' }, {
    mode: 'phone',
    reduced: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  });

  const close = () => dialog.close();
  dialog.querySelector('[data-install-action="prompt"]')?.addEventListener('click', () => {
    close();
    onInstall();
  });
  dialog.querySelector('[data-install-action="close"]').addEventListener('click', close);
  dialog.querySelector('[data-action="close-form-popup"]').addEventListener('click', close);
  closeOnBackdropClick(dialog);
  dialog.addEventListener('close', () => {
    demo?.destroy();
    unlockBodyScroll();
    dialog.remove();
  });
  dialog.showModal();
  lockBodyScroll();
}
