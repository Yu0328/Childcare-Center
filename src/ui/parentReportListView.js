import { addParentReport, listParentReportsForChild, deleteParentReport } from '../storage/parentReportDb.js';
import { suggestTier } from '../domain/ageTier.js';
import { TIERS } from '../data/indicators.js';
import { escapeHtml } from './escapeHtml.js';
import { currentRocYear, periodSelectsHtml } from './periodFields.js';

export async function renderParentReportListView(
  container,
  { child, onSelectReport, onBack, confirmDelete = message => (typeof confirm === 'function' ? confirm(message) : false) }
) {
  const reports = await listParentReportsForChild(child.id);
  const today = new Date().toISOString().slice(0, 10);
  const suggested = suggestTier(child.birthDate, today);
  const defaultYear = currentRocYear();
  const defaultMonth = new Date().getMonth() + 1;

  container.innerHTML = `
    <div class="page-header">
      <button type="button" class="btn btn--ghost" data-action="back">← 返回幼兒列表</button>
      <h2 class="page-header__title">${escapeHtml(child.name)} 的適性紀錄(家長版)</h2>
    </div>
    <div class="tab-layout">
      <div class="entry-list-wrap">
        <ul class="card-list">
          ${reports
            .map(
              report =>
                `<li class="card-list__row">
                  <button type="button" class="card-list__item" data-report-id="${escapeHtml(report.id)}">
                    <span class="card-list__name">${escapeHtml(report.tier)} 階段</span>
                    <span class="card-list__meta">${escapeHtml(report.period)}</span>
                  </button>
                  <button type="button" class="card-list__delete" data-delete-report="${escapeHtml(report.id)}" aria-label="刪除${escapeHtml(report.tier)} ${escapeHtml(report.period)}">×</button>
                </li>`
            )
            .join('')}
        </ul>
        <p class="field-error" data-error="delete"></p>
      </div>
      <form class="panel-form" data-action="add-report">
        <h3 class="panel-form__title">新增適性紀錄</h3>
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
        <button type="submit" class="btn btn--primary">新增</button>
      </form>
    </div>
  `;

  container.querySelector('[data-action="back"]').addEventListener('click', onBack);

  for (const report of reports) {
    container.querySelector(`[data-report-id="${report.id}"]`).addEventListener('click', () => onSelectReport(report));
  }

  for (const report of reports) {
    container.querySelector(`[data-delete-report="${report.id}"]`).addEventListener('click', async () => {
      if (!confirmDelete(`確定要刪除「${report.tier} ${report.period}」這份適性紀錄嗎？此操作無法復原。`)) return;
      try {
        await deleteParentReport(report.id);
        await renderParentReportListView(container, { child, onSelectReport, onBack, confirmDelete });
      } catch (err) {
        container.querySelector('[data-error="delete"]').textContent = '刪除失敗，請再試一次';
      }
    });
  }

  container.querySelector('[data-action="add-report"]').addEventListener('submit', async event => {
    event.preventDefault();
    const tier = container.querySelector('[data-field="tier"]').value;
    const year = container.querySelector('[data-field="period-year"]').value;
    const month = container.querySelector('[data-field="period-month"]').value.padStart(2, '0');
    const period = `${year}年${month}月`;
    try {
      await addParentReport({ childId: child.id, tier, period });
      await renderParentReportListView(container, { child, onSelectReport, onBack, confirmDelete });
    } catch (err) {
      const form = container.querySelector('[data-action="add-report"]');
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
