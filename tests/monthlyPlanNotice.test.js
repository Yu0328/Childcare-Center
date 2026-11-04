import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { maybeShowMonthlyPlanNotice, MONTHLY_PLAN_NOTICE_KEY } from '../src/ui/monthlyPlanNotice.js';

describe('maybeShowMonthlyPlanNotice', () => {
  const originalShowModal = HTMLDialogElement.prototype.showModal;
  const originalClose = HTMLDialogElement.prototype.close;
  let storage;
  const notice = () => document.querySelector('dialog.install-dialog');

  beforeEach(() => {
    storage = new Map();
    storage.getItem = key => (Map.prototype.has.call(storage, key) ? Map.prototype.get.call(storage, key) : null);
    storage.setItem = (key, value) => Map.prototype.set.call(storage, key, value);
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
  });
  afterEach(() => {
    HTMLDialogElement.prototype.showModal = originalShowModal;
    HTMLDialogElement.prototype.close = originalClose;
    document.body.innerHTML = '';
  });

  it('shows once to someone who already has plans, and 我知道了 closes it', () => {
    maybeShowMonthlyPlanNotice({ hasPlans: true, storage });
    expect(notice().textContent).toContain('月計畫的排課方式改了');
    expect(notice().textContent).toContain('套用其他幼兒月計畫');
    expect(storage.getItem(MONTHLY_PLAN_NOTICE_KEY)).toBe('1');

    notice().querySelector('[data-action="close-notice"]').click();
    expect(notice()).toBeNull();

    maybeShowMonthlyPlanNotice({ hasPlans: true, storage });
    expect(notice()).toBeNull();
  });

  it('never shows to someone with no plans yet', () => {
    maybeShowMonthlyPlanNotice({ hasPlans: false, storage });
    maybeShowMonthlyPlanNotice({ hasPlans: true, storage });
    expect(notice()).toBeNull();
  });
});
