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
        setWriteListener(null);
        paintHeader('guest');
      },
    });
  }

  function startSyncing() {
    paintHeader('google');
    // The design's two triggers: after a save (debounced) and on open / back to foreground.
    setWriteListener(() => engine.scheduleSync());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) engine.scheduleSync();
    });
    window.addEventListener('online', () => engine.scheduleSync());
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
        setWriteListener(() => engine.scheduleSync());
        window.addEventListener('online', () => engine.scheduleSync());
        onDone();
        return;
      }
      const resumed = await auth.resume();
      if (resumed) {
        startSyncing();
      } else {
        paintHeader('google');
        header.update({ ...engine.getStatus(), phase: 'auth', error: 'AUTH_EXPIRED' });
      }
      onDone();
      return;
    }

    paintHeader('guest');
    onDone();
  }

  return { gate };
}
