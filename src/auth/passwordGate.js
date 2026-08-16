// A single shared password gates access to the app. This is a soft deterrent against casual
// visitors stumbling onto the page, not real security — the hash below is visible to anyone who
// reads the bundled source, and no child data ever leaves the browser regardless of this gate
// (see docs/superpowers/specs). Change PASSWORD_HASH (sha256 hex of the new password) to rotate it.
const PASSWORD_HASH = '8b6df4f9e8e67435e95067446f5d2e6fca575320befc4701b3a068e51e4ed420';
const UNLOCK_STORAGE_KEY = 'c-form-unlocked';

export async function hashPassword(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function isUnlocked() {
  return localStorage.getItem(UNLOCK_STORAGE_KEY) === PASSWORD_HASH;
}

export function unlock() {
  localStorage.setItem(UNLOCK_STORAGE_KEY, PASSWORD_HASH);
}

export function renderPasswordGate(container, { onUnlock }) {
  container.innerHTML = `
    <div class="password-gate">
      <form class="panel-form" data-action="unlock">
        <h3 class="panel-form__title">請輸入密碼</h3>
        <label class="panel-form__field">密碼 <input type="password" data-field="password" autocomplete="current-password" required></label>
        <button type="submit" class="btn btn--primary">進入</button>
        <p class="field-error" data-error></p>
        <p class="password-gate__notice">此密碼僅防止他人誤入，無法保護裝置上已儲存的資料，請同時鎖定電腦或平板。</p>
      </form>
    </div>
  `;

  container.querySelector('[data-action="unlock"]').addEventListener('submit', async event => {
    event.preventDefault();
    const input = container.querySelector('[data-field="password"]');
    const errorEl = container.querySelector('[data-error]');
    const enteredHash = await hashPassword(input.value);

    if (enteredHash === PASSWORD_HASH) {
      unlock();
      onUnlock();
    } else {
      errorEl.textContent = '密碼錯誤，請再試一次';
      input.value = '';
      input.focus();
    }
  });
}
