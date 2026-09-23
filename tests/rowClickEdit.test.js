import { describe, it, expect, vi } from 'vitest';
import { wireRowClickEdit } from '../src/ui/rowClickEdit.js';

function setup() {
  const container = document.createElement('div');
  container.innerHTML = `
    <div data-click-edit id="outer">
      <h4 id="outer-title">項目 <button data-row-edit id="outer-edit">編輯</button><button id="outer-delete">×</button></h4>
      <ul>
        <li data-click-edit id="inner">
          <span id="inner-date">115/04/02</span>
          <button data-row-edit id="inner-edit">編輯</button>
          <div class="entry-form" id="inner-form"><span id="inner-form-text">表單</span><input id="inner-input"></div>
        </li>
      </ul>
    </div>
  `;
  document.body.appendChild(container);
  const outerEdit = vi.fn();
  const innerEdit = vi.fn();
  container.querySelector('#outer-edit').addEventListener('click', outerEdit);
  container.querySelector('#inner-edit').addEventListener('click', innerEdit);
  wireRowClickEdit(container);
  const click = id => container.querySelector(`#${id}`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return { outerEdit, innerEdit, click };
}

describe('wireRowClickEdit', () => {
  it('點一筆的空白處或文字，會打開那一筆自己的編輯', () => {
    const { outerEdit, innerEdit, click } = setup();
    click('outer-title');
    expect(outerEdit).toHaveBeenCalledTimes(1);
    click('inner-date');
    expect(innerEdit).toHaveBeenCalledTimes(1);
    expect(outerEdit).toHaveBeenCalledTimes(1);
  });

  it('點刪除鈕、輸入欄位或打開中的編輯表單，不會觸發編輯', () => {
    const { outerEdit, innerEdit, click } = setup();
    click('outer-delete');
    click('inner-input');
    click('inner-form-text');
    expect(outerEdit).not.toHaveBeenCalled();
    expect(innerEdit).not.toHaveBeenCalled();
  });
});
