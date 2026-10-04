import { escapeHtml } from './escapeHtml.js';
import { nestedEntryFormDialog, wireNestedEntryForm } from './formPopup.js';
import { oneAtATime } from './oneAtATime.js';
import { findCopySources, planCoursePlanCopy, copyCoursePlan } from '../domain/copyCoursePlan.js';

function copyConfirmMessage({ childName, currentCount, sourceCount, unlinkedRecordCount }) {
  const lines = [
    currentCount > 0
      ? `目前這份的 ${currentCount} 筆課程計畫，會換成「${childName}」的 ${sourceCount} 筆課程計畫。`
      : `會套用「${childName}」的 ${sourceCount} 筆課程計畫。`,
    '發展狀況一律先填 ○，請假、更換課程不會套用，請再逐筆確認。',
  ];
  if (unlinkedRecordCount > 0) lines.push(`有 ${unlinkedRecordCount} 段發展紀錄的對應課程會被取消勾選。`);
  lines.push('確定要套用嗎？');
  return lines.join('\n');
}

// The 適性紀錄 header's 「套用其他幼兒課程計畫」 button opens this — same panel-form look as 課程月計畫's
// 管理幼兒. Always a popup, desktop too: the 課程計畫表 tab's right column is its 新增 form.
export async function renderCopyCoursePlanPanel(
  host,
  { trigger, report, onChange, confirmCopy = message => (typeof confirm === 'function' ? confirm(message) : false) }
) {
  const sources = await findCopySources(report);
  host.innerHTML = nestedEntryFormDialog(`
    <form class="panel-form" data-copy-plan-form>
      <h3 class="panel-form__title">套用其他幼兒課程計畫</h3>
      ${sources.length === 0
        ? '<p>沒有同年齡層、同月份的其他幼兒課程計畫可以套用</p>'
        : `<fieldset class="panel-form__field">
            <legend>幼兒</legend>
            ${sources.map(source => `
              <label class="panel-form__checkbox-row">
                <input type="radio" name="copy-plan-source" value="${escapeHtml(source.report.id)}"> ${escapeHtml(source.childName)}（${source.entryCount} 筆）
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

  const selectedSource = () => {
    const checked = form.querySelector('input[name="copy-plan-source"]:checked');
    return checked && sources.find(source => String(source.report.id) === checked.value);
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
    const ids = { targetReportId: report.id, sourceReportId: source.report.id };
    try {
      const counts = await planCoursePlanCopy(ids);
      if (!confirmCopy(copyConfirmMessage({ childName: source.childName, ...counts }))) return;
      await copyCoursePlan(ids);
    } catch (err) {
      form.querySelector('[data-error="copy"]').textContent = '套用失敗，請再試一次';
      return;
    }
    dialog.close();
    onChange();
  }));
}
