import { listParentReportsForChild } from '../storage/parentReportDb.js';
import { listFormsForChild } from '../storage/db.js';
import { planCoursePlanAggregation, applyCoursePlanAggregation } from '../domain/aggregateCoursePlan.js';
import { escapeHtml } from './escapeHtml.js';

function unresolvedListHtml(unresolved) {
  if (unresolved.length === 0) return '';
  return `
    <p>以下 ${unresolved.length} 筆不屬於此階段的指標（或找不到對應的系統指標），將加入總表的備註區塊，不會另外建立或加進其他階段的總表，請確認內容無誤：</p>
    <ul>
      ${unresolved
        .map(
          row =>
            `<li>${escapeHtml(row.indicatorCode)}　${escapeHtml(row.description ?? row.activityName ?? '')}　${escapeHtml(row.date)}　${escapeHtml(row.note)}</li>`
        )
        .join('')}
    </ul>
  `;
}

// Shown before anything is written — see planCoursePlanAggregation. Only the entries that actually
// need a human's attention (off-tier/unresolved codes, exact-duplicate skips) are called out; a
// clean plan skips this screen entirely (see the submit handler below).
function previewHtml(plan) {
  const skippedSection = plan.totalSkippedDuplicates > 0 ? `<p>將跳過 ${plan.totalSkippedDuplicates} 筆重複資料</p>` : '';

  return `
    <div class="field-error" data-aggregate-preview>
      <p>彙整前請先確認以下內容：</p>
      ${unresolvedListHtml(plan.unresolved)}
      ${skippedSection}
      <div class="entry-form__actions">
        <button type="button" class="btn btn--primary" data-action="confirm-aggregate">確認彙整</button>
        <button type="button" class="btn btn--outline" data-action="cancel-preview">返回修改</button>
      </div>
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
  let previewPlan = null; // set by submit when the plan needs a human look before committing

  function reportsForTier(tier) {
    return reports.filter(r => r.tier === tier).sort((a, b) => a.period.localeCompare(b.period));
  }

  function formsForTier(tier) {
    return forms.filter(f => f.tier === tier).sort((a, b) => a.period.localeCompare(b.period));
  }

  function render() {
    const tierReports = reportsForTier(selectedTier);
    const tierForms = formsForTier(selectedTier);
    if (tierForms.length === 0) selectedMode = 'new';

    container.innerHTML = `
      <div class="page-header">
        <button type="button" class="btn btn--ghost" data-action="back">← 返回適性總表列表</button>
        <h2 class="page-header__title">${escapeHtml(child.name)}　從適性紀錄彙整</h2>
      </div>
      ${
        previewPlan
          ? previewHtml(previewPlan)
          : `<form class="panel-form" data-action="aggregate">
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
            </form>`
      }
    `;

    container.querySelector('[data-action="back"]').addEventListener('click', onBack);

    if (previewPlan) {
      container.querySelector('[data-action="confirm-aggregate"]').addEventListener('click', async () => {
        const { form } = await applyCoursePlanAggregation(previewPlan);
        onCreated(form);
      });
      container.querySelector('[data-action="cancel-preview"]').addEventListener('click', () => {
        previewPlan = null;
        render();
      });
      return;
    }

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
        const plan = await planCoursePlanAggregation({ childId: child.id, tier: selectedTier, reportIds, targetFormId });
        const isClean = plan.unresolved.length === 0 && plan.totalSkippedDuplicates === 0;
        if (isClean) {
          const { form } = await applyCoursePlanAggregation(plan);
          onCreated(form);
        } else {
          previewPlan = plan;
          render();
        }
      } catch (err) {
        errorEl.textContent = '建立失敗，請再試一次';
      }
    });
  }

  render();
}
