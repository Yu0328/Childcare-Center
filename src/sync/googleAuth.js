// GIS's *token* flow (not the One Tap ID-token flow): all this app needs is an access token for
// Drive plus a display name for the greeting. The token lives in memory only and is never
// persisted — the app has no lock of its own, so anything on disk is readable by whoever
// has the device, and a Drive-scoped token is worth far more than the local copy of the data.
// The one exception is the silent auto-update's reload — see stashForReload.
import { AuthExpiredError } from './driveClient.js';

export const SCOPES = 'openid profile https://www.googleapis.com/auth/drive.file';
export const SYNC_MODE_KEY = 'c-form-sync-mode';
export const SYNC_NAME_KEY = 'c-form-sync-name';
export const RELOAD_TOKEN_KEY = 'c-form-reload-token';
const HANDOVER_MIN_LEFT_MS = 5 * 60000;
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export function readSyncMode() {
  return localStorage.getItem(SYNC_MODE_KEY);
}

export function writeSyncMode(mode) {
  localStorage.setItem(SYNC_MODE_KEY, mode);
}

export function clearSyncMode() {
  localStorage.removeItem(SYNC_MODE_KEY);
}

export function readDisplayName() {
  return localStorage.getItem(SYNC_NAME_KEY) || '';
}

export function isOffline() {
  return navigator.onLine === false;
}

function defaultLoadGis() {
  if (window.google && window.google.accounts) return Promise.resolve(window.google);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error('GIS_LOAD_FAILED'));
    document.head.appendChild(script);
  });
}

async function defaultFetchUserInfo(token) {
  const response = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('USERINFO_FAILED');
  return response.json();
}

export function createGoogleAuth({
  clientId, loadGis = defaultLoadGis, fetchUserInfo = defaultFetchUserInfo,
}) {
  let token = null;
  let expiresAtMs = 0;
  let tokenClient = null;
  let pending = null;
  let inFlight = null;

  // Picked up and deleted in the same breath, so the token sits in storage only across the reload.
  let carriedOver = false;
  try {
    const raw = sessionStorage.getItem(RELOAD_TOKEN_KEY);
    sessionStorage.removeItem(RELOAD_TOKEN_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && saved.token && saved.expiresAtMs > Date.now()) {
      token = saved.token;
      expiresAtMs = saved.expiresAtMs;
      carriedOver = true;
    }
  } catch { /* storage blocked or garbled: start signed out, as before */ }

  async function ensureClient() {
    if (tokenClient) return tokenClient;
    const google = await loadGis();
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: response => {
        const resolve = pending;
        pending = null;
        if (!resolve) return;
        if (response && response.access_token) {
          token = response.access_token;
          // Expire a minute early so a request never leaves with a token that dies in flight.
          expiresAtMs = Date.now() + (Number(response.expires_in) || 3600) * 1000 - 60000;
          resolve(response.access_token);
        } else {
          token = null;
          expiresAtMs = 0;
          resolve(null);
        }
      },
      // A closed or blocked popup never reaches `callback` above — GIS reports it only here.
      // Without this, signIn() awaits forever: the choice screen's button stays disabled and every
      // later header click just re-awaits the same dead in-flight request.
      error_callback: () => {
        const resolve = pending;
        pending = null;
        if (resolve) resolve(null);
      },
    });
    return tokenClient;
  }

  // Warms the GIS script + token client as soon as this module is live, not lazily on first
  // click. Loading an external script (a real network fetch) takes real async time; if that
  // happens only after a click, some mobile browsers (Safari in particular) no longer consider
  // the eventual requestAccessToken() call part of that click's user gesture by the time it
  // actually runs — the popup is then silently dropped, with no error and no visible sign
  // anything happened. Warming here means a real click almost always finds tokenClient already
  // set, so requestAccessToken() fires with barely any async gap after the click.
  ensureClient().catch(() => {});

  // One request at a time: a second call while the popup is still open (a double tap on the
  // header's sign-in button) shares it instead of overwriting `pending` and leaving the first
  // caller hanging forever.
  function requestToken(options) {
    if (inFlight) return inFlight;
    inFlight = new Promise(resolve => {
      pending = resolve;
      tokenClient.requestAccessToken(options);
    }).finally(() => { inFlight = null; });
    return inFlight;
  }

  async function signIn() {
    // Checked before touching GIS: a consent popup that can't reach Google just hangs on a blank
    // sheet, which is exactly the "卡住/無反應" the design rules out.
    if (isOffline()) throw new Error('OFFLINE');
    await ensureClient();
    const fresh = await requestToken({});
    if (!fresh) throw new Error('SIGN_IN_CANCELLED');
    const profile = await fetchUserInfo(fresh);
    // given_name (first name only, no surname) for the header greeting — more reliable than
    // slicing the full name ourselves (a 複姓/compound surname like 歐陽 would slice wrong).
    // Falls back to the full name on the rare account that doesn't populate it.
    const name = (profile && (profile.given_name || profile.name)) || '';
    writeSyncMode('google');
    localStorage.setItem(SYNC_NAME_KEY, name);
    return { name };
  }

  // No silent refresh once the ~1-hour token runs out. prompt: '' still needs a popup, and from a
  // background sync (no click behind it) the browser either blocks it — sync hung until a timeout
  // — or it pops a Google window at a teacher who never asked for one. Failing straight away puts
  // up the header's "登入已失效，請重新登入" with its button, and that click opens the popup.
  // AuthExpiredError (not a generic Error) so syncEngine treats it like a 401/403 from Drive.
  async function getAccessToken() {
    if (token && Date.now() < expiresAtMs) return token;
    throw new AuthExpiredError('AUTH_REQUIRED');
  }

  function signOut() {
    // Signing out pauses syncing; it must not touch IndexedDB. This is the teacher's own device,
    // and wiping the local copy on logout would turn a "先暫停" into data loss.
    token = null;
    expiresAtMs = 0;
    clearSyncMode();
  }

  // The silent auto-update (src/pwa/updatePrompt.js) reloads the page, which would otherwise drop a
  // Google teacher onto the sign-in choice screen. Called only right before that reload; this
  // tab's sessionStorage, read and deleted by the next page at once. Too close to expiry isn't
  // worth carrying — the header would be asking to sign in again within minutes anyway.
  function stashForReload() {
    if (!token || expiresAtMs - Date.now() < HANDOVER_MIN_LEFT_MS) return;
    try {
      sessionStorage.setItem(RELOAD_TOKEN_KEY, JSON.stringify({ token, expiresAtMs }));
    } catch { /* storage blocked: the teacher just sees the choice screen */ }
  }

  return {
    signIn, getAccessToken, signOut, stashForReload,
    isSignedIn: () => Boolean(token),
    carriedOverReload: () => carriedOver,
  };
}
