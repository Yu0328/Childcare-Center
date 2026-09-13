import { isOffline } from '../sync/googleAuth.js';
import { escapeHtml } from './escapeHtml.js';

export function greetingFor(date) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return '早安';
  if (hour >= 12 && hour < 18) return '午安';
  return '晚安';
}

// The clock time comes from the *cloud's* timestamp, not Date.now(): a device whose clock has
// drifted would otherwise print a sync time that never happened.
function clockTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatSyncStatus(status) {
  if (status.error === 'AUTH_EXPIRED') return '登入已失效，請重新登入';
  if (status.error === 'FORMAT') return '雲端資料夾異常，已停止同步';
  // A first sync on a device with existing data can mean many round-trips to Drive; the plain
  // "同步中…" that's accurate for a normal quick sync reads as stuck when it runs for minutes.
  if (status.phase === 'syncing') {
    return status.textSyncedAt ? '同步中…' : '首次同步中，資料量較多時可能需要幾分鐘，請不要關閉視窗…';
  }
  // A single rolled-up time would claim the photos made it too. Splitting them is the difference
  // between an honest status and one that quietly loses a teacher's photos.
  if (status.photoPending > 0) {
    return `文字資料：${clockTime(status.textSyncedAt)}　照片：同步失敗，還有 ${status.photoPending} 張未上傳`;
  }
  if (status.error === 'NETWORK') return '同步失敗，稍後會自動重試';
  if (status.textSyncedAt) return `上次同步：${clockTime(status.textSyncedAt)}`;
  return '';
}

const PERSISTENT_ERRORS = new Set(['AUTH_EXPIRED', 'FORMAT']);

export function renderSyncHeader(slot, { mode, name, status, onSignIn, onSignOut, onSyncNow, now = () => new Date() }) {
  if (mode === 'google') {
    slot.innerHTML = `
      <span class="sync-header__greeting" data-sync-greeting>${escapeHtml(`${greetingFor(now())}，${name}`)}</span>
      <span class="sync-header__status" data-sync-status></span>
      <button type="button" class="btn btn--header btn--ghost" data-action="sync-now" title="檢查另一台裝置是否有新資料">立即同步</button>
      <button type="button" class="btn btn--header btn--ghost" data-action="sync-sign-out">登出</button>
    `;
    slot.querySelector('[data-action="sync-sign-out"]').addEventListener('click', onSignOut);
    slot.querySelector('[data-action="sync-now"]').addEventListener('click', () => onSyncNow && onSyncNow());
  } else {
    slot.innerHTML = `
      <button type="button" class="btn btn--header" data-action="sync-sign-in">使用 Google 登入</button>
      <span class="sync-header__status" data-sync-status></span>
    `;
    slot.querySelector('[data-action="sync-sign-in"]').addEventListener('click', async () => {
      const el = slot.querySelector('[data-sync-status]');
      if (isOffline()) {
        el.textContent = '目前離線，暫時無法登入';
        return;
      }
      el.textContent = '';
      await onSignIn();
    });
  }

  const statusEl = slot.querySelector('[data-sync-status]');

  function update(nextStatus) {
    statusEl.textContent = formatSyncStatus(nextStatus);
    // Drives the CSS spinner — the only visible sign a multi-minute first sync is alive, not stuck.
    if (nextStatus.phase === 'syncing') statusEl.dataset.syncing = 'true';
    else delete statusEl.dataset.syncing;
    // Marked so styles.css can render it as a standing warning rather than something that fades;
    // an expired login is only fixable by the teacher and must not disappear on its own.
    if (PERSISTENT_ERRORS.has(nextStatus.error)) statusEl.dataset.persistent = 'true';
    else delete statusEl.dataset.persistent;
  }

  update(status);
  return { update };
}
