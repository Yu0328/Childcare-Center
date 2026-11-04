import { lockBodyScroll, unlockBodyScroll, closeOnBackdropClick } from './formPopup.js';
import { CENTER } from '../centers.js';

export const MONTHLY_PLAN_NOTICE_KEY = `${CENTER.storagePrefix}-monthly-plan-per-child-notice`;

// Shown once per device, on the 課程月計畫 list, to teachers who used 月計畫 before items became
// per-child (2026-11). Someone with no plans yet never knew the old way, so they just get the flag.
// The flag is written as soon as it opens, so a re-render of the list can't show it twice.
// ponytail: remove this file (and its call in monthlyPlanListView.js) once every centre has seen it.
export function maybeShowMonthlyPlanNotice({ hasPlans, storage = localStorage }) {
  if (storage.getItem(MONTHLY_PLAN_NOTICE_KEY)) return;
  storage.setItem(MONTHLY_PLAN_NOTICE_KEY, '1');
  if (!hasPlans) return;

  const dialog = document.createElement('dialog');
  dialog.className = 'form-popup form-popup--wide install-dialog';
  dialog.innerHTML = `
    <button type="button" class="form-popup__close" data-action="close-form-popup" aria-label="關閉">×</button>
    <div class="entry-form install-dialog__body">
      <h3 class="install-dialog__title">月計畫的排課方式改了</h3>
      <p>從這一版開始，每位幼兒的月計畫都是各自獨立的。在誰的月曆上新增、修改、刪除，都只會改到那位幼兒。</p>
      <p><b>想讓其他幼兒照著排？</b></p>
      <ol>
        <li>先把一位幼兒的月計畫排好</li>
        <li>切換到另一位幼兒，按上方的「套用其他幼兒月計畫」（手機上顯示「套用」）</li>
        <li>選要照著排的幼兒，按「套用」</li>
      </ol>
      <p><b>小提醒</b></p>
      <ul>
        <li>套用會把這位幼兒原本的安排整個換掉，換掉之前會先告訴您有幾筆。</li>
        <li>「未達成」「請假／其他活動代替」不會跟著複製，請再依每位幼兒的狀況勾選。</li>
        <li>原本的「指定新增」已經拿掉了。要幫幼兒補課，直接在他自己的月曆上新增就可以。</li>
        <li>之前排好的月計畫都還在，內容沒有變。</li>
      </ul>
      <div class="entry-form__actions install-dialog__actions">
        <button type="button" class="btn btn--primary" data-action="close-notice">我知道了</button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);
  const close = () => dialog.close();
  dialog.querySelector('[data-action="close-notice"]').addEventListener('click', close);
  dialog.querySelector('[data-action="close-form-popup"]').addEventListener('click', close);
  closeOnBackdropClick(dialog);
  dialog.addEventListener('close', () => {
    unlockBodyScroll();
    dialog.remove();
  });
  dialog.showModal();
  lockBodyScroll();
}
