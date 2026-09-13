// GIS's *token* flow (not the One Tap ID-token flow): all this app needs is an access token for
// Drive plus a display name for the greeting. The token lives in memory only and is never
// persisted — the password gate is a soft deterrent, so anything on disk is readable by whoever
// has the device, and a Drive-scoped token is worth far more than the local copy of the data.
import { AuthExpiredError } from './driveClient.js';

export const SCOPES = 'openid profile https://www.googleapis.com/auth/drive.file';
export const SYNC_MODE_KEY = 'c-form-sync-mode';
export const SYNC_NAME_KEY = 'c-form-sync-name';

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
    const name = (profile && profile.name) || '';
    writeSyncMode('google');
    localStorage.setItem(SYNC_NAME_KEY, name);
    return { name };
  }

  // prompt: '' asks for a token without showing anything, which works while Google still has a
  // live session and consent on file. A null return is the "登入已失效，請重新登入" case.
  async function resume() {
    if (readSyncMode() !== 'google') return null;
    if (isOffline()) return null;
    await ensureClient();
    const fresh = await requestToken({ prompt: '' });
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
