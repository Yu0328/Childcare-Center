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
    if (isSafe()) reloadNow();
  });

  const registration = await serviceWorker.register('sw.js');
  const checkForUpdate = () => registration.update().catch(() => {});

  function trySwitch() {
    if (!isSafe()) return;
    if (takenOver) return reloadNow();
    if (registration.waiting && serviceWorker.controller) registration.waiting.postMessage('SKIP_WAITING');
  }

  doc.addEventListener('visibilitychange', () => {
    if (!doc.hidden) checkForUpdate();
    trySwitch();
  });
  setInterval(checkForUpdate, checkEveryMs);
  return registration;
}
