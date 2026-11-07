// Served in place of https://accounts.google.com/gsi/client during recordings. Draws a plain
// demo-account chooser (no Google artwork) and hands the app a fake token when the account is clicked.
(() => {
  const css = `
    #fake-gis { position: fixed; inset: 0; z-index: 2147483000; display: flex; align-items: center; justify-content: center;
      background: rgba(20,24,22,.45); font-family: "Microsoft JhengHei", system-ui, sans-serif; }
    #fake-gis .box { width: min(420px, 88vw); background: #fff; border-radius: 16px; padding: 28px 24px 20px; box-shadow: 0 12px 40px rgba(0,0,0,.25); }
    #fake-gis h2 { margin: 0 0 6px; font-size: 24px; color: #1f2422; text-align: center; }
    #fake-gis p { margin: 0 0 20px; font-size: 15px; color: #55605c; text-align: center; }
    #fake-gis [data-fake-account] { display: flex; align-items: center; gap: 14px; width: 100%; padding: 12px; border: 1px solid #dde3e0;
      border-radius: 12px; background: #fff; cursor: pointer; text-align: left; font: inherit; }
    #fake-gis [data-fake-account]:hover { background: #f4f7f6; }
    #fake-gis .avatar { width: 40px; height: 40px; border-radius: 50%; background: #2a78d6; color: #fff; display: flex;
      align-items: center; justify-content: center; font-size: 18px; font-weight: 700; flex: none; }
    #fake-gis b { display: block; font-size: 16px; color: #1f2422; }
    #fake-gis small { font-size: 13px; color: #6b7672; }
  `;

  function initTokenClient({ scope, callback }) {
    return {
      requestAccessToken() {
        const style = document.createElement('style');
        style.textContent = css;
        const modal = document.createElement('div');
        modal.id = 'fake-gis';
        modal.innerHTML = `<div class="box"><h2>選擇帳戶</h2><p>以繼續使用 育英公托填表系統</p>
          <button type="button" data-fake-account><span class="avatar">育</span><span><b>育英老師</b><small>teacher@example.com</small></span></button></div>`;
        // On <html>, like the overlay, so the overlay's zoom of <body> never scales it.
        document.documentElement.append(style, modal);
        modal.querySelector('[data-fake-account]').addEventListener('click', () => {
          modal.remove();
          style.remove();
          callback({ access_token: 'fake-token', expires_in: 3599, scope });
        });
      },
    };
  }

  window.google = { accounts: { oauth2: { initTokenClient } } };
})();
