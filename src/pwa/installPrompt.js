import { openInstallDialog } from '../ui/installDialog.js';

// The header's 加入主畫面／安裝 button — see docs/superpowers/specs/2026-10-27-install-button-design.md.
// Only Android/desktop Chrome and Edge let a page trigger the install itself (beforeinstallprompt);
// iPhone never does, so there the button opens step-by-step instructions instead.
export function createInstall({ win = window, nav = navigator } = {}) {
  const ua = nav.userAgent || '';
  // iPadOS Safari reports itself as a Mac; a touch screen gives it away.
  const ios = /iPhone|iPad|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const inLine = / Line\//i.test(ua);
  let deferred = null;
  let installed = false;
  let button = null;

  const standalone = () => win.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;

  function kind() {
    if (installed || standalone()) return null;
    if (inLine) return 'line';
    if (ios) return 'ios';
    return deferred ? 'prompt' : null;
  }

  const refresh = () => {
    if (button) button.hidden = !kind();
  };

  win.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); // keep it for our own button instead of the browser's mini-bar
    deferred = event;
    refresh();
  });
  win.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    refresh();
  });

  async function promptInstall() {
    const event = deferred;
    if (!event) return;
    deferred = null; // a prompt event works only once
    event.prompt();
    await event.userChoice;
    refresh();
  }

  // Re-run on every header repaint (the header builds a fresh button each time), like wireBackup.
  function wireButton(nextButton, mode) {
    button = nextButton;
    refresh();
    button.addEventListener('click', () => {
      const lineUrl = new URL(win.location.href);
      lineUrl.searchParams.set('openExternalBrowser', '1'); // LINE opens such a link in the phone's own browser
      openInstallDialog({
        kind: kind(),
        guest: mode !== 'google',
        device: ios ? 'ios' : android ? 'android' : 'desk',
        onInstall: promptInstall,
        lineUrl: lineUrl.href,
      });
    });
  }

  return { kind, wireButton };
}
