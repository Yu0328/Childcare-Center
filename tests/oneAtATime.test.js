import { describe, it, expect, vi } from 'vitest';
import { oneAtATime } from '../src/ui/oneAtATime.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('oneAtATime', () => {
  it('ignores a second click while the first is still running, greying the button meanwhile', async () => {
    const button = document.createElement('button');
    const gate = deferred();
    const handler = vi.fn(() => gate.promise);
    button.addEventListener('click', oneAtATime(handler));

    button.click();
    expect(button.disabled).toBe(true);
    button.disabled = false; // a real disabled button swallows clicks; force one through anyway
    button.click();
    expect(handler).toHaveBeenCalledTimes(1);

    gate.resolve();
    await gate.promise;
    await Promise.resolve();
    expect(button.disabled).toBe(false);
  });

  it('greys the submit button of a form and still blocks navigation on an ignored submit', async () => {
    const form = document.createElement('form');
    form.innerHTML = '<button type="submit">新增</button>';
    const gate = deferred();
    const handler = vi.fn(event => { event.preventDefault(); return gate.promise; });
    form.addEventListener('submit', oneAtATime(handler));

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(form.querySelector('button').disabled).toBe(true);
    const second = new Event('submit', { cancelable: true });
    form.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);

    gate.resolve();
    await gate.promise;
    await Promise.resolve();
    expect(form.querySelector('button').disabled).toBe(false);
  });

  it('leaves a button that was already disabled (e.g. a locked backup button) disabled', async () => {
    const button = document.createElement('button');
    button.disabled = true;
    const run = oneAtATime(async () => {});
    await run({ type: 'click', currentTarget: button });
    expect(button.disabled).toBe(true);
  });

  it('shows an error message on an unhandled failure and lets the action run again', async () => {
    const button = document.createElement('button');
    const handler = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce();
    const run = oneAtATime(handler);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await run({ type: 'click', currentTarget: button });
    expect(document.body.textContent).toContain('操作失敗，請再試一次');
    await run({ type: 'click', currentTarget: button });
    expect(handler).toHaveBeenCalledTimes(2);
    expect(button.disabled).toBe(false);
  });
});
