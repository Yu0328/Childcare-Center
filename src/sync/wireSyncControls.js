// src/sync/wireSyncControls.js
import { setWriteListener } from '../storage/dbCore.js';
import { createGoogleAuth, readSyncMode, readDisplayName, isOffline } from './googleAuth.js';
import { createDriveClient } from './driveClient.js';
import { createSyncEngine } from './syncEngine.js';
import { needsSignInChoice, renderSignInChoiceView } from '../ui/signInChoiceView.js';
import { renderSyncHeader } from '../ui/syncHeader.js';
import { renderConflictResolveView } from '../ui/conflictResolveView.js';

export function wireSyncControls({
  clientId,
  syncSlot,
  createAuth = config => createGoogleAuth(config),
  createDrive = config => createDriveClient(config),
  createEngine = config => createSyncEngine(config),
  // Guest mode's export/import backup buttons live inside syncHeader's own template (see
  // renderSyncHeader) rather than the static page markup, since google mode doesn't need them at
  // all — wireBackupControls has to be re-run against the freshly-created elements every time
  // paintHeader('guest') replaces them. Optional so tests that don't care about backup wiring
  // don't need to pass a no-op.
  wireBackup,
}) {
  const auth = createAuth({ clientId });
  const drive = createDrive({ auth });
  let header = null;
  let appContainer = null;
  let resumeApp = null;
  let syncing = false;
  let listenersWired = false;
  // The only triggers otherwise are a local write, a tab regaining foreground, and coming back
  // online — a tab left open and focused the whole time (exactly how a desk computer tends to
  // sit) never notices another device's changes on its own. This bounds that gap without needing
  // a real push channel.
  const POLL_INTERVAL_MS = 120000;

  // The conflict screen takes over the app area, then hands it back. It is the only part of sync
  // allowed to interrupt the teacher, and only for genuine same-field disagreements.
  async function resolveConflicts(conflicts) {
    if (!appContainer) return conflicts.map(conflict => ({ uid: conflict.uid, choice: 'local' }));
    const choices = await renderConflictResolveView(appContainer, { conflicts });
    if (resumeApp) resumeApp();
    return choices;
  }

  const engine = createEngine({
    drive,
    resolveConflicts,
    onStatus: status => header && header.update(status),
  });

  function paintHeader(mode) {
    header = renderSyncHeader(syncSlot, {
      mode,
      name: readDisplayName(),
      status: engine.getStatus(),
      onSignIn: async () => {
        try {
          await auth.signIn();
          startSyncing();
        } catch (err) {
          if (err.message !== 'OFFLINE') header.update({ ...engine.getStatus(), error: 'NETWORK' });
        }
      },
      onSignOut: () => {
        auth.signOut();
        syncing = false;
        setWriteListener(null);
        paintHeader('guest');
      },
      onSyncNow: () => engine.runSync(),
    });
    if (mode === 'guest' && wireBackup) {
      wireBackup(syncSlot.querySelector('#export-backup'), syncSlot.querySelector('#import-backup'));
    }
  }

  // Registered once and left in place for the page's lifetime; the `syncing` guard (not
  // add/removeEventListener) is what stops them after sign-out. Re-adding a fresh pair on every
  // sign-in would both accumulate listeners on a shared device and — the actual bug this guards
  // against — keep firing scheduleSync() for a tab that has since signed out, which fails with
  // AUTH_REQUIRED and paints "同步失敗" over what is now the guest header.
  function wireListenersOnce() {
    if (listenersWired) return;
    listenersWired = true;
    document.addEventListener('visibilitychange', () => {
      if (syncing && !document.hidden) engine.scheduleSync();
    });
    window.addEventListener('online', () => {
      if (syncing) engine.scheduleSync();
    });
    setInterval(() => {
      if (syncing && !document.hidden) engine.scheduleSync();
    }, POLL_INTERVAL_MS);
  }

  function startSyncing() {
    paintHeader('google');
    syncing = true;
    // The design's two triggers: after a save (debounced) and on open / back to foreground.
    setWriteListener(() => engine.scheduleSync());
    wireListenersOnce();
    engine.runSync();
  }

  // Deliberately not auto-resuming: a silent resume can still need to open a real, visible popup
  // when Google can't confirm the session invisibly, and doing that automatically ambushes the
  // person with a Google window they never asked for, with no time to be ready for it. Showing
  // the same choice screen a first-time visitor sees — rather than just a bare header button —
  // means the popup, if one appears, only ever follows a deliberate "使用 Google 登入" click on a
  // full screen the person is looking at, not a small button they might not even notice yet.
  function renderChoice(container, onDone) {
    renderSignInChoiceView(container, {
      onGoogle: async () => {
        await auth.signIn();
        startSyncing();
        onDone();
      },
      onGuest: () => {
        paintHeader('guest');
        onDone();
      },
    });
  }

  async function gate(container, { onDone }) {
    appContainer = container;
    resumeApp = onDone;

    if (needsSignInChoice()) {
      renderChoice(container, onDone);
      return;
    }

    if (readSyncMode() === 'google') {
      if (isOffline()) {
        // Starting offline is normal, not an error: the app is local-first and will sync when the
        // network comes back (the 'online' listener above). No popup risk offline either way, so
        // this skips the choice screen and just continues — asking to choose again would block
        // someone from using the app at all until they're back online.
        paintHeader('google');
        syncing = true;
        setWriteListener(() => engine.scheduleSync());
        wireListenersOnce();
        onDone();
        return;
      }
      renderChoice(container, onDone);
      return;
    }

    paintHeader('guest');
    onDone();
  }

  return { gate };
}
