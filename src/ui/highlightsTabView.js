import { showToast } from './toast.js';
import { compressImage } from '../media/imagePreprocess.js';
import { newUid } from '../storage/dbCore.js';
import {
  addHighlightEntry, listHighlightEntriesForReport, deleteHighlightEntry, saveHighlightEdit, removeHighlightPhoto,
} from '../storage/parentReportDb.js';
import { validCaptionGroups } from '../domain/highlightCaptions.js';
import { escapeHtml } from './escapeHtml.js';
import { formPopupMarkup, wireFormPopup, wireEditForm } from './formPopup.js';
import { wireRowClickEdit } from './rowClickEdit.js';
import { oneAtATime } from './oneAtATime.js';
import { mountCaptionEditor } from './highlightCaptionEditor.js';
import { wirePhotoDragSwap } from './photoDragSwap.js';

// Every thumbnail's object URL pins its photo in memory until revoked. Each render revokes the
// previous render's, so a report with many photos doesn't keep piling up copies on every tab
// switch or save. (The last render's stay until the next one — a bounded, single render's worth.)
let thumbUrls = [];

function thumbUrl(blob) {
  const url = URL.createObjectURL(blob);
  thumbUrls.push(url);
  return url;
}

function revokeThumbUrls() {
  for (const url of thumbUrls) URL.revokeObjectURL(url);
  thumbUrls = [];
}

// One URL per photo for the whole render, however often the photo row and the 描述 boxes' small
// thumbnails are redrawn (every drag and 分開描述 change redraws them).
const photoUrls = new WeakMap();
function photoUrl(photo) {
  if (!photoUrls.has(photo)) photoUrls.set(photo, thumbUrl(photo.blob));
  return photoUrls.get(photo);
}

// Holds a slot while its photo is still being shrunk, so a second pick doesn't land in it too.
const PROCESSING = Symbol('processing');
const isPhoto = slot => Boolean(slot) && slot !== PROCESSING;

function savedThumbHtml(photo, i, entryId) {
  if (!photo) return '<span class="highlight-thumb highlight-thumb--empty"></span>';
  return `
    <span class="highlight-thumb-wrap">
      <img class="highlight-thumb" src="${photoUrl(photo)}" alt="">
      <button type="button" class="highlight-thumb-remove" data-remove-saved-photo="${escapeHtml(entryId)}" data-photo-index="${i}" aria-label="移除第 ${i + 1} 張照片">×</button>
    </span>
  `;
}

// 分開描述: each part sits under its own photos, the way it prints in Word.
function splitPhotosHtml(entry, groups) {
  let i = 0;
  return `
    <div class="highlight-groups">
      ${groups.map(group => {
        const thumbs = Array.from({ length: group.size }, () => savedThumbHtml(entry.photos[i], i++, entry.id)).join('');
        return `
          <div class="highlight-group" style="flex-grow: ${group.size}">
            <div class="highlight-thumbs">${thumbs}</div>
            <p class="highlight-group__text">${escapeHtml(group.text)}</p>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function existingEntryCard(entry) {
  const groups = validCaptionGroups(entry);
  const photos = groups
    ? splitPhotosHtml(entry, groups)
    : `<div class="highlight-thumbs">${[0, 1, 2].map(i => savedThumbHtml(entry.photos[i], i, entry.id)).join('')}</div>`;
  return `
    <div class="indicator-block" data-click-edit data-highlight-entry="${escapeHtml(entry.id)}">
      <p class="entry-row__note highlight-caption-line">${groups ? `分開描述（${groups.length} 段）` : escapeHtml(entry.caption)}</p>
      ${photos}
      <div class="entry-row__actions">
        <button type="button" class="btn btn--edit btn--small" data-row-edit data-edit-highlight="${escapeHtml(entry.id)}" aria-label="編輯點滴分享：${escapeHtml(entry.caption)}">編輯</button>
        <button type="button" class="btn--delete-circle" data-delete-highlight="${escapeHtml(entry.id)}" aria-label="刪除點滴分享：${escapeHtml(entry.caption)}">×</button>
      </div>
      <div class="entry-form" data-highlight-edit-form-for="${escapeHtml(entry.id)}" hidden>
        ${entry.photos.length >= 2 ? '<p class="highlight-edit-photos__hint">按住照片拖到另一張的位置，就能換順序</p>' : ''}
        <div class="highlight-edit-photos" data-edit-photos-for="${escapeHtml(entry.id)}"></div>
        <div data-caption-editor-for="${escapeHtml(entry.id)}"></div>
        <div class="entry-form__actions">
          <button type="button" class="btn btn--primary btn--small" data-highlight-edit-save-for="${escapeHtml(entry.id)}">儲存</button>
          <button type="button" class="btn btn--outline btn--small" data-highlight-edit-cancel-for="${escapeHtml(entry.id)}">取消</button>
        </div>
        <p class="field-error" data-error></p>
      </div>
    </div>
  `;
}

export async function renderHighlightsTab(
  container,
  { report, onChange, confirmDelete = message => (typeof confirm === 'function' ? confirm(message) : false) }
) {
  const entries = await listHighlightEntriesForReport(report.id);
  const pendingPhotos = [null, null, null]; // in-memory only, see Task 17's design note
  // Shrinking a phone photo takes about a second; 新增 waits on this so a quick tap doesn't save
  // before the photos are ready (which used to drop them silently).
  let processing = Promise.resolve();
  revokeThumbUrls();

  container.innerHTML = `
    <div class="tab-layout">
      ${formPopupMarkup({
        formHtml: `
          <form class="panel-form panel-form--wide" data-action="add-highlight">
            <h3 class="panel-form__title">新增點滴分享</h3>
            <div class="highlight-upload-grid">
              ${[0, 1, 2]
                .map(
                  i => `
                    <label class="highlight-upload-slot" data-drop-slot="${i}">
                      <span class="highlight-upload-slot__label">照片 ${i + 1}</span>
                      <input type="file" accept="image/*" multiple class="highlight-upload-slot__input" data-photo-slot="${i}">
                      <span class="highlight-upload-slot__preview" data-preview-slot="${i}"></span>
                    </label>
                  `
                )
                .join('')}
            </div>
            <div data-caption-editor="new"></div>
            <button type="submit" class="btn btn--primary">新增</button>
            <p class="field-error" data-error></p>
          </form>
        `,
        fabLabel: '新增點滴分享',
      })}
      <div class="entry-list-wrap">${entries.map(existingEntryCard).join('')}</div>
    </div>
  `;

  wireFormPopup(container);
  wireRowClickEdit(container);

  const newCaption = mountCaptionEditor(container.querySelector('[data-caption-editor="new"]'), {
    getThumbs: () => pendingPhotos.filter(isPhoto).map(photoUrl),
  });

  function drawPendingSlot(i) {
    const previewEl = container.querySelector(`[data-preview-slot="${i}"]`);
    const slot = pendingPhotos[i];
    if (slot === PROCESSING) {
      previewEl.textContent = '處理中…';
      return;
    }
    if (!slot) {
      previewEl.innerHTML = '';
      return;
    }
    previewEl.innerHTML = `
      <img class="highlight-thumb" src="${photoUrl(slot)}" alt="" draggable="false">
      <button type="button" class="highlight-thumb-remove" data-remove-pending-slot="${i}" aria-label="移除照片 ${i + 1}">×</button>
    `;
    previewEl.querySelector(`[data-remove-pending-slot="${i}"]`).addEventListener('click', event => {
      // The slot is a <label> wrapping the file input, so any click that bubbles up to it
      // re-opens the native file picker. Stop the click here so removing a photo doesn't
      // immediately prompt the teacher to pick a new one.
      event.preventDefault();
      event.stopPropagation();
      pendingPhotos[i] = null;
      drawPendingSlot(i);
      newCaption.refresh();
    });
  }

  // Fills empty slots starting at `startIndex` with as many of the chosen/dropped files as fit,
  // so picking or dropping several photos at once no longer requires repeating the action per slot.
  function handleFilesChosen(startIndex, fileList) {
    const files = [...(fileList || [])];
    const picks = [];
    let slot = startIndex;
    for (const file of files) {
      while (slot < 3 && pendingPhotos[slot]) slot++;
      if (slot >= 3) break;
      pendingPhotos[slot] = PROCESSING;
      drawPendingSlot(slot);
      picks.push([slot, file]);
      slot++;
    }
    const skipped = files.length - picks.length;
    container.querySelector('[data-action="add-highlight"] [data-error]').textContent =
      skipped > 0 ? `每則最多 3 張照片，多選的 ${skipped} 張沒有加入` : '';
    const run = (async () => {
      for (const [pickSlot, file] of picks) await handleFileChosen(pickSlot, file);
    })();
    processing = Promise.all([processing, run]);
    return run;
  }

  async function handleFileChosen(i, file) {
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      // Every sync-layer lookup (upload, download, merge-by-union) keys a photo by photoUid; with
      // none assigned here, a new photo was invisible to sync from the moment it was added — it
      // never left toUpload's filter in photoSync.js's collectLocalPhotos().
      pendingPhotos[i] = { ...compressed, photoUid: newUid() };
      drawPendingSlot(i);
    } catch (err) {
      pendingPhotos[i] = null;
      container.querySelector(`[data-preview-slot="${i}"]`).textContent = '照片讀取失敗';
    }
    newCaption.refresh();
  }

  for (const i of [0, 1, 2]) {
    const slotEl = container.querySelector(`[data-drop-slot="${i}"]`);

    container.querySelector(`[data-photo-slot="${i}"]`).addEventListener('change', event => {
      handleFilesChosen(i, event.target.files);
    });

    slotEl.addEventListener('dragover', event => {
      event.preventDefault();
    });
    slotEl.addEventListener('dragenter', event => {
      event.preventDefault();
      slotEl.classList.add('highlight-upload-slot--dragover');
    });
    slotEl.addEventListener('dragleave', () => {
      slotEl.classList.remove('highlight-upload-slot--dragover');
    });
    slotEl.addEventListener('drop', event => {
      event.preventDefault();
      slotEl.classList.remove('highlight-upload-slot--dragover');
      handleFilesChosen(i, event.dataTransfer && event.dataTransfer.files);
    });
  }

  // Dragging a photo onto another slot swaps the two (onto an empty slot: moves it there).
  wirePhotoDragSwap(container.querySelector('.highlight-upload-grid'), {
    itemSelector: '[data-drop-slot]',
    canDrag: slotEl => isPhoto(pendingPhotos[slotEl.dataset.dropSlot]),
    onSwap: (fromEl, toEl) => {
      const from = Number(fromEl.dataset.dropSlot);
      const to = Number(toEl.dataset.dropSlot);
      // A slot still being shrunk gets its photo written by index when done — leave it be.
      if (pendingPhotos[to] === PROCESSING) return;
      [pendingPhotos[from], pendingPhotos[to]] = [pendingPhotos[to], pendingPhotos[from]];
      drawPendingSlot(from);
      drawPendingSlot(to);
      newCaption.refresh();
    },
  });

  container.querySelector('[data-action="add-highlight"]').addEventListener('submit', oneAtATime(async event => {
    event.preventDefault();
    const errorEl = container.querySelector('[data-action="add-highlight"] [data-error]');
    await processing;
    const photos = pendingPhotos.filter(isPhoto);
    if (photos.length === 0) {
      errorEl.textContent = '請至少上傳一張照片';
      return;
    }
    const fields = newCaption.value();
    if (fields.error) {
      errorEl.textContent = fields.error;
      return;
    }
    try {
      await addHighlightEntry({ reportId: report.id, photos, ...fields });
      onChange();
    } catch (err) {
      errorEl.textContent = '新增失敗，請再試一次';
    }
  }));

  for (const entry of entries) {
    container.querySelector(`[data-delete-highlight="${entry.id}"]`).addEventListener('click', oneAtATime(async () => {
      if (!confirmDelete(`確定要刪除這則點滴分享（「${entry.caption}」）嗎？此操作無法復原。`)) return;
      try {
        await deleteHighlightEntry(entry.id);
        onChange();
      } catch (err) {
        // The entry stays visible; say so rather than looking like a dead button.
        showToast('刪除失敗，請再試一次');
      }
    }));

    const editForm = container.querySelector(`[data-highlight-edit-form-for="${entry.id}"]`);
    const cancelButton = container.querySelector(`[data-highlight-edit-cancel-for="${entry.id}"]`);
    wireEditForm(container.querySelector(`[data-edit-highlight="${entry.id}"]`), editForm, cancelButton);
    wireHighlightEditForm(entry, editForm, cancelButton, onChange);

    entry.photos.forEach((photo, i) => {
      const btn = container.querySelector(`[data-remove-saved-photo="${entry.id}"][data-photo-index="${i}"]`);
      if (!btn) return;
      btn.addEventListener('click', oneAtATime(async () => {
        try {
          await removeHighlightPhoto(entry.id, photo.storedIndex);
          onChange();
        } catch (err) {
          container.querySelector(`[data-highlight-entry="${entry.id}"]`).appendChild(
            Object.assign(document.createElement('p'), { className: 'field-error', textContent: '移除照片失敗，請再試一次' })
          );
        }
      }));
    });
  }
}

// An entry's 編輯 form: its photos (drag to reorder) and 描述 (one or 分開描述). Nothing is saved
// until 儲存; 取消 puts back the order and descriptions the entry already had.
function wireHighlightEditForm(entry, editForm, cancelButton, onChange) {
  const photosEl = editForm.querySelector('[data-edit-photos-for]');
  const editorHost = editForm.querySelector('[data-caption-editor-for]');
  let order;
  let caption;

  const drawPhotos = () => {
    photosEl.innerHTML = order
      .map((photoIndex, position) => `
        <span class="highlight-edit-photo" data-edit-photo="${position}">
          <img class="highlight-thumb" src="${photoUrl(entry.photos[photoIndex])}" alt="第 ${position + 1} 張照片" draggable="false">
        </span>
      `)
      .join('');
  };

  // A fresh editor element each time, so a reset doesn't stack a second set of listeners.
  const reset = () => {
    order = entry.photos.map((_, i) => i);
    drawPhotos();
    const editorEl = document.createElement('div');
    editorHost.replaceChildren(editorEl);
    const groups = validCaptionGroups(entry);
    caption = mountCaptionEditor(editorEl, {
      caption: entry.caption,
      captionGroups: groups || undefined,
      getThumbs: () => order.map(i => photoUrl(entry.photos[i])),
    });
  };
  reset();
  cancelButton.addEventListener('click', reset);

  wirePhotoDragSwap(photosEl, {
    itemSelector: '[data-edit-photo]',
    onSwap: (fromEl, toEl) => {
      const from = Number(fromEl.dataset.editPhoto);
      const to = Number(toEl.dataset.editPhoto);
      [order[from], order[to]] = [order[to], order[from]];
      drawPhotos();
      caption.refresh();
    },
  });

  editForm.querySelector('[data-highlight-edit-save-for]').addEventListener('click', oneAtATime(async () => {
    const errorEl = editForm.querySelector('[data-error]');
    const fields = caption.value();
    if (fields.error) {
      errorEl.textContent = fields.error;
      return;
    }
    try {
      await saveHighlightEdit(entry.id, { photoOrder: order.map(i => entry.photos[i].storedIndex), fields });
      onChange();
    } catch (err) {
      errorEl.textContent = '更新失敗，請再試一次';
    }
  }));
}
