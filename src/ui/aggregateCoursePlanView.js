import { listParentReportsForChild } from '../storage/parentReportDb.js';
import { aggregateCoursePlanIntoForm } from '../domain/aggregateCoursePlan.js';
import { escapeHtml } from './escapeHtml.js';

function failedListHtml(failed) {
  return `
    <div class="field-error" data-aggregate-failed>
      <p>已建立總表，但以下 ${failed.length} 筆因故無法帶入：</p>
      <ul>
        ${failed
          .map(
            item =>
              `<li>${escapeHtml(item.reportPeriod)}　${escapeHtml(item.indicatorCode)}　【${escapeHtml(item.activityName)}】—${escapeHtml(item.reason)}</li>`
          )
          .join('')}
      </ul>
      <button type="button" class="btn btn--primary" data-action="go-to-form">前往查看總表</button>
    </div>
  `;
}

export async function renderAggregateCoursePlanView(container, { child, onCreated, onBack }) {
  const reports = await listParentReportsForChild(child.id);

  if (reports.length === 0) {
    container.innerHTML = `
      <div class="page-header">
        <button type="button" class="btn btn--ghost" data-action="back">← 返回適性總表列表</button>
        <h2 class="page-header__title">${escapeHtml(child.name)}　從適性紀錄彙整</h2>
      </div>
      <p>這位幼兒尚無適性紀錄可彙整</p>
    `;
    container.querySelector('[data-action="back"]').addEventListener('click', onBack);
    return;
  }

  const tiers = [...new Set(reports.map(r => r.tier))].sort();
  let selectedTier = tiers[0];

  function reportsForTier(tier) {
    return reports.filter(r => r.tier === tier).sort((a, b) => a.period.localeCompare(b.period));
  }

  function render(failed = null, createdForm = null) {
    const tierReports = reportsForTier(selectedTier);

    container.innerHTML = `
      <div class="page-header">
        <button type="button" class="btn btn--ghost" data-action="back">← 返回適性總表列表</button>
        <h2 class="page-header__title">${escapeHtml(child.name)}　從適性紀錄彙整</h2>
      </div>
      <form class="panel-form" data-action="aggregate">
        <label class="panel-form__field">
          月齡階段
          <select data-field="tier">
            ${tiers.map(t => `<option value="${escapeHtml(t)}" ${t === selectedTier ? 'selected' : ''}>${escapeHtml(t)} 階段</option>`).join('')}
          </select>
        </label>
        <fieldset class="panel-form__field">
          <legend>選擇要彙整的適性紀錄</legend>
          ${tierReports
            .map(
              r => `
                <label class="panel-form__checkbox-row">
                  <input type="checkbox" data-report-checkbox="${escapeHtml(r.id)}">
                  ${escapeHtml(r.period)}
                </label>
              `
            )
            .join('')}
        </fieldset>
        <button type="submit" class="btn btn--primary">建立總表</button>
        <p class="field-error" data-error></p>
      </form>
      ${failed ? failedListHtml(failed) : ''}
    `;

    container.querySelector('[data-action="back"]').addEventListener('click', onBack);

    container.querySelector('[data-field="tier"]').addEventListener('change', event => {
      selectedTier = event.target.value;
      render();
    });

    container.querySelector('[data-action="aggregate"]').addEventListener('submit', async event => {
      event.preventDefault();
      const errorEl = container.querySelector('[data-action="aggregate"] [data-error]');
      const reportIds = tierReports
        .filter(r => container.querySelector(`[data-report-checkbox="${r.id}"]`).checked)
        .map(r => r.id);

      if (reportIds.length === 0) {
        errorEl.textContent = '請至少勾選一筆適性紀錄';
        return;
      }

      try {
        const { form, failed: failedResult } = await aggregateCoursePlanIntoForm({ childId: child.id, tier: selectedTier, reportIds });
        if (failedResult.length === 0) {
          onCreated(form);
        } else {
          render(failedResult, form);
        }
      } catch (err) {
        errorEl.textContent = '建立失敗，請再試一次';
      }
    });

    if (failed && createdForm) {
      container.querySelector('[data-action="go-to-form"]').addEventListener('click', () => onCreated(createdForm));
    }
  }

  render();
}
