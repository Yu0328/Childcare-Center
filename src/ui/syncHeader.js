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
    return status.textSyncedAt ? '同步中…' : '首次同步中，可能需要幾分鐘，請稍候…';
  }
  // A single rolled-up time would claim the photos made it too. Kept short for the mobile header
  // row — the honest "still missing photos" fact matters more here than the exact text-sync time.
  if (status.photoPending > 0) {
    return `照片同步失敗（剩 ${status.photoPending} 張）`;
  }
  if (status.error === 'NETWORK') return '同步失敗，稍後會自動重試';
  if (status.textSyncedAt) return `上次同步：${clockTime(status.textSyncedAt)}`;
  return '';
}

const PERSISTENT_ERRORS = new Set(['AUTH_EXPIRED', 'FORMAT']);

// Drives the status light and text color: orange while syncing, red on any failure (including
// partial photo failure), green once a sync has actually succeeded, or no light before the first sync.
function syncLightState(status) {
  if (status.phase === 'syncing') return 'syncing';
  if (status.error || status.photoPending > 0) return 'error';
  if (status.textSyncedAt) return 'ok';
  return null;
}

// The greeting sits on its own row above the status/action row (rather than sharing it with the
// status text) so a long status message never crowds it — see docs/superpowers/specs et al. for
// the original "同步和用戶名差那欄會讓按鈕跑掉" report. Google mode greets by the account's given
// name; guest mode still gets the same row with a generic "訪客" placeholder rather than skipping
// it, so the header keeps the same two-row shape either way. On wide screens the two rows collapse
// into one (see the min-width media query in styles.css) since there's room for it there.
export function renderSyncHeader(slot, { mode, name, status, onSignIn, onSignOut, onSyncNow, now = () => new Date() }) {
  const greeting = `<span class="sync-header__greeting" data-sync-greeting>${escapeHtml(`${greetingFor(now())}，${mode === 'google' ? name : '訪客'}`)}</span>`;

  if (mode === 'google') {
    slot.innerHTML = `
      <div class="sync-header__greeting-row">${greeting}</div>
      <div class="sync-header__status-row">
        <span class="sync-header__status" data-sync-status></span>
        <div class="sync-header__actions">
          <button type="button" class="btn btn--header btn--ghost" data-action="sync-now" title="檢查另一台裝置是否有新資料">立即同步</button>
          <button type="button" class="btn btn--header btn--ghost" data-action="sync-sign-out">登出</button>
        </div>
      </div>
    `;
    slot.querySelector('[data-action="sync-sign-out"]').addEventListener('click', onSignOut);
    slot.querySelector('[data-action="sync-now"]').addEventListener('click', () => onSyncNow && onSyncNow());
  } else {
    // Guest mode has no cloud copy of its own, so the local export/import backup buttons — pointless
    // once Google sync covers that — live here instead. The sign-in button sits on the greeting row
    // rather than the status row: pairing each line of text with its own single-line button group
    // (greeting+sign-in, status+backup buttons) keeps mobile to two tight rows instead of three.
    slot.innerHTML = `
      <div class="sync-header__greeting-row">
        ${greeting}
        <button type="button" class="btn btn--header" data-action="sync-sign-in">使用 Google 登入</button>
      </div>
      <div class="sync-header__status-row">
        <span class="sync-header__status" data-sync-status></span>
        <div class="sync-header__actions">
          <button type="button" class="btn btn--header" id="export-backup" title="此備份檔為未加密的完整資料（含幼兒姓名、出生日期等個資），請勿放在共用雲端資料夾">匯出備份</button>
          <label class="btn btn--header btn--header-file">匯入備份 <input type="file" id="import-backup" accept="application/json"></label>
        </div>
      </div>
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
    // Drives the blinking status light and matching text color (green/orange/red) instead of a
    // spinner — a steadier signal than an animated spin that some browsers render as frozen.
    const light = syncLightState(nextStatus);
    if (light) statusEl.dataset.syncLight = light;
    else delete statusEl.dataset.syncLight;
    // Marked so styles.css can render it as a standing warning rather than something that fades;
    // an expired login is only fixable by the teacher and must not disappear on its own.
    if (PERSISTENT_ERRORS.has(nextStatus.error)) statusEl.dataset.persistent = 'true';
    else delete statusEl.dataset.persistent;
  }

  update(status);
  return { update };
}
