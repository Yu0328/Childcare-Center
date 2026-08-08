import { describe, it, expect, beforeEach } from 'vitest';
import { hashPassword, isUnlocked, renderPasswordGate } from '../src/auth/passwordGate.js';
import { waitFor } from './helpers.js';

describe('hashPassword', () => {
  it('produces the known SHA-256 hex digest for a given input', async () => {
    // Verified independently via `node -e "console.log(require('crypto').createHash('sha256').update('hello').digest('hex'))"`.
    expect(await hashPassword('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('produces different digests for different input', async () => {
    expect(await hashPassword('a')).not.toBe(await hashPassword('b'));
  });
});

describe('password gate', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is locked before any successful unlock', () => {
    expect(isUnlocked()).toBe(false);
  });

  it('shows an error and does not unlock on the wrong password', async () => {
    const container = document.createElement('div');
    let unlocked = false;
    renderPasswordGate(container, { onUnlock: () => { unlocked = true; } });

    container.querySelector('[data-field="password"]').value = 'wrong-password';
    container.querySelector('[data-action="unlock"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => container.textContent.includes('密碼錯誤'));
    expect(unlocked).toBe(false);
    expect(isUnlocked()).toBe(false);
  });

  it('calls onUnlock and persists unlock state on the correct password', async () => {
    const container = document.createElement('div');
    let unlocked = false;
    renderPasswordGate(container, { onUnlock: () => { unlocked = true; } });

    container.querySelector('[data-field="password"]').value = 'pdnpyycctbs588';
    container.querySelector('[data-action="unlock"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => unlocked);
    expect(isUnlocked()).toBe(true);
  });
});
