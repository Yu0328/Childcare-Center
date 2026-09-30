import { showToast } from './toast.js';

// Wraps an async click/submit handler so a double click (or an impatient second tap while a save is
// still running) doesn't run it twice — which stored duplicate children/forms/entries and imported
// a whole file twice. The clicked button (a form's submit button) greys out for the run and goes
// back to its earlier disabled state afterwards, so a password-locked backup button stays locked.
// A failure the handler didn't catch itself still gets a message, instead of a button that
// silently does nothing (every add/save/delete/confirm button goes through here).
export function oneAtATime(handler) {
  let running = false;
  return async event => {
    if (running) {
      if (event?.type === 'submit') event.preventDefault();
      return;
    }
    running = true;
    const target = event?.currentTarget;
    const button = event?.type === 'submit' ? target?.querySelector?.('[type="submit"]') : target;
    const wasDisabled = button?.disabled;
    if (button) button.disabled = true;
    try {
      return await handler(event);
    } catch (err) {
      console.error(err);
      showToast('操作失敗，請再試一次');
    } finally {
      running = false;
      if (button) button.disabled = wasDisabled;
    }
  };
}
