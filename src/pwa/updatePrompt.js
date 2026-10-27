// Swaps in a redeploy without the teacher noticing — and never mid-form. A reload always lands on
// the home screen, so it only happens when `isSafe()` says she's already there with nothing
// unsaved and no sync running: when she leaves the app, or the moment she's back (some phones
// freeze a hidden page before it can act). Replaces the 2026-09-25 「有新版本［更新］」 banner —
// see docs/superpowers/specs/2026-10-27-silent-auto-update-design.md.
export async function wireAutoUpdate({
  serviceWorker = navigator.serviceWorker,
  isSafe = () => false,
  beforeReload = () => {},
  reload = () => location.reload(),
  doc = document,
  checkEveryMs = 30 * 60 * 1000,
} = {}) {
  // No controller yet means the first install, whose clients.claim() is not an update.
  let hadController = Boolean(serviceWorker.controller);
  // The new version controls this page but the page still runs the old code — reload at the next
  // safe moment without waiting on anything else.
  let takenOver = false;
  let reloading = false;
  // A file chooser (匯入) can hide the page before anything is picked, and on return the page turns
  // visible before `change` arrives — so it counts as "still in the app" until the pick lands or,
  // for a cancel older Safari never reports, a second after she's back.
  let picking = false;
  const isFileInput = event => event.target?.type === 'file';
  doc.addEventListener('click', event => { if (isFileInput(event)) picking = true; }, true);
  for (const type of ['change', 'cancel']) {
    doc.addEventListener(type, event => { if (isFileInput(event)) picking = false; }, true);
  }

  function reloadNow() {
    if (reloading) return;
    reloading = true;
    beforeReload();
    reload();
  }

  // Re-checked here, right before reloading: between asking the new version to take over and it
  // doing so, she may have tapped into a form. Also covers another tab's takeover.
  serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    takenOver = true;
    if (isSafe() && !picking) reloadNow();
  });

  const registration = await serviceWorker.register('sw.js');
  const checkForUpdate = () => registration.update().catch(() => {});

  function trySwitch() {
    if (!isSafe() || picking) return;
    if (takenOver) return reloadNow();
    if (registration.waiting && serviceWorker.controller) registration.waiting.postMessage('SKIP_WAITING');
  }

  doc.addEventListener('visibilitychange', () => {
    if (!doc.hidden) {
      checkForUpdate();
      if (picking) setTimeout(() => { picking = false; }, 1000);
    }
    trySwitch();
  });
  setInterval(checkForUpdate, checkEveryMs);
  return registration;
}
