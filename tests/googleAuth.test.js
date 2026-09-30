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

  it('token 過期時直接要求重新登入，不在背景自己開 Google 視窗', async () => {
    const gis = fakeGis();
    const auth = createGoogleAuth({ clientId: 'test-client', loadGis: gis.loadGis, fetchUserInfo: async () => ({ name: '小美' }) });
    const first = auth.signIn();
    await vi.waitFor(() => expect(gis.calls).toHaveLength(1));
    gis.respond({ access_token: 'tok-1', expires_in: -1 }); // already-expired token
    await first;

    await expect(auth.getAccessToken()).rejects.toBeInstanceOf(AuthExpiredError);
    expect(gis.calls).toHaveLength(1); // only the sign-in click's own request — no background popup
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
