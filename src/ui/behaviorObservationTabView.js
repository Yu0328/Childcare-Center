import {
  addBehaviorObservation, listBehaviorObservationsForReport, deleteBehaviorObservation, updateBehaviorObservation,
} from '../storage/parentReportDb.js';
import { escapeHtml } from './escapeHtml.js';

function observationCard(observation) {
  return `
    <div class="indicator-block" data-behavior-observation="${escapeHtml(observation.id)}">
      <h4 class="indicator-block__title">
        行為觀察－${escapeHtml(observation.title)}
        <span class="indicator-block__actions">
          <button type="button" class="btn btn--edit btn--small" data-edit-observation="${escapeHtml(observation.id)}" aria-label="編輯行為觀察：${escapeHtml(observation.title)}">編輯</button>
          <button type="button" class="btn--delete-circle" data-delete-observation="${escapeHtml(observation.id)}" aria-label="刪除行為觀察：${escapeHtml(observation.title)}">×</button>
        </span>
      </h4>
      <p class="entry-row__note">${escapeHtml(observation.narrative)}</p>
      <div class="entry-form" data-observation-edit-form-for="${escapeHtml(observation.id)}" hidden>
        <label class="panel-form__field">標題 <input data-observation-edit-field="title" data-observation-id="${escapeHtml(observation.id)}" value="${escapeHtml(observation.title)}"></label>
        <label class="panel-form__field">敘述 <textarea data-observation-edit-field="narrative" data-observation-id="${escapeHtml(observation.id)}">${escapeHtml(observation.narrative)}</textarea></label>
        <div class="entry-form__actions">
          <button type="button" class="btn btn--primary btn--small" data-observation-edit-save-for="${escapeHtml(observation.id)}">儲存</button>
          <button type="button" class="btn btn--outline btn--small" data-observation-edit-cancel-for="${escapeHtml(observation.id)}">取消</button>
        </div>
        <p class="field-error" data-error></p>
      </div>
    </div>
  `;
}

export async function renderBehaviorObservationTab(
  container,
  { report, onChange, confirmDelete = message => (typeof confirm === 'function' ? confirm(message) : false) }
) {
  const observations = await listBehaviorObservationsForReport(report.id);

  container.innerHTML = `
    <div class="tab-layout">
      <form class="panel-form" data-action="add-observation">
        <h3 class="panel-form__title">新增行為觀察</h3>
        <label class="panel-form__field">標題 <input data-field="title" required></label>
        <label class="panel-form__field">敘述 <textarea data-field="narrative" required></textarea></label>
        <button type="submit" class="btn btn--primary">新增</button>
        <p class="field-error" data-error></p>
      </form>
      <div class="entry-list-wrap">${observations.map(observationCard).join('')}</div>
    </div>
  `;

  container.querySelector('[data-action="add-observation"]').addEventListener('submit', async event => {
    event.preventDefault();
    const title = container.querySelector('[data-field="title"]').value;
    const narrative = container.querySelector('[data-field="narrative"]').value;
    try {
      await addBehaviorObservation({ reportId: report.id, title, narrative });
      onChange();
    } catch (err) {
      container.querySelector('[data-action="add-observation"] [data-error]').textContent = '新增失敗，請再試一次';
    }
  });

  for (const observation of observations) {
    container.querySelector(`[data-delete-observation="${observation.id}"]`).addEventListener('click', async () => {
      if (!confirmDelete(`確定要刪除「${observation.title}」這筆行為觀察嗎？此操作無法復原。`)) return;
      try {
        await deleteBehaviorObservation(observation.id);
        onChange();
      } catch (err) {
        // Non-fatal: entry stays visible; the teacher can retry the delete.
      }
    });

    container.querySelector(`[data-edit-observation="${observation.id}"]`).addEventListener('click', () => {
      const form = container.querySelector(`[data-observation-edit-form-for="${observation.id}"]`);
      form.hidden = !form.hidden;
    });

    container.querySelector(`[data-observation-edit-cancel-for="${observation.id}"]`).addEventListener('click', () => {
      container.querySelector(`[data-observation-edit-form-for="${observation.id}"]`).hidden = true;
    });

    container.querySelector(`[data-observation-edit-save-for="${observation.id}"]`).addEventListener('click', async () => {
      const title = container.querySelector(`[data-observation-edit-field="title"][data-observation-id="${observation.id}"]`).value;
      const narrative = container.querySelector(`[data-observation-edit-field="narrative"][data-observation-id="${observation.id}"]`).value;
      try {
        await updateBehaviorObservation(observation.id, { title, narrative });
        onChange();
      } catch (err) {
        container.querySelector(`[data-observation-edit-form-for="${observation.id}"] [data-error]`).textContent = '更新失敗，請再試一次';
      }
    });
  }
}
