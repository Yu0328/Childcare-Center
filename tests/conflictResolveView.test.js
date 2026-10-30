import { describe, it, expect, beforeEach } from 'vitest';
import { renderConflictResolveView } from '../src/ui/conflictResolveView.js';

describe('renderConflictResolveView', () => {
  let container;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  const conflicts = [
    {
      uid: 'u1', store: 'behaviorObservations',
      fields: [{ field: 'narrative', local: '本機寫的觀察', cloud: '雲端寫的觀察' }],
      localPayload: { title: '午睡' }, cloudPayload: { title: '午睡' },
    },
  ];

  it('顯示兩邊的內容與三個選項', () => {
    renderConflictResolveView(container, { conflicts });
    expect(container.textContent).toContain('本機寫的觀察');
    expect(container.textContent).toContain('雲端寫的觀察');
    expect(container.querySelector('[data-choice="local"][data-uid="u1"]').textContent).toContain('保留');
    expect(container.querySelector('[data-choice="cloud"][data-uid="u1"]')).toBeTruthy();
    expect(container.querySelector('[data-choice="both"][data-uid="u1"]')).toBeTruthy();
  });

  it('點滴分享的分開描述顯示每一段的文字，不是「2 項」', () => {
    renderConflictResolveView(container, {
      conflicts: [{
        uid: 'h1', store: 'highlightEntries',
        fields: [{
          field: 'captionGroups',
          local: [{ size: 2, text: '前兩張' }, { size: 1, text: '第三張' }],
          cloud: [{ size: 1, text: '第一張' }, { size: 2, text: '後兩張' }],
        }],
        localPayload: {}, cloudPayload: {},
      }],
    });
    expect(container.textContent).toContain('分開描述');
    expect(container.textContent).toContain('前兩張 ／ 第三張');
    expect(container.textContent).toContain('第一張 ／ 後兩張');
  });

  it('資料表與欄位名稱用中文顯示', () => {
    renderConflictResolveView(container, { conflicts });
    expect(container.textContent).toContain('行為觀察');
    expect(container.textContent).toContain('文字紀錄');
  });

  it('全部選完才回傳結果', async () => {
    const twoConflicts = [
      conflicts[0],
      {
        uid: 'u2', store: 'highlightEntries',
        fields: [{ field: 'caption', local: 'A', cloud: 'B' }],
        localPayload: {}, cloudPayload: {},
      },
    ];
    const pending = renderConflictResolveView(container, { conflicts: twoConflicts });

    container.querySelector('[data-choice="cloud"][data-uid="u1"]').click();
    expect(container.querySelector('[data-action="conflicts-done"]').disabled).toBe(true);

    container.querySelector('[data-choice="both"][data-uid="u2"]').click();
    container.querySelector('[data-action="conflicts-done"]').click();

    expect(await pending).toEqual([
      { uid: 'u1', choice: 'cloud' },
      { uid: 'u2', choice: 'both' },
    ]);
  });

  it('「都保留」的說明講清楚會變成兩筆', () => {
    renderConflictResolveView(container, { conflicts });
    expect(container.textContent).toContain('兩筆');
  });
});
