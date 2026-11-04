import { escapeHtml } from './escapeHtml.js';
import { nestedEntryFormDialog, wireNestedEntryForm } from './formPopup.js';
import { discardInput } from './unsavedInput.js';
import { oneAtATime } from './oneAtATime.js';

// The 「套用其他幼兒…」 popup shared by 適性紀錄's course plan and 課程月計畫: pick one other child,
// confirm what will be replaced, copy. Always a popup, desktop too.
// sources: [{ id, label }]; confirmMessage(id) → the confirm text; copy(id) does the work.
export function renderCopyFromChildPanel(
  host,
  { trigger, title, emptyText, sources, confirmMessage, copy, onChange,
    confirmCopy = message => (typeof confirm === 'function' ? confirm(message) : false) }
) {
  host.innerHTML = nestedEntryFormDialog(`
    <form class="panel-form" data-copy-plan-form>
      <h3 class="panel-form__title">${escapeHtml(title)}</h3>
      ${sources.length === 0
        ? `<p>${escapeHtml(emptyText)}</p>`
        : `<fieldset class="panel-form__field">
            <legend>幼兒</legend>
            ${sources.map(source => `
              <label class="panel-form__checkbox-row">
                <input type="radio" name="copy-plan-source" value="${escapeHtml(source.id)}"> ${escapeHtml(source.label)}
              </label>`).join('')}
          </fieldset>`}
      <div class="entry-form__actions">
        ${sources.length === 0 ? '' : '<button type="submit" class="btn btn--primary btn--small">套用</button>'}
        <button type="button" class="btn btn--outline btn--small" data-action="close-copy-plan">${sources.length === 0 ? '關閉' : '取消'}</button>
      </div>
      <p class="field-error" data-error="copy"></p>
    </form>
  `, true);

  const form = host.querySelector('[data-copy-plan-form]');
  const dialog = form.closest('dialog');
  wireNestedEntryForm(trigger, form);
  form.querySelector('[data-action="close-copy-plan"]').addEventListener('click', () => dialog.close());

  // However it closes (取消, ×, backdrop, Escape), drop the pick and the old error so reopening starts
  // clean instead of showing a picked-but-not-copied radio.
  dialog.addEventListener('close', () => {
    discardInput(form);
    form.querySelector('[data-error="copy"]').textContent = '';
  });

  const selectedSource = () => {
    const checked = form.querySelector('input[name="copy-plan-source"]:checked');
    return checked && sources.find(source => String(source.id) === checked.value);
  };

  const updateSubmitButton = () => {
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = !selectedSource();
  };

  updateSubmitButton();
  form.addEventListener('change', updateSubmitButton);

  form.addEventListener('submit', oneAtATime(async event => {
    event.preventDefault();
    const source = selectedSource();
    if (!source) return;
    try {
      if (!confirmCopy(await confirmMessage(source.id))) return;
      await copy(source.id);
    } catch (err) {
      form.querySelector('[data-error="copy"]').textContent = '套用失敗，請再試一次';
      return;
    }
    dialog.close();
    onChange();
  }));
}
