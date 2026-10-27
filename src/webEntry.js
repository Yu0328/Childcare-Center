// src/webEntry.js
//
// The hosted build's entry point. It exists purely so the offline build (scripts/build.mjs,
// entry src/app.js) never pulls a byte of login or sync code into dist/TableC.html.
export { mountApp, wireBackupControls, isAtHome } from './app.js';
export { wireSyncControls } from './sync/wireSyncControls.js';
export { wireAutoUpdate } from './pwa/updatePrompt.js';
export { createInstall } from './pwa/installPrompt.js';
export { hasUnsavedInput } from './ui/unsavedInput.js';
