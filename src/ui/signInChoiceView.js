import { readSyncMode, writeSyncMode, isOffline } from '../sync/googleAuth.js';

export function needsSignInChoice() {
  return readSyncMode() === null;
}

// Official Google "G" logomark (4-color, per Google's brand guidelines for sign-in buttons —
// must stay unmodified/unrecolored, unlike this app's other single-tone stroke icons).
const GOOGLE_ICON = `
  <svg viewBox="0 0 48 48" width="26" height="26" aria-hidden="true">
    <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/>
    <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/>
    <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34A21.93 21.93 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"/>
    <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/>
  </svg>
`;
// Deliberately a plain single person, not the two-person icon already used for 適性紀錄(家長版) —
// "guest" should look like a solitary, no-account visitor.
const GUEST_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>';
const CHEVRON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';

// Shown once, right after the password gate, and never again — the answer is remembered in
// localStorage. Guest is a first-class choice here, not a fallback: the app has always worked
// offline with manual backups and must keep doing so. Styled as the same .type-select__option
// cards as the form-select screen (just 2 cards instead of 5) so the two screens read as one
// consistent app instead of the choice screen looking like a bolted-on afterthought.
export function renderSignInChoiceView(container, { onGoogle, onGuest }) {
  container.innerHTML = `
    <div class="type-select-home">
      <h2 class="type-select-home__title">要讓資料在裝置之間自動同步嗎？</h2>
      <p class="sign-in-choice__hint">登入 Google 帳號後，這台裝置的資料會自動跟你其他裝置同步，不用再手動匯出匯入。</p>
      <hr class="type-select-home__divider">
      <div class="type-select">
        <button type="button" class="type-select__option type-select__option--brand" data-action="sign-in-google">
          <span class="type-select__icon">${GOOGLE_ICON}</span>
          <span class="type-select__text">
            <span class="type-select__title">使用 Google 登入</span>
            <span class="type-select__desc">跨裝置自動同步資料</span>
          </span>
          <span class="type-select__go" aria-hidden="true">${CHEVRON}</span>
        </button>
        <button type="button" class="type-select__option type-select__option--neutral" data-action="continue-guest">
          <span class="type-select__icon">${GUEST_ICON}</span>
          <span class="type-select__text">
            <span class="type-select__title">以訪客身份繼續</span>
            <span class="type-select__desc">僅存在本機，可手動匯出備份</span>
          </span>
          <span class="type-select__go" aria-hidden="true">${CHEVRON}</span>
        </button>
      </div>
      <p class="field-error field-error--center" data-error></p>
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
