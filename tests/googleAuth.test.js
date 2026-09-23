import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createGoogleAuth, readSyncMode, writeSyncMode, clearSyncMode, readDisplayName, SCOPES,
  RESUME_TIMEOUT_MS,
} from '../src/sync/googleAuth.js';
import { AuthExpiredError } from '../src/sync/driveClient.js';

// A stand-in for the real GIS token client: captures the callback and lets the test decide what
// Google would have answered.
function fakeGis() {
  const calls = [];
  let callback = null;
  let errorCallback = null;
  return {
    calls,
    respond: response => callback(response),
    fail: error => errorCallback(error),
    loadGis: async () => ({
      accounts: {
        oauth2: {
          initTokenClient: config => {
            callback = config.callback;
            errorCallback = config.error_callback;
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

  it('建立時就先預熱 GIS，不等到第一次點擊才載入', async () => {
    // 點擊後才第一次載入 GIS script（一次真正的網路請求）會讓點擊到彈出視窗之間隔了太久的非同步時
    // 間，手機瀏覽器（尤其 Safari）可能因此不認得這個彈出視窗還算在同一個使用者手勢裡，直接悄悄擋掉、
    // 完全沒有任何提示。預先載入是為了讓點擊當下 tokenClient 幾乎都已經準備好了。
    const loadGis = vi.fn(async () => ({
      accounts: { oauth2: { initTokenClient: () => ({ requestAccessToken: () => {} }) } },
    }));
    createGoogleAuth({ clientId: 'test-client', loadGis });

    await vi.waitFor(() => expect(loadGis).toHaveBeenCalledTimes(1));
  });

  it('使用者直接關掉 Google 登入視窗時，signIn 會結束而不是永遠卡住，之後還能再按一次', async () => {
    // GIS 在視窗被關掉／被瀏覽器擋掉時只會呼叫 error_callback，不會呼叫 callback。沒接住的話 signIn
    // 永遠不會結束：登入按鈕一直停在停用狀態，之後每次點擊也都只是在等那個永遠不會回來的請求。
    const gis = fakeGis();
    const auth = createGoogleAuth({ clientId: 'test-client', loadGis: gis.loadGis });

    const first = auth.signIn();
    await vi.waitFor(() => expect(gis.calls).toHaveLength(1));
    gis.fail({ type: 'popup_closed' });
    await expect(first).rejects.toThrow('SIGN_IN_CANCELLED');

    auth.signIn().catch(() => {});
    await vi.waitFor(() => expect(gis.calls).toHaveLength(2));
  });

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

  it('有 given_name 時優先用它當顯示名稱（不含姓，複姓也不會猜錯）', async () => {
    const gis = fakeGis();
    const auth = createGoogleAuth({
      clientId: 'test-client',
      loadGis: gis.loadGis,
      fetchUserInfo: async () => ({ name: '歐陽小美', given_name: '小美' }),
    });

    const pending = auth.signIn();
    await vi.waitFor(() => expect(gis.calls).toHaveLength(1));
    gis.respond({ access_token: 'tok-1', expires_in: 3600 });

    expect(await pending).toEqual({ name: '小美' });
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

  it('靜默續用的回呼被瀏覽器擋掉、永遠不會來時，逾時後視為續用失敗，不會卡住呼叫者', async () => {
    vi.useFakeTimers();
    try {
      const gis = fakeGis();
      writeSyncMode('google');
      const auth = createGoogleAuth({ clientId: 'test-client', loadGis: gis.loadGis });

      const pending = auth.resume(); // gis.respond(...) 故意不呼叫，模擬彈出視窗被擋、回呼永遠不會來
      await vi.advanceTimersByTimeAsync(RESUME_TIMEOUT_MS + 100);

      expect(await pending).toBe(null);
      expect(gis.calls).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('續用逾時後，接下來真的點登入仍會開一個新的請求，不會卡在被擋掉的舊請求上', async () => {
    vi.useFakeTimers();
    try {
      const gis = fakeGis();
      writeSyncMode('google');
      const auth = createGoogleAuth({
        clientId: 'test-client', loadGis: gis.loadGis, fetchUserInfo: async () => ({ name: '小美' }),
      });

      const resumePending = auth.resume();
      await vi.advanceTimersByTimeAsync(RESUME_TIMEOUT_MS + 100);
      expect(await resumePending).toBe(null);
      expect(gis.calls).toHaveLength(1);

      const signInPending = auth.signIn();
      await vi.advanceTimersByTimeAsync(0);
      expect(gis.calls).toHaveLength(2); // 新的請求，不是沿用卡住的那個
      gis.respond({ access_token: 'tok-1', expires_in: 3600 });
      expect(await signInPending).toEqual({ name: '小美' });
    } finally {
      vi.useRealTimers();
    }
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
