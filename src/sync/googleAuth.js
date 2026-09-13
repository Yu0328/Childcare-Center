// GIS's *token* flow (not the One Tap ID-token flow): all this app needs is an access token for
// Drive plus a display name for the greeting. The token lives in memory only and is never
// persisted — the password gate is a soft deterrent, so anything on disk is readable by whoever
// has the device, and a Drive-scoped token is worth far more than the local copy of the data.
import { AuthExpiredError } from './driveClient.js';

export const SCOPES = 'openid profile https://www.googleapis.com/auth/drive.file';
export const SYNC_MODE_KEY = 'c-form-sync-mode';
export const SYNC_NAME_KEY = 'c-form-sync-name';
// A silent resume (prompt: '') runs automatically on page load, with no click behind it. If the
// browser's popup blocker (or a missing third-party-cookie session) swallows GIS's attempt, GIS
// can fail to ever invoke its callback, and gate() awaits that promise forever — a permanently
// blank header with no sign-in button, on the very reload that should show one. This bounds the
// wait so a swallowed silent attempt falls back to the existing "登入已失效，請重新登入" state,
// which does offer a button — one a real click can open a popup from.
//
// NOT kept short: "prompt: ''" is a request for silence, not a guarantee of it — when Google
// can't confirm the session invisibly, it can still open a real, visible popup asking the person
// to pick/confirm an account, same as an explicit sign-in. A too-short timeout cancels that popup
// out from under a person who is genuinely in the middle of using it (confirmed in practice: a
// real popup appeared, but wasn't finished within the old 3s value, and the attempt was killed).
// Long enough for a person to actually see and use a popup; still finite so a truly swallowed,
// silently-blocked attempt eventually recovers instead of hanging forever.
export const RESUME_TIMEOUT_MS = 60000;

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

  // driveClient runs up to MAX_CONCURRENCY requests in parallel, and each one awaits
  // getAccessToken() independently. Without caching the in-flight refresh, a token expiring
  // mid-batch would have every concurrent caller overwrite `pending` in turn, so only the last
  // one's promise would ever resolve and the rest would hang forever.
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

  // prompt: '' asks for a token without showing anything, which works while Google still has a
  // live session and consent on file. A null return is the "登入已失效，請重新登入" case — the
  // same case a swallowed/blocked silent attempt is forced into once RESUME_TIMEOUT_MS passes.
  async function resume() {
    if (readSyncMode() !== 'google') return null;
    if (isOffline()) return null;
    await ensureClient();
    const attempt = requestToken({ prompt: '' });
    const timedOut = await Promise.race([
      attempt.then(() => false),
      new Promise(resolve => setTimeout(() => resolve(true), RESUME_TIMEOUT_MS)),
    ]);
    if (timedOut) {
      // The GIS call itself may be permanently stuck (its popup blocked, no callback ever
      // coming). Forget it so the next request — in particular a real, click-driven signIn() —
      // opens a fresh popup instead of awaiting this one forever too.
      inFlight = null;
      pending = null;
      return null;
    }
    const fresh = await attempt;
    if (!fresh) return null;
    return { name: readDisplayName() };
  }

  async function getAccessToken() {
    if (token && Date.now() < expiresAtMs) return token;
    const refreshed = await resume();
    // Thrown as AuthExpiredError (not a generic Error) so syncEngine's catch recognizes a failed
    // silent resume the same way it recognizes a 401/403 from Drive, and surfaces the persistent
    // "登入已失效，請重新登入" warning instead of a generic network-failure message.
    if (!refreshed || !token) throw new AuthExpiredError('AUTH_REQUIRED');
    return token;
  }

  function signOut() {
    // Signing out pauses syncing; it must not touch IndexedDB. This is the teacher's own device,
    // and wiping the local copy on logout would turn a "先暫停" into data loss.
    token = null;
    expiresAtMs = 0;
    clearSyncMode();
  }

  return { signIn, resume, getAccessToken, signOut, isSignedIn: () => Boolean(token) };
}
