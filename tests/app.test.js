import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import * as db from '../src/storage/db.js';
import * as backup from '../src/storage/backup.js';
import { mountApp, wireBackupControls } from '../src/app.js';
import { unlock } from '../src/auth/passwordGate.js';
import { waitFor } from './helpers.js';

describe('mountApp navigation', () => {
  beforeEach(async () => {
    await clearAllData();
    localStorage.clear();
    unlock();
  });

  it('starts on the report type select screen, then reaches the child list after choosing 適性總表', async () => {
    const container = document.createElement('div');
    mountApp(container);
    await waitFor(() => container.textContent.includes('選擇要填寫的表'));
    expect(container.textContent).toContain('選擇要填寫的表');

    container.querySelector('[data-type="assessment"]').click();
    await waitFor(() => container.textContent.includes('幼兒列表'));
    expect(container.textContent).toContain('幼兒列表');
  });

  it('navigates child list -> form list -> form editor -> back -> back', async () => {
    const child = await addChild({ name: '陳小安', birthDate: '2024-11-01' });

    const container = document.createElement('div');
    mountApp(container);
    await waitFor(() => container.textContent.includes('選擇要填寫的表'));
    container.querySelector('[data-type="assessment"]').click();
    await waitFor(() => container.querySelector(`[data-child-id="${child.id}"]`));

    container.querySelector(`[data-child-id="${child.id}"]`).click();
    await waitFor(() => container.textContent.includes('的適性總表'));
    expect(container.textContent).toContain('的適性總表');

    container.querySelector('[data-field="tier"]').value = 'Ⅳ';
    container.querySelector('[data-field="period-year"]').value = '115';
    container.querySelector('[data-field="period-month"]').value = '1';
    container.querySelector('[data-action="add-form"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => container.querySelector('[data-form-id]'));

    container.querySelector('[data-form-id]').click();
    await waitFor(() => container.textContent.includes('Ⅳ-1-1'));
    expect(container.textContent).toContain('Ⅳ-1-1');

    container.querySelector('[data-action="back"]').click();
    await waitFor(() => container.textContent.includes('的適性總表'));
    expect(container.textContent).toContain('的適性總表');

    container.querySelector('[data-action="back"]').click();
    // Note: formListView's own back button label is "← 返回幼兒列表", which contains the
    // substring "幼兒列表" — waiting on that substring alone would resolve instantly against the
    // still-stale form-list DOM before the async renderChildListView re-render actually lands.
    // Waiting for the add-child form (unique to childListView) ensures navigation really happened.
    await waitFor(() => container.querySelector('[data-action="add-child"]'));
    expect(container.textContent).toContain('幼兒列表');

    container.querySelector('[data-action="back"]').click();
    await waitFor(() => container.textContent.includes('選擇要填寫的表'));
    expect(container.textContent).toContain('選擇要填寫的表');
  });
});

describe('mountApp password gate', () => {
  beforeEach(async () => {
    await clearAllData();
    localStorage.clear();
  });

  it('shows the password gate instead of the child list when locked', async () => {
    const container = document.createElement('div');
    mountApp(container);
    await waitFor(() => container.textContent.includes('請輸入密碼'));

    expect(container.textContent).toContain('請輸入密碼');
    expect(container.textContent).not.toContain('幼兒列表');
  });

  it('proceeds to the child list after entering the correct password', async () => {
    const container = document.createElement('div');
    mountApp(container);
    await waitFor(() => container.querySelector('[data-field="password"]'));

    container.querySelector('[data-field="password"]').value = 'pdnpyycctbs588';
    container.querySelector('[data-action="unlock"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => container.textContent.includes('選擇要填寫的表'));
    container.querySelector('[data-type="assessment"]').click();
    await waitFor(() => container.textContent.includes('幼兒列表'));
    expect(container.textContent).toContain('幼兒列表');
  });
});

describe('mountApp render failures', () => {
  beforeEach(() => {
    localStorage.clear();
    unlock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a fallback message when the initial render rejects', async () => {
    vi.spyOn(db, 'listChildren').mockRejectedValueOnce(new Error('storage exploded'));

    const container = document.createElement('div');
    mountApp(container);
    // The report type select screen itself does no data loading, so the rejection only
    // surfaces once we navigate to the child list, which fetches children via listChildren.
    await waitFor(() => container.textContent.includes('選擇要填寫的表'));
    container.querySelector('[data-type="assessment"]').click();

    await waitFor(() => container.textContent.includes('載入失敗，請重新整理頁面'));

    expect(container.textContent).toContain('載入失敗，請重新整理頁面');
    expect(container.querySelector('[data-error="render"]')).not.toBeNull();
  });
});

describe('wireBackupControls', () => {
  let header;
  let exportButton;
  let importInput;

  function setFile(text) {
    Object.defineProperty(importInput, 'files', {
      configurable: true,
      value: [{ text: async () => text }],
    });
  }

  beforeEach(async () => {
    await clearAllData();
    header = document.createElement('header');
    exportButton = document.createElement('button');
    importInput = document.createElement('input');
    importInput.type = 'file';
    header.append(exportButton, importInput);
    document.body.appendChild(header);
  });

  afterEach(() => {
    header.remove();
    vi.restoreAllMocks();
  });

  it('shows feedback when the export fails', async () => {
    vi.spyOn(backup, 'exportBackup').mockRejectedValueOnce(new Error('nope'));
    wireBackupControls({ exportButton, importInput });

    exportButton.click();

    await waitFor(() => header.textContent.includes('匯出失敗，請再試一次'));
    expect(header.querySelector('[data-error="backup"]').textContent).toBe('匯出失敗，請再試一次');
  });

  it('does not import when the confirmation is declined', async () => {
    const importSpy = vi.spyOn(backup, 'importBackup');
    const confirmImport = vi.fn(() => false);
    const reload = vi.fn();
    wireBackupControls({ exportButton, importInput, confirmImport, reload });
    setFile('{"version":1,"children":[],"forms":[],"entries":[]}');

    importInput.dispatchEvent(new Event('change'));

    await waitFor(() => confirmImport.mock.calls.length > 0);
    expect(confirmImport).toHaveBeenCalledWith('匯入備份會清除目前所有資料，確定要繼續嗎？');
    // Give any (incorrectly) queued async import work a chance to run before asserting it did not.
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(importSpy).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('shows feedback and does not reload when the import fails', async () => {
    vi.spyOn(backup, 'importBackup').mockRejectedValueOnce(new Error('corrupt backup'));
    const reload = vi.fn();
    wireBackupControls({ exportButton, importInput, confirmImport: () => true, reload });
    setFile('not json at all');

    importInput.dispatchEvent(new Event('change'));

    await waitFor(() => header.textContent.includes('匯入失敗，請再試一次'));
    expect(header.querySelector('[data-error="backup"]').textContent).toBe('匯入失敗，請再試一次');
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads after a confirmed, successful import', async () => {
    const importSpy = vi.spyOn(backup, 'importBackup').mockResolvedValueOnce(undefined);
    const reload = vi.fn();
    wireBackupControls({ exportButton, importInput, confirmImport: () => true, reload });
    setFile('{"version":1,"children":[],"forms":[],"entries":[]}');

    importInput.dispatchEvent(new Event('change'));

    await waitFor(() => reload.mock.calls.length > 0);
    expect(importSpy).toHaveBeenCalledWith('{"version":1,"children":[],"forms":[],"entries":[]}');
  });
});
