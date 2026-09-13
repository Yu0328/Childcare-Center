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

  async function gate(container, { onDone }) {
    appContainer = container;
    resumeApp = onDone;

    if (needsSignInChoice()) {
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
      return;
    }

    if (readSyncMode() === 'google') {
      if (isOffline()) {
        // Starting offline is normal, not an error: the app is local-first and will sync when the
        // network comes back (the 'online' listener above).
        paintHeader('google');
        syncing = true;
        setWriteListener(() => engine.scheduleSync());
        wireListenersOnce();
        onDone();
        return;
      }
      // Deliberately does NOT auto-call auth.resume() here. A silent resume can still need to
      // open a real, visible popup when Google can't confirm the session invisibly — and doing
      // that automatically on page load ambushes the person with a Google window they never asked
      // for, with no time to be ready for it. Waiting for the same "使用 Google 登入" button guest
      // mode already uses means any popup that appears is one they just clicked for — it can't be
      // browser-blocked either, since a real click is behind it — and they set the pace themselves.
      paintHeader('guest');
      onDone();
      return;
    }

    paintHeader('guest');
    onDone();
  }

  return { gate };
}
