import { listParentReportsForChild } from '../storage/parentReportDb.js';
import { listFormsForChild } from '../storage/db.js';
import { aggregateCoursePlanIntoForm } from '../domain/aggregateCoursePlan.js';
import { escapeHtml } from './escapeHtml.js';

function resultSummaryHtml(skippedDuplicates, reroutedCount) {
  const reroutedSection =
    reroutedCount > 0
      ? `<p>另有 ${reroutedCount} 筆指標不屬於此階段（或無法對應到系統指標），已加進對應總表的備註（匯出總表 Word 時會顯示在最後的備註區塊）</p>`
      : '';
  const skippedSection = skippedDuplicates > 0 ? `<p>已跳過 ${skippedDuplicates} 筆重複資料</p>` : '';

  return `
    <div class="field-error" data-aggregate-result>
      <p>已完成彙整，但：</p>
      ${reroutedSection}
      ${skippedSection}
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

  const forms = await listFormsForChild(child.id);
  const tiers = [...new Set(reports.map(r => r.tier))].sort();
  let selectedTier = tiers[0];
  let selectedMode = 'new';
  let checkedReportIds = new Set();

  function reportsForTier(tier) {
    return reports.filter(r => r.tier === tier).sort((a, b) => a.period.localeCompare(b.period));
  }

  function formsForTier(tier) {
    return forms.filter(f => f.tier === tier).sort((a, b) => a.period.localeCompare(b.period));
  }

  function render(showResult = false, createdForm = null, skippedDuplicates = 0, reroutedCount = 0) {
    const tierReports = reportsForTier(selectedTier);
    const tierForms = formsForTier(selectedTier);
    if (tierForms.length === 0) selectedMode = 'new';

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
                  <input type="checkbox" data-report-checkbox="${escapeHtml(r.id)}" ${checkedReportIds.has(String(r.id)) ? 'checked' : ''}>
                  ${escapeHtml(r.period)}
                </label>
              `
            )
            .join('')}
        </fieldset>
        <fieldset class="panel-form__field">
          <legend>彙整方式</legend>
          <label class="panel-form__checkbox-row">
            <input type="radio" name="target-mode" data-field="target-mode" value="new" ${selectedMode === 'new' ? 'checked' : ''}>
            建立新總表
          </label>
          <label class="panel-form__checkbox-row">
            <input type="radio" name="target-mode" data-field="target-mode" value="existing" ${selectedMode === 'existing' ? 'checked' : ''} ${tierForms.length === 0 ? 'disabled' : ''}>
            合併進現有總表
          </label>
          ${
            selectedMode === 'existing'
              ? `<label class="panel-form__field">
                   選擇要合併進去的總表
                   <select data-field="target-form">
                     <option value="">請選擇</option>
                     ${tierForms.map(f => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.period)}</option>`).join('')}
                   </select>
                 </label>`
              : ''
          }
        </fieldset>
        <button type="submit" class="btn btn--primary">${selectedMode === 'existing' ? '合併進總表' : '建立總表'}</button>
        <p class="field-error" data-error></p>
      </form>
      ${showResult ? resultSummaryHtml(skippedDuplicates, reroutedCount) : ''}
    `;

    container.querySelector('[data-action="back"]').addEventListener('click', onBack);

    container.querySelector('[data-field="tier"]').addEventListener('change', event => {
      selectedTier = event.target.value;
      checkedReportIds = new Set();
      render();
    });

    container.querySelectorAll('[data-field="target-mode"]').forEach(radio => {
      radio.addEventListener('change', event => {
        selectedMode = event.target.value;
        render();
      });
    });

    container.querySelectorAll('[data-report-checkbox]').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        const id = checkbox.dataset.reportCheckbox;
        if (checkbox.checked) checkedReportIds.add(id);
        else checkedReportIds.delete(id);
      });
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

      let targetFormId = null;
      if (selectedMode === 'existing') {
        const targetFormValue = container.querySelector('[data-field="target-form"]').value;
        if (!targetFormValue) {
          errorEl.textContent = '請選擇要合併進去的總表';
          return;
        }
        targetFormId = Number(targetFormValue);
      }

      try {
        const { form, skippedDuplicates: skippedResult, reroutedCount } = await aggregateCoursePlanIntoForm({
          childId: child.id,
          tier: selectedTier,
          reportIds,
          targetFormId,
        });
        if (skippedResult === 0 && reroutedCount === 0) {
          onCreated(form);
        } else {
          render(true, form, skippedResult, reroutedCount);
        }
      } catch (err) {
        errorEl.textContent = '建立失敗，請再試一次';
      }
    });

    if (showResult && createdForm) {
      container.querySelector('[data-action="go-to-form"]').addEventListener('click', () => onCreated(createdForm));
    }
  }

  render();
}
