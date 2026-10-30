import { escapeHtml } from './escapeHtml.js';
import {
  ARRANGEMENTS, arrangeCaption, captionFields, groupPhotoLabels, joinCaption,
} from '../domain/highlightCaptions.js';

const ARRANGEMENT_NAMES = { '2,1': '前二＋後一', '1,2': '前一＋後二', '1,1,1': '各自描述' };
const drawing = sizes => sizes.map(size => '▢'.repeat(size)).join('│');
const sum = sizes => sizes.reduce((total, size) => total + size, 0);

// The 描述 area of a 點滴分享 form: one box by default; 「分開描述」 splits it into one box per
// photo group — see docs/superpowers/specs/2026-10-31-highlight-split-captions-design.md.
// getThumbs() returns the current photos' thumbnail URLs in order; refresh() after the photos
// change (added, removed, dragged) redraws to match.
export function mountCaptionEditor(root, { caption = '', captionGroups, getThumbs }) {
  let texts = captionGroups ? captionGroups.map(g => g.text) : [caption];
  let sizes = captionGroups ? captionGroups.map(g => g.size) : null; // null: one description
  let choosing = false; // 分開描述 with three photos, arrangement not picked yet

  const readBoxes = () => {
    const boxes = [...root.querySelectorAll('[data-caption-part]')];
    if (boxes.length) texts = boxes.map(box => box.value);
  };

  function backToOne() {
    texts = [joinCaption(texts.map(text => ({ text })))];
    sizes = null;
    choosing = false;
  }

  // Photos added or removed since the split was chosen: two photos have only one split, three
  // need the arrangement picked again, fewer than two can't be split at all.
  function fitToPhotos(count) {
    if (!sizes && !choosing) return;
    if (sizes && sum(sizes) === count) return;
    if (count < 2) return backToOne();
    const options = ARRANGEMENTS[count];
    sizes = options.length === 1 ? options[0] : null;
    choosing = !sizes;
    if (sizes) texts = arrangeCaption(texts, sizes).map(g => g.text);
  }

  function boxHtml(text, i, label, thumbs) {
    return `
      <div class="caption-part">
        <span class="caption-part__label">
          <span class="caption-part__thumbs">${thumbs.map(src => `<img src="${escapeHtml(src)}" alt="">`).join('')}</span>
          ${escapeHtml(label)}
        </span>
        <textarea class="highlight-caption" data-caption-part="${i}" aria-label="${escapeHtml(label)}的描述" required>${escapeHtml(text)}</textarea>
      </div>
    `;
  }

  function draw() {
    const thumbs = getThumbs();
    fitToPhotos(thumbs.length);
    if (!sizes && !choosing) {
      root.innerHTML = `
        <label class="panel-form__field">描述 <textarea class="highlight-caption" data-field="caption" data-caption-part="0" required>${escapeHtml(texts[0] ?? '')}</textarea></label>
        ${thumbs.length >= 2 ? '<button type="button" class="btn btn--outline btn--small caption-editor__split" data-caption-split>分開描述</button>' : ''}
      `;
      return;
    }
    const options = ARRANGEMENTS[thumbs.length];
    const picker = options.length > 1
      ? `<p class="caption-editor__hint">選擇照片怎麼分組：</p>
        <div class="caption-editor__arrangements">${options.map(option => `
          <button type="button" class="btn btn--outline btn--small" data-caption-arrange="${option}" aria-pressed="${String(!!sizes && String(sizes) === String(option))}">
            <span class="caption-editor__drawing" aria-hidden="true">${drawing(option)}</span> ${ARRANGEMENT_NAMES[option]}
          </button>`).join('')}
        </div>`
      : '';
    let photo = 0;
    const labels = sizes ? groupPhotoLabels(sizes) : [];
    const boxes = sizes
      ? sizes.map((size, i) => boxHtml(texts[i] ?? '', i, labels[i], thumbs.slice(photo, (photo += size)))).join('')
      : '';
    root.innerHTML = `
      ${picker}
      <div class="caption-editor__parts">${boxes}</div>
      <button type="button" class="btn btn--ghost btn--small" data-caption-join>改回一段描述</button>
    `;
  }

  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || !root.contains(button)) return;
    readBoxes();
    if (button.hasAttribute('data-caption-split')) {
      choosing = true;
      fitToPhotos(getThumbs().length);
    } else if (button.hasAttribute('data-caption-arrange')) {
      sizes = button.dataset.captionArrange.split(',').map(Number);
      choosing = false;
      texts = arrangeCaption(texts, sizes).map(g => g.text);
    } else if (button.hasAttribute('data-caption-join')) {
      backToOne();
    } else {
      return;
    }
    draw();
  });

  draw();

  return {
    refresh() {
      readBoxes();
      draw();
    },
    value() {
      readBoxes();
      if (choosing) return { error: '請選擇照片怎麼分組' };
      if (!sizes) return captionFields([{ size: 0, text: texts[0] ?? '' }]);
      if (texts.some(text => !text.trim())) return { error: '每段描述都要填寫' };
      return captionFields(sizes.map((size, i) => ({ size, text: texts[i] })));
    },
  };
}
