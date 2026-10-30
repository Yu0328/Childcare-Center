import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { wirePhotoDragSwap } from '../src/ui/photoDragSwap.js';

// jsdom has no PointerEvent or layout: pointer events are MouseEvents carrying a pointerType, and
// elementFromPoint is stubbed to say which item the pointer is over.
function pointer(type, target, { x = 0, y = 0, pointerType = 'mouse' } = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  target.dispatchEvent(event);
  return event;
}

describe('wirePhotoDragSwap', () => {
  let root, items, onSwap, over;

  beforeEach(() => {
    vi.useFakeTimers();
    root = document.createElement('div');
    root.innerHTML = [0, 1, 2].map(i => `<label data-item="${i}"><img><button type="button">×</button></label>`).join('');
    document.body.appendChild(root);
    items = [...root.querySelectorAll('[data-item]')];
    onSwap = vi.fn();
    over = null;
    document.elementFromPoint = () => over;
    wirePhotoDragSwap(root, { itemSelector: '[data-item]', canDrag: item => item.dataset.item !== '1', onSwap });
  });

  afterEach(() => {
    vi.useRealTimers();
    root.remove();
  });

  const clickAfter = item => {
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    item.dispatchEvent(click);
    return click;
  };

  it('滑鼠拖到另一張照片上就交換，拖完那一下點擊不會打開選檔案', () => {
    pointer('pointerdown', items[0].querySelector('img'));
    over = items[2];
    pointer('pointermove', document, { x: 50 });
    pointer('pointerup', document, { x: 50 });
    expect(onSwap).toHaveBeenCalledWith(items[0], items[2]);
    expect(clickAfter(items[0]).defaultPrevented).toBe(true);
  });

  it('拖的時候有一張照片的分身跟著游標走，放開就消失', () => {
    pointer('pointerdown', items[0].querySelector('img'));
    expect(document.querySelector('.photo-drag-ghost')).toBeNull();
    over = items[2];
    pointer('pointermove', document, { x: 50, y: 20 });
    const ghost = document.querySelector('.photo-drag-ghost');
    expect(ghost.querySelector('img')).not.toBeNull();
    expect(ghost.style.transform).toBe('translate(50px, 20px)');
    expect(items[2].classList.contains('photo-drag--target')).toBe(true);
    pointer('pointerup', document, { x: 50, y: 20 });
    expect(document.querySelector('.photo-drag-ghost')).toBeNull();
    expect(items[2].classList.contains('photo-drag--target')).toBe(false);
  });

  it('只是點一下不會交換，點擊照常（可以換照片）', () => {
    pointer('pointerdown', items[0]);
    pointer('pointerup', document);
    expect(onSwap).not.toHaveBeenCalled();
    expect(clickAfter(items[0]).defaultPrevented).toBe(false);
  });

  it('拖完沒有點擊的話，下一次正常點擊不會被吃掉', () => {
    pointer('pointerdown', items[0]);
    over = items[2];
    pointer('pointermove', document, { x: 50 });
    pointer('pointerup', document, { x: 50 });
    vi.runAllTimers();
    expect(clickAfter(items[0]).defaultPrevented).toBe(false);
  });

  it('手指沒先按住就移動，是在捲動頁面，不會拖', () => {
    pointer('pointerdown', items[0], { pointerType: 'touch' });
    over = items[2];
    pointer('pointermove', document, { x: 50, pointerType: 'touch' });
    vi.advanceTimersByTime(1000);
    pointer('pointerup', document, { x: 50, pointerType: 'touch' });
    expect(onSwap).not.toHaveBeenCalled();
  });

  it('手指按住一下再拖，就會交換，拖的時候頁面不捲動', () => {
    pointer('pointerdown', items[0], { pointerType: 'touch' });
    vi.advanceTimersByTime(400);
    over = items[2];
    pointer('pointermove', document, { x: 50, pointerType: 'touch' });
    const touchMove = new Event('touchmove', { cancelable: true });
    document.dispatchEvent(touchMove);
    expect(touchMove.defaultPrevented).toBe(true);
    pointer('pointerup', document, { x: 50, pointerType: 'touch' });
    expect(onSwap).toHaveBeenCalledWith(items[0], items[2]);
  });

  it('不能拖的格子、或按在 × 上，都不會開始拖', () => {
    pointer('pointerdown', items[1]);
    over = items[2];
    pointer('pointermove', document, { x: 50 });
    pointer('pointerup', document, { x: 50 });
    pointer('pointerdown', items[0].querySelector('button'));
    pointer('pointermove', document, { x: 50 });
    pointer('pointerup', document, { x: 50 });
    expect(onSwap).not.toHaveBeenCalled();
  });

  it('放在原本的位置或照片外面，不交換', () => {
    pointer('pointerdown', items[0]);
    over = items[0];
    pointer('pointermove', document, { x: 50 });
    pointer('pointerup', document, { x: 50 });
    over = null;
    pointer('pointerdown', items[0]);
    pointer('pointermove', document, { x: 50 });
    pointer('pointerup', document, { x: 50 });
    expect(onSwap).not.toHaveBeenCalled();
  });
});
