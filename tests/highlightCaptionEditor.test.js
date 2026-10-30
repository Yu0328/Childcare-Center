import { describe, it, expect, beforeEach } from 'vitest';
import { mountCaptionEditor } from '../src/ui/highlightCaptionEditor.js';

describe('mountCaptionEditor', () => {
  let root, thumbs;
  const mount = options => mountCaptionEditor(root, { getThumbs: () => thumbs, ...options });
  const boxes = () => [...root.querySelectorAll('[data-caption-part]')];
  const click = selector => root.querySelector(selector).click();
  const type = (box, text) => { box.value = text; };

  beforeEach(() => {
    root = document.createElement('div');
    thumbs = ['a', 'b', 'c'];
  });

  it('預設只有一個描述欄；少於兩張照片時沒有「分開描述」', () => {
    thumbs = ['a'];
    const editor = mount({ caption: '蓋城堡' });
    expect(boxes()).toHaveLength(1);
    expect(root.querySelector('[data-field="caption"]').value).toBe('蓋城堡');
    expect(root.querySelector('[data-caption-split]')).toBeNull();
    expect(editor.value()).toEqual({ caption: '蓋城堡' });
  });

  it('兩張照片：按「分開描述」直接變兩欄，原本的字留在第一欄', () => {
    thumbs = ['a', 'b'];
    const editor = mount({ caption: '蓋城堡' });
    click('[data-caption-split]');
    expect(boxes().map(b => b.value)).toEqual(['蓋城堡', '']);
    expect(root.textContent).toContain('第 1 張');
    expect(root.textContent).toContain('第 2 張');
    type(boxes()[1], '溜滑梯');
    expect(editor.value()).toEqual({
      caption: '蓋城堡\n溜滑梯', captionGroups: [{ size: 1, text: '蓋城堡' }, { size: 1, text: '溜滑梯' }],
    });
  });

  it('三張照片：按「分開描述」先出現三種排法，還沒選之前不能存', () => {
    const editor = mount({ caption: '' });
    click('[data-caption-split]');
    expect([...root.querySelectorAll('[data-caption-arrange]')].map(b => b.textContent.trim()))
      .toEqual(['▢▢│▢ 前二＋後一', '▢│▢▢ 前一＋後二', '▢│▢│▢ 各自描述']);
    expect(boxes()).toHaveLength(0);
    expect(editor.value()).toEqual({ error: '請選擇照片怎麼分組' });
  });

  it('選「前二＋後一」出現兩欄，換成「前一＋後二」字留在原本的位置', () => {
    const editor = mount({ caption: '甲' });
    click('[data-caption-split]');
    click('[data-caption-arrange="2,1"]');
    expect(root.textContent).toContain('第 1、2 張');
    expect(root.textContent).toContain('第 3 張');
    type(boxes()[1], '乙');
    click('[data-caption-arrange="1,2"]');
    expect(boxes().map(b => b.value)).toEqual(['甲', '乙']);
    expect(root.querySelector('[data-caption-arrange="1,2"]').getAttribute('aria-pressed')).toBe('true');
    expect(editor.value().captionGroups).toEqual([{ size: 1, text: '甲' }, { size: 2, text: '乙' }]);
  });

  it('有一段沒寫就不能存', () => {
    const editor = mount({ caption: '甲' });
    click('[data-caption-split]');
    click('[data-caption-arrange="1,1,1"]');
    type(boxes()[1], '乙');
    expect(editor.value()).toEqual({ error: '每段描述都要填寫' });
  });

  it('「改回一段描述」把每段的字接起來，中間換行', () => {
    const editor = mount({ captionGroups: [{ size: 2, text: '前兩張' }, { size: 1, text: '第三張' }] });
    expect(boxes().map(b => b.value)).toEqual(['前兩張', '第三張']);
    click('[data-caption-join]');
    expect(boxes()).toHaveLength(1);
    expect(editor.value()).toEqual({ caption: '前兩張\n第三張' });
  });

  it('照片少到剩一張時，自動變回一段描述，字都留著', () => {
    const editor = mount({ captionGroups: [{ size: 2, text: '前兩張' }, { size: 1, text: '第三張' }] });
    thumbs = ['a'];
    editor.refresh();
    expect(boxes()).toHaveLength(1);
    expect(editor.value()).toEqual({ caption: '前兩張\n第三張' });
  });

  it('照片從三張變兩張時，分開描述變成一張一段', () => {
    const editor = mount({ captionGroups: [{ size: 2, text: '前兩張' }, { size: 1, text: '第三張' }] });
    thumbs = ['a', 'b'];
    editor.refresh();
    expect(editor.value().captionGroups).toEqual([{ size: 1, text: '前兩張' }, { size: 1, text: '第三張' }]);
  });

  it('照片從兩張變三張時，要重新選排法，字不會不見', () => {
    thumbs = ['a', 'b'];
    const editor = mount({ captionGroups: [{ size: 1, text: '一' }, { size: 1, text: '二' }] });
    thumbs = ['a', 'b', 'c'];
    editor.refresh();
    expect(editor.value()).toEqual({ error: '請選擇照片怎麼分組' });
    click('[data-caption-arrange="2,1"]');
    expect(boxes().map(b => b.value)).toEqual(['一', '二']);
  });

  it('每欄上面有那幾張照片的小縮圖，照片換順序後跟著更新', () => {
    const editor = mount({ captionGroups: [{ size: 2, text: '前兩張' }, { size: 1, text: '第三張' }] });
    const srcs = () => [...root.querySelectorAll('.caption-part__thumbs img')].map(img => img.getAttribute('src'));
    expect(srcs()).toEqual(['a', 'b', 'c']);
    thumbs = ['c', 'a', 'b'];
    editor.refresh();
    expect(srcs()).toEqual(['c', 'a', 'b']);
    expect(boxes().map(b => b.value)).toEqual(['前兩張', '第三張']);
  });
});
