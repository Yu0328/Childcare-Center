import { escapeHtml } from './escapeHtml.js';
import { oneAtATime } from './oneAtATime.js';
import { lockBodyScroll, unlockBodyScroll, closeOnBackdropClick } from './formPopup.js';
import {
  updateCourseOccurrence, updateDevelopmentRecordEntry, updateBehaviorObservation, updateHighlightEntry,
} from '../storage/parentReportDb.js';

const SAVE = {
  occurrence: (id, text) => updateCourseOccurrence(id, { note: text }),
  developmentRecord: (id, text) => updateDevelopmentRecordEntry(id, { narrative: text }),
  observationTitle: (id, text) => updateBehaviorObservation(id, { title: text }),
  observationNarrative: (id, text) => updateBehaviorObservation(id, { narrative: text }),
  highlight: (id, text) => updateHighlightEntry(id, { caption: text }),
};

// Shown by the 適性紀錄 匯出 button when findTodayWords() finds anything — lets the teacher reword
// each 今天/今日 before a parent reads it out of context. Edits are saved back to the records.
// Resolves 'export' (saved, caller should export), 'saved' (saved only), or 'cancel'.
export function openTodayWordCheck(hits) {
  const dialog = document.createElement('dialog');
  dialog.className = 'form-popup form-popup--wide today-check';
  dialog.innerHTML = `
    <button type="button" class="form-popup__close" data-action="close-form-popup" aria-label="關閉">×</button>
    <div class="entry-form today-check__body">
      <p class="today-check__hint">以下內容含有『今天』或『今日』，可以在這裡修改</p>
      ${hits.map((hit, index) => `
        <label class="panel-form__field">${escapeHtml(hit.label)}
          ${hit.kind === 'observationTitle'
            ? `<input data-today-field="${index}" value="${escapeHtml(hit.text)}">`
            : `<textarea data-today-field="${index}">${escapeHtml(hit.text)}</textarea>`}
        </label>
      `).join('')}
      <p class="field-error" data-error></p>
      <div class="entry-form__actions today-check__actions">
        <button type="button" class="btn btn--primary btn--small" data-today-action="save-export">儲存並匯出</button>
        <button type="button" class="btn btn--outline btn--small" data-today-action="save">只儲存</button>
        <button type="button" class="btn btn--ghost btn--small" data-today-action="cancel">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  return new Promise(resolve => {
    let result = 'cancel';
    const save = outcome => oneAtATime(async () => {
      try {
        for (const field of dialog.querySelectorAll('[data-today-field]')) {
          const hit = hits[Number(field.dataset.todayField)];
          if (field.value !== hit.text) await SAVE[hit.kind](hit.id, field.value);
        }
      } catch {
        dialog.querySelector('[data-error]').textContent = '儲存失敗，請再試一次';
        return;
      }
      result = outcome;
      dialog.close();
    });
    dialog.querySelector('[data-today-action="save-export"]').addEventListener('click', save('export'));
    dialog.querySelector('[data-today-action="save"]').addEventListener('click', save('saved'));
    dialog.querySelector('[data-today-action="cancel"]').addEventListener('click', () => dialog.close());
    dialog.querySelector('[data-action="close-form-popup"]').addEventListener('click', () => dialog.close());
    closeOnBackdropClick(dialog);
    // Covers every way out — the buttons above, ×, backdrop click, and Escape.
    dialog.addEventListener('close', () => {
      unlockBodyScroll();
      dialog.remove();
      resolve(result);
    });
    dialog.showModal();
    lockBodyScroll();
  });
}
