import { readSyncMode, writeSyncMode, isOffline } from '../sync/googleAuth.js';

export function needsSignInChoice() {
  return readSyncMode() === null;
}

// Shown once, right after the password gate, and never again — the answer is remembered in
// localStorage. Guest is a first-class choice here, not a fallback: the app has always worked
// offline with manual backups and must keep doing so.
export function renderSignInChoiceView(container, { onGoogle, onGuest }) {
  container.innerHTML = `
    <div class="sign-in-choice">
      <h2 class="sign-in-choice__title">要讓資料在裝置之間自動同步嗎？</h2>
      <p class="sign-in-choice__hint">登入 Google 帳號後，這台裝置的資料會自動跟你其他裝置同步，不用再手動匯出匯入。</p>
      <button type="button" class="btn btn--primary" data-action="sign-in-google">使用 Google 登入</button>
      <button type="button" class="btn btn--outline" data-action="continue-guest">以訪客身份繼續</button>
      <p class="field-error" data-error></p>
    </div>
  `;

  const googleButton = container.querySelector('[data-action="sign-in-google"]');
  const errorEl = container.querySelector('[data-error]');

  googleButton.addEventListener('click', async () => {
    if (isOffline()) {
      errorEl.textContent = '目前離線，暫時無法登入';
      return;
    }
    errorEl.textContent = '';
    googleButton.disabled = true;
    try {
      await onGoogle();
    } catch (err) {
      errorEl.textContent = '登入失敗，請再試一次';
    } finally {
      googleButton.disabled = false;
    }
  });

  container.querySelector('[data-action="continue-guest"]').addEventListener('click', () => {
    writeSyncMode('guest');
    onGuest();
  });
}
