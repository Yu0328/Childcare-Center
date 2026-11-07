// Shared bits of the chapter scripts. Every chapter starts and ends on the home screen.

// Off-camera sign-in for dev scripts that start after 開始使用.
export async function signIn(d) {
  await d.page.click('[data-action="sign-in-google"]');
  await d.page.click('[data-fake-account]');
  await d.page.waitForSelector('[data-screen="home"]');
}

// Headless Chromium never offers installation, so the header's 安裝 button stays hidden. Fire the
// browser's install offer ourselves (prompt() resolves as if dismissed — nothing is installed).
export async function offerInstall(d) {
  await d.page.evaluate(() => {
    const event = new Event('beforeinstallprompt');
    event.prompt = () => Promise.resolve();
    event.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' });
    window.dispatchEvent(event);
  });
}

export const HOME = '#home-button';

// Opens a list screen's 新增 form: on the phone it sits behind the ＋ button, on the computer it's
// already open beside the list.
export async function openAddForm(d, layout) {
  if (layout === 'phone') await d.click('[data-action="open-form-popup"]');
}

// Highlight with a label, hold, clear.
export async function point(d, sel, label, ms = 1600) {
  await d.highlight(sel, label);
  await d.wait(ms);
  await d.clearHighlight();
}

export const pick = (layout, desk, phone) => (layout === 'phone' ? phone : desk);
