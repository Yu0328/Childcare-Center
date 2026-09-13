import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createGoogleAuth, readSyncMode, writeSyncMode, clearSyncMode, readDisplayName, SCOPES,
} from '../src/sync/googleAuth.js';
import { AuthExpiredError } from '../src/sync/driveClient.js';

// A stand-in for the real GIS token client: captures the callback and lets the test decide what
// Google would have answered.
function fakeGis() {
  const calls = [];
  let callback = null;
  return {
    calls,
    respond: response => callback(response),
    loadGis: async () => ({
      accounts: {
        oauth2: {
          initTokenClient: config => {
            callback = config.callback;
            return { requestAccessToken: options => calls.push(options || {}) };
          },
        },
      },
    }),
  };
}

describe('登入方式記憶', () => {
  beforeEach(() => localStorage.clear());

  it('沒選過時是 null，選過之後記住', () => {
    expect(readSyncMode()).toBe(null);
    writeSyncMode('guest');
    expect(readSyncMode()).toBe('guest');
    clearSyncMode();
    expect(readSyncMode()).toBe(null);
  });
});

describe('createGoogleAuth', () => {
  beforeEach(() => localStorage.clear());

  it('離線時 signIn 直接失敗，不去打 Google', async () => {
    const gis = fakeGis();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const auth = createGoogleAuth({ clientId: 'test-client', loadGis: gis.loadGis });

    await expect(auth.signIn()).rejects.toThrow('OFFLINE');
    expect(gis.calls).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it('登入成功後記住模式與顯示名稱，並拿得到 token', async () => {
    const gis = fakeGis();
    const auth = createGoogleAuth({
      clientId: 'test-client',
      loadGis: gis.loadGis,
      fetchUserInfo: async () => ({ name: '小美' }),
    });

    const pending = auth.signIn();
    await vi.waitFor(() => expect(gis.calls).toHaveLength(1));
    gis.respond({ access_token: 'tok-1', expires_in: 3600 });

    expect(await pending).toEqual({ name: '小美' });
    expect(auth.isSignedIn()).toBe(true);
    expect(await auth.getAccessToken()).toBe('tok-1');
    expect(readSyncMode()).toBe('google');
    expect(readDisplayName()).toBe('小美');
  });

  it('要求的 scope 含 drive.file 與 profile', () => {
    expect(SCOPES).toContain('https://www.googleapis.com/auth/drive.file');
    expect(SCOPES).toContain('profile');
  });

  it('沒有 token 時 getAccessToken 要求重新登入', async () => {
    const gis = fakeGis();
    const auth = createGoogleAuth({ clientId: 'test-client', loadGis: gis.loadGis });
    await expect(auth.getAccessToken()).rejects.toThrow('AUTH_REQUIRED');
  });

  it('resume 在上次是訪客模式時不做任何事', async () => {
    const gis = fakeGis();
    writeSyncMode('guest');
    const auth = createGoogleAuth({ clientId: 'test-client', loadGis: gis.loadGis });
    expect(await auth.resume()).toBe(null);
    expect(gis.calls).toHaveLength(0);
  });

  it('resume 用靜默模式取 token；被收回授權時回 null', async () => {
    const gis = fakeGis();
    writeSyncMode('google');
    localStorage.setItem('c-form-sync-name', '小美');
    const auth = createGoogleAuth({ clientId: 'test-client', loadGis: gis.loadGis });

    const pending = auth.resume();
    await vi.waitFor(() => expect(gis.calls).toHaveLength(1));
    expect(gis.calls[0].prompt).toBe('');
    gis.respond({ error: 'access_denied' });

    expect(await pending).toBe(null);
    expect(auth.isSignedIn()).toBe(false);
  });

  it('token 過期時多個併發 getAccessToken 共用同一次 refresh，全部都會拿到結果', async () => {
    const gis = fakeGis();
    const auth = createGoogleAuth({
      clientId: 'test-client',
      loadGis: gis.loadGis,
      fetchUserInfo: async () => ({ name: '小美' }),
    });
    const first = auth.signIn();
    await vi.waitFor(() => expect(gis.calls).toHaveLength(1));
    gis.respond({ access_token: 'tok-1', expires_in: -1 }); // already-expired token
    await first;

    // Five concurrent callers (driveClient's MAX_CONCURRENCY) all see an expired token and all
    // trigger a refresh at once; only one GIS request should go out, and every caller must resolve.
    const calls = Array.from({ length: 5 }, () => auth.getAccessToken());
    await vi.waitFor(() => expect(gis.calls).toHaveLength(2));
    expect(gis.calls).toHaveLength(2); // one for signIn, exactly one shared refresh — not five
    gis.respond({ access_token: 'tok-2', expires_in: 3600 });

    await expect(Promise.all(calls)).resolves.toEqual(['tok-2', 'tok-2', 'tok-2', 'tok-2', 'tok-2']);
  });

  it('靜默續用失敗時丟出的是 AuthExpiredError，而不是一般 Error', async () => {
    const gis = fakeGis();
    writeSyncMode('google');
    const auth = createGoogleAuth({ clientId: 'test-client', loadGis: gis.loadGis });

    const pending = auth.getAccessToken();
    await vi.waitFor(() => expect(gis.calls).toHaveLength(1));
    gis.respond({ error: 'access_denied' });

    await expect(pending).rejects.toBeInstanceOf(AuthExpiredError);
  });

  it('登出只清掉 token 與登入模式', async () => {
    const gis = fakeGis();
    const auth = createGoogleAuth({
      clientId: 'test-client', loadGis: gis.loadGis, fetchUserInfo: async () => ({ name: '小美' }),
    });
    const pending = auth.signIn();
    await vi.waitFor(() => expect(gis.calls).toHaveLength(1));
    gis.respond({ access_token: 'tok-1', expires_in: 3600 });
    await pending;

    auth.signOut();
    expect(auth.isSignedIn()).toBe(false);
    expect(readSyncMode()).toBe(null);
  });
});
