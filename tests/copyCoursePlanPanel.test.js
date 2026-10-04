import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clearAllData, addChild } from '../src/storage/db.js';
import { addParentReport, addCoursePlanEntry, listCoursePlanEntriesForReport } from '../src/storage/parentReportDb.js';
import { renderCopyCoursePlanPanel } from '../src/ui/copyCoursePlanPanel.js';
import { waitFor } from './helpers.js';

describe('renderCopyCoursePlanPanel', () => {
  let report;
  let other;
  let opened;
  let closed;
  const originalShowModal = HTMLDialogElement.prototype.showModal;
  const originalClose = HTMLDialogElement.prototype.close;

  beforeEach(async () => {
    await clearAllData();
    const child = await addChild({ name: '陳小安', birthDate: '2024-06-20' });
    const otherChild = await addChild({ name: '林小明', birthDate: '2024-07-01' });
    report = await addParentReport({ childId: child.id, tier: 'Ⅴ', period: '115年06月' });
    other = await addParentReport({ childId: otherChild.id, tier: 'Ⅴ', period: '115年06月' });
    opened = 0;
    closed = 0;
    // jsdom has no real modal dialogs — same stubbing as formPopup.test.js.
    HTMLDialogElement.prototype.showModal = function () { opened += 1; this.open = true; };
    HTMLDialogElement.prototype.close = function () { closed += 1; this.open = false; this.dispatchEvent(new Event('close')); };
    // Mock window.scrollTo for formPopup's body scroll locking
    window.scrollTo = () => {};
  });

  afterEach(() => {
    HTMLDialogElement.prototype.showModal = originalShowModal;
    HTMLDialogElement.prototype.close = originalClose;
  });

  async function setup(options = {}) {
    const host = document.createElement('div');
    const trigger = document.createElement('button');
    await renderCopyCoursePlanPanel(host, { trigger, report, onChange: () => {}, ...options });
    return { host, trigger, form: host.querySelector('[data-copy-plan-form]') };
  }

  const submit = form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

  it('opens as a popup from the trigger, titled and listing candidates as unselected radios', async () => {
    await addCoursePlanEntry({ reportId: other.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    const { trigger, form } = await setup();

    expect(form.closest('dialog.form-popup')).not.toBeNull();
    trigger.click();
    expect(opened).toBe(1);
    expect(form.querySelector('.panel-form__title').textContent).toBe('套用其他幼兒課程計畫');
    const radio = form.querySelector(`input[name="copy-plan-source"][value="${other.id}"]`);
    expect(radio.checked).toBe(false);
    expect(radio.closest('label').textContent.trim()).toBe('林小明（1 筆）');
  });

  it('shows an empty message and only a 關閉 button when no one can be copied from', async () => {
    const { form } = await setup();

    expect(form.textContent).toContain('沒有同年齡層、同月份的其他幼兒課程計畫可以套用');
    expect(form.querySelector('[type="submit"]')).toBeNull();
    form.querySelector('[data-action="close-copy-plan"]').click();
    expect(form.querySelector('[data-action="close-copy-plan"]').textContent).toBe('關閉');
    expect(closed).toBe(1);
  });

  it('keeps 套用 disabled until a child is picked; 取消 closes', async () => {
    await addCoursePlanEntry({ reportId: other.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    const { form } = await setup();
    const apply = form.querySelector('[type="submit"]');

    expect(apply.textContent).toBe('套用');
    expect(apply.disabled).toBe(true);
    form.querySelector(`input[value="${other.id}"]`).click();
    expect(apply.disabled).toBe(false);

    const cancel = form.querySelector('[data-action="close-copy-plan"]');
    expect(cancel.textContent).toBe('取消');
    cancel.click();
    expect(closed).toBe(1);
  });

  it('cancelling the confirm changes nothing and leaves the panel open', async () => {
    await addCoursePlanEntry({ reportId: report.id, indicatorCode: 'Ⅴ-2-1', activityName: '舊活動' });
    await addCoursePlanEntry({ reportId: other.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    let message = null;
    let changed = false;
    const { form } = await setup({ onChange: () => { changed = true; }, confirmCopy: m => { message = m; return false; } });

    form.querySelector(`input[value="${other.id}"]`).click();
    submit(form);
    await waitFor(() => message !== null);

    expect(message).toContain('目前這份的 1 筆課程計畫，會換成「林小明」的 1 筆課程計畫。');
    expect((await listCoursePlanEntriesForReport(report.id)).map(e => e.activityName)).toEqual(['舊活動']);
    expect(closed).toBe(0);
    expect(changed).toBe(false);
  });

  it('confirming replaces the course plan, closes the panel and re-renders', async () => {
    await addCoursePlanEntry({ reportId: other.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    let message = null;
    let changed = false;
    const { form } = await setup({ onChange: () => { changed = true; }, confirmCopy: m => { message = m; return true; } });

    form.querySelector(`input[value="${other.id}"]`).click();
    submit(form);
    await waitFor(() => changed);

    expect(message).toContain('會套用「林小明」的 1 筆課程計畫。');
    expect((await listCoursePlanEntriesForReport(report.id)).map(e => e.activityName)).toEqual(['畫畫']);
    expect(closed).toBe(1);
  });

  it('a double submit runs only one copy', async () => {
    await addCoursePlanEntry({ reportId: other.id, indicatorCode: 'Ⅴ-1-6', activityName: '畫畫' });
    let changed = false;
    const { form } = await setup({ onChange: () => { changed = true; }, confirmCopy: () => true });

    form.querySelector(`input[value="${other.id}"]`).click();
    submit(form);
    submit(form);
    await waitFor(() => changed);
    await new Promise(resolve => setTimeout(resolve, 50));

    expect((await listCoursePlanEntriesForReport(report.id)).map(e => e.activityName)).toEqual(['畫畫']);
  });
});
