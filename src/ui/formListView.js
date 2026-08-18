import { addForm, listFormsForChild, deleteForm } from '../storage/db.js';
import { suggestTier } from '../domain/ageTier.js';
import { TIERS } from '../data/indicators.js';
import { escapeHtml } from './escapeHtml.js';
import { currentRocYear, periodSelectsHtml, combinedPeriod } from './periodFields.js';

export async function renderFormListView(
  container,
  { child, onSelectForm, onBack, onAggregate = () => {}, confirmDelete = message => (typeof confirm === 'function' ? confirm(message) : false) }
) {
  const forms = await listFormsForChild(child.id);
  const today = new Date().toISOString().slice(0, 10);
  const suggested = suggestTier(child.birthDate, today);
  const defaultYear = currentRocYear();
  const defaultMonth = new Date().getMonth() + 1;

  container.innerHTML = `
    <div class="page-header page-header--editor">
      <button type="button" class="btn btn--ghost" data-action="back">← 返回幼兒列表</button>
      <h2 class="page-header__title">${escapeHtml(child.name)} 的適性總表</h2>
      <button type="button" class="btn btn--purple" data-action="aggregate">從適性紀錄彙整</button>
    </div>
    <div class="tab-layout">
      <div class="entry-list-wrap">
        <ul class="card-list">
          ${forms
            .map(
              form =>
                `<li class="card-list__row">
                  <button type="button" class="card-list__item" data-form-id="${escapeHtml(form.id)}">
                    <span class="card-list__name">${escapeHtml(form.tier)} 階段${form.isNew ? '<span class="new-badge">新</span>' : ''}</span>
                    <span class="card-list__meta">${escapeHtml(form.period)}</span>
                  </button>
                  <button type="button" class="card-list__delete" data-delete-form="${escapeHtml(form.id)}" aria-label="刪除${escapeHtml(form.tier)} ${escapeHtml(form.period)}">×</button>
                </li>`
            )
            .join('') || '<li class="card-list__empty">目前還沒有適性總表，請在右側新增，或從適性紀錄彙整</li>'}
        </ul>
        <p class="field-error" data-error="delete"></p>
      </div>
      <form class="panel-form" data-action="add-form">
        <h3 class="panel-form__title">新增適性總表</h3>
        <label class="panel-form__field">
          月齡階段
          <select data-field="tier">
            ${TIERS.map(t => `<option value="${t.code}" ${t.code === suggested ? 'selected' : ''}>${t.code}（${t.label}）</option>`).join('')}
          </select>
        </label>
        <label class="panel-form__field">
          紀錄年月
          ${periodSelectsHtml({
            yearFieldName: 'period-year',
            monthFieldName: 'period-month',
            selectedYear: defaultYear,
            selectedMonth: defaultMonth,
          })}
        </label>
        <label class="entry-form__checkbox">
          <input type="checkbox" data-field="period-is-range"> 涵蓋一段期間（跨多個月份）
        </label>
        <label class="panel-form__field" data-field-group="period-end" hidden>
          至
          ${periodSelectsHtml({
            yearFieldName: 'period-end-year',
            monthFieldName: 'period-end-month',
            selectedYear: defaultYear,
            selectedMonth: defaultMonth,
          })}
        </label>
        <button type="submit" class="btn btn--primary">新增</button>
      </form>
    </div>
  `;

  container.querySelector('[data-action="back"]').addEventListener('click', onBack);
  container.querySelector('[data-action="aggregate"]').addEventListener('click', onAggregate);

  container.querySelector('[data-field="period-is-range"]').addEventListener('change', event => {
    container.querySelector('[data-field-group="period-end"]').hidden = !event.target.checked;
  });

  for (const form of forms) {
    container.querySelector(`[data-form-id="${form.id}"]`).addEventListener('click', () => onSelectForm(form));
  }

  for (const form of forms) {
    container.querySelector(`[data-delete-form="${form.id}"]`).addEventListener('click', async () => {
      if (!confirmDelete(`確定要刪除「${form.tier} ${form.period}」這份適性總表嗎？此操作無法復原。`)) return;
      try {
        await deleteForm(form.id);
        await renderFormListView(container, { child, onSelectForm, onBack, onAggregate, confirmDelete });
      } catch (err) {
        container.querySelector('[data-error="delete"]').textContent = '刪除失敗，請再試一次';
      }
    });
  }

  container.querySelector('[data-action="add-form"]').addEventListener('submit', async event => {
    event.preventDefault();
    const tier = container.querySelector('[data-field="tier"]').value;
    const year = container.querySelector('[data-field="period-year"]').value;
    const month = container.querySelector('[data-field="period-month"]').value.padStart(2, '0');
    const startPeriod = `${year}年${month}月`;
    const isRange = container.querySelector('[data-field="period-is-range"]').checked;
    let period = startPeriod;
    if (isRange) {
      const endYear = container.querySelector('[data-field="period-end-year"]').value;
      const endMonth = container.querySelector('[data-field="period-end-month"]').value.padStart(2, '0');
      period = combinedPeriod(startPeriod, `${endYear}年${endMonth}月`);
    }
    try {
      await addForm({ childId: child.id, tier, period });
      await renderFormListView(container, { child, onSelectForm, onBack, onAggregate, confirmDelete });
    } catch (err) {
      const form = container.querySelector('[data-action="add-form"]');
      let errorEl = form.querySelector('[data-error]');
      if (!errorEl) {
        errorEl = document.createElement('p');
        errorEl.dataset.error = '';
        errorEl.className = 'field-error';
        form.insertAdjacentElement('afterbegin', errorEl);
      }
      errorEl.textContent = '新增失敗，請再試一次';
    }
  });
}
