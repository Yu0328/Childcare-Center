import { compressImage } from '../media/imagePreprocess.js';
import {
  addHighlightEntry, listHighlightEntriesForReport, deleteHighlightEntry, updateHighlightEntry,
} from '../storage/parentReportDb.js';
import { escapeHtml } from './escapeHtml.js';

function savedThumbHtml(photo, i, entryId) {
  if (!photo) return '<span class="highlight-thumb highlight-thumb--empty"></span>';
  return `
    <span class="highlight-thumb-wrap">
      <img class="highlight-thumb" src="${URL.createObjectURL(photo.blob)}" alt="">
      <button type="button" class="highlight-thumb-remove" data-remove-saved-photo="${escapeHtml(entryId)}" data-photo-index="${i}" aria-label="移除第 ${i + 1} 張照片">×</button>
    </span>
  `;
}

function existingEntryCard(entry) {
  const thumbs = [0, 1, 2].map(i => savedThumbHtml(entry.photos[i], i, entry.id)).join('');
  return `
    <div class="indicator-block" data-highlight-entry="${escapeHtml(entry.id)}">
      <div class="highlight-thumbs">${thumbs}</div>
      <p class="entry-row__note">${escapeHtml(entry.caption)}</p>
      <div class="entry-row__actions">
        <button type="button" class="btn btn--edit btn--small" data-edit-highlight="${escapeHtml(entry.id)}" aria-label="編輯點滴分享：${escapeHtml(entry.caption)}">編輯</button>
        <button type="button" class="btn--delete-circle" data-delete-highlight="${escapeHtml(entry.id)}" aria-label="刪除點滴分享：${escapeHtml(entry.caption)}">×</button>
      </div>
      <div class="entry-form" data-highlight-edit-form-for="${escapeHtml(entry.id)}" hidden>
        <label class="panel-form__field">描述 <textarea data-highlight-edit-field="caption" data-highlight-id="${escapeHtml(entry.id)}">${escapeHtml(entry.caption)}</textarea></label>
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

  container.innerHTML = `
    <div class="tab-layout">
      <form class="panel-form" data-action="add-highlight">
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
        <label class="panel-form__field">描述 <textarea class="highlight-caption" data-field="caption" required></textarea></label>
        <button type="submit" class="btn btn--primary">新增</button>
        <p class="field-error" data-error></p>
      </form>
      <div class="entry-list-wrap">${entries.map(existingEntryCard).join('')}</div>
    </div>
  `;

  function clearPendingSlot(i) {
    pendingPhotos[i] = null;
    const previewEl = container.querySelector(`[data-preview-slot="${i}"]`);
    previewEl.innerHTML = '';
  }

  // Fills empty slots starting at `startIndex` with as many of the chosen/dropped files as fit,
  // so picking or dropping several photos at once no longer requires repeating the action per slot.
  async function handleFilesChosen(startIndex, fileList) {
    const files = [...(fileList || [])];
    let slot = startIndex;
    for (const file of files) {
      while (slot < 3 && pendingPhotos[slot]) slot++;
      if (slot >= 3) break;
      await handleFileChosen(slot, file);
      slot++;
    }
  }

  async function handleFileChosen(i, file) {
    if (!file) return;
    const previewEl = container.querySelector(`[data-preview-slot="${i}"]`);
    try {
      const compressed = await compressImage(file);
      pendingPhotos[i] = compressed;
      previewEl.innerHTML = `
        <img class="highlight-thumb" src="${URL.createObjectURL(compressed.blob)}" alt="">
        <button type="button" class="highlight-thumb-remove" data-remove-pending-slot="${i}" aria-label="移除照片 ${i + 1}">×</button>
      `;
      previewEl.querySelector(`[data-remove-pending-slot="${i}"]`).addEventListener('click', event => {
        // The slot is a <label> wrapping the file input, so any click that bubbles up to it
        // re-opens the native file picker. Stop the click here so removing a photo doesn't
        // immediately prompt the teacher to pick a new one.
        event.preventDefault();
        event.stopPropagation();
        clearPendingSlot(i);
      });
    } catch (err) {
      previewEl.textContent = '照片讀取失敗';
    }
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

  container.querySelector('[data-action="add-highlight"]').addEventListener('submit', async event => {
    event.preventDefault();
    const errorEl = container.querySelector('[data-action="add-highlight"] [data-error]');
    const caption = container.querySelector('[data-field="caption"]').value;
    const photos = pendingPhotos.filter(Boolean);
    if (photos.length === 0) {
      errorEl.textContent = '請至少上傳一張照片';
      return;
    }
    try {
      await addHighlightEntry({ reportId: report.id, photos, caption });
      onChange();
    } catch (err) {
      errorEl.textContent = '新增失敗，請再試一次';
    }
  });

  for (const entry of entries) {
    container.querySelector(`[data-delete-highlight="${entry.id}"]`).addEventListener('click', async () => {
      if (!confirmDelete(`確定要刪除這則點滴分享（「${entry.caption}」）嗎？此操作無法復原。`)) return;
      try {
        await deleteHighlightEntry(entry.id);
        onChange();
      } catch (err) {
        // Non-fatal: entry stays visible; the teacher can retry the delete.
      }
    });

    container.querySelector(`[data-edit-highlight="${entry.id}"]`).addEventListener('click', () => {
      const form = container.querySelector(`[data-highlight-edit-form-for="${entry.id}"]`);
      form.hidden = !form.hidden;
    });

    container.querySelector(`[data-highlight-edit-cancel-for="${entry.id}"]`).addEventListener('click', () => {
      container.querySelector(`[data-highlight-edit-form-for="${entry.id}"]`).hidden = true;
    });

    container.querySelector(`[data-highlight-edit-save-for="${entry.id}"]`).addEventListener('click', async () => {
      const caption = container.querySelector(`[data-highlight-edit-field="caption"][data-highlight-id="${entry.id}"]`).value;
      try {
        await updateHighlightEntry(entry.id, { caption });
        onChange();
      } catch (err) {
        container.querySelector(`[data-highlight-edit-form-for="${entry.id}"] [data-error]`).textContent = '更新失敗，請再試一次';
      }
    });

    entry.photos.forEach((photo, i) => {
      const btn = container.querySelector(`[data-remove-saved-photo="${entry.id}"][data-photo-index="${i}"]`);
      if (!btn) return;
      btn.addEventListener('click', async () => {
        const nextPhotos = entry.photos.filter((_, idx) => idx !== i);
        try {
          await updateHighlightEntry(entry.id, { photos: nextPhotos });
          onChange();
        } catch (err) {
          container.querySelector(`[data-highlight-entry="${entry.id}"]`).appendChild(
            Object.assign(document.createElement('p'), { className: 'field-error', textContent: '移除照片失敗，請再試一次' })
          );
        }
      });
    });
  }
}
