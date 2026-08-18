import { listChildren } from '../storage/db.js';
import { addMonthlyCoursePlan, listMonthlyCoursePlans, deleteMonthlyCoursePlan } from '../storage/monthlyPlanDb.js';
import { suggestTier } from '../domain/ageTier.js';
import { buildMonthlyCalendar } from '../domain/monthlyCalendar.js';
import { seedDefaultPlanSlots } from '../domain/monthlyCoursePlan.js';
import { periodSelectsHtml, parsePeriod, currentRocYear } from './periodFields.js';
import { escapeHtml } from './escapeHtml.js';
import { processImportQueue } from './importQueue.js';
import { parseMonthlyPlanDocxImport } from '../import/monthlyPlanDocxImport.js';
import { renderMonthlyPlanImportPreviewView } from './monthlyPlanImportPreviewView.js';

export async function renderMonthlyPlanListView(
  container,
  { onSelectPlan, onBack, confirmDelete = message => (typeof confirm === 'function' ? confirm(message) : false) }
) {
  const plans = await listMonthlyCoursePlans();
  const children = await listChildren();
  const defaultYear = currentRocYear();
  const defaultMonth = new Date().getMonth() + 1;

  container.innerHTML = `
    <div class="page-header page-header--editor">
      ${onBack ? '<button type="button" class="btn btn--ghost" data-action="back">← 返回選擇表單</button>' : ''}
      <h2 class="page-header__title">課程月計畫</h2>
      <div class="page-header__actions">
        <button type="button" class="btn btn--purple" data-action="import-monthly-plan-docx">課程月計畫匯入</button>
      </div>
      <input type="file" accept=".docx" data-field="import-monthly-plan-file" multiple hidden>
    </div>
    <p class="field-error field-error--center" data-error="import"></p>
    <p class="field-success field-success--center" data-success="import"></p>
    <div class="tab-layout">
      <div class="entry-list-wrap">
        <ul class="card-list">
          ${plans
            .map(
              plan =>
                `<li class="card-list__row">
                  <button type="button" class="card-list__item" data-plan-id="${escapeHtml(plan.id)}">
                    <span class="card-list__name">${escapeHtml(plan.period)}${plan.isNew ? '<span class="new-badge">新</span>' : ''}</span>
                    <span class="card-list__meta">${plan.childIds.length} 位幼兒</span>
                  </button>
                  <button type="button" class="card-list__delete" data-delete-plan="${escapeHtml(plan.id)}" aria-label="刪除${escapeHtml(plan.period)}的課程月計畫">×</button>
                </li>`
            )
            .join('')}
        </ul>
        <p class="field-error" data-error="delete"></p>
      </div>
      <form class="panel-form" data-action="add-plan">
        <h3 class="panel-form__title">新增課程月計畫</h3>
        <label class="panel-form__field">
          年月
          ${periodSelectsHtml({
            yearFieldName: 'period-year',
            monthFieldName: 'period-month',
            selectedYear: defaultYear,
            selectedMonth: defaultMonth,
          })}
        </label>
        <fieldset class="panel-form__field">
          <legend>幼兒</legend>
          <div class="panel-form__checkbox-list">
            ${children
              .map(
                child =>
                  `<label class="panel-form__checkbox">
                    <input type="checkbox" data-child-checkbox="${escapeHtml(child.id)}"> ${escapeHtml(child.name)}
                  </label>`
              )
              .join('')}
          </div>
        </fieldset>
        <button type="submit" class="btn btn--primary">新增</button>
        <p class="field-error" data-error></p>
      </form>
    </div>
  `;

  if (onBack) {
    container.querySelector('[data-action="back"]').addEventListener('click', onBack);
  }

  for (const plan of plans) {
    container.querySelector(`[data-plan-id="${plan.id}"]`).addEventListener('click', () => onSelectPlan(plan));
    container.querySelector(`[data-delete-plan="${plan.id}"]`).addEventListener('click', async () => {
      if (!confirmDelete(`確定要刪除「${plan.period}」這份課程月計畫嗎？此操作無法復原。`)) return;
      try {
        await deleteMonthlyCoursePlan(plan.id);
        await renderMonthlyPlanListView(container, { onSelectPlan, onBack, confirmDelete });
      } catch (err) {
        container.querySelector('[data-error="delete"]').textContent = '刪除失敗，請再試一次';
      }
    });
  }

  container.querySelector('[data-action="add-plan"]').addEventListener('submit', async event => {
    event.preventDefault();
    const errorEl = container.querySelector('[data-action="add-plan"] [data-error]');
    errorEl.textContent = '';

    const year = container.querySelector('[data-field="period-year"]').value;
    const month = container.querySelector('[data-field="period-month"]').value.padStart(2, '0');
    const period = `${year}年${month}月`;

    const childIds = children
      .filter(child => container.querySelector(`[data-child-checkbox="${child.id}"]`).checked)
      .map(child => child.id);

    if (childIds.length === 0) {
      errorEl.textContent = '請至少選擇一位幼兒';
      return;
    }

    try {
      const { year: gYear, month: gMonth } = parsePeriod(period);
      const asOfDate = `${gYear + 1911}-${String(gMonth).padStart(2, '0')}-01`;
      const childTiers = {};
      for (const childId of childIds) {
        const child = children.find(c => c.id === childId);
        childTiers[childId] = suggestTier(child.birthDate, asOfDate);
      }

      const plan = await addMonthlyCoursePlan({ period, childIds, childTiers });

      const weeks = buildMonthlyCalendar(gYear + 1911, gMonth);
      const tiers = [...new Set(Object.values(childTiers))];
      await seedDefaultPlanSlots({ planId: plan.id, tiers, weeks });

      onSelectPlan(plan);
    } catch (err) {
      errorEl.textContent = '新增失敗，請再試一次';
    }
  });

  const importFileInput = container.querySelector('[data-field="import-monthly-plan-file"]');
  container.querySelector('[data-action="import-monthly-plan-docx"]').addEventListener('click', () => importFileInput.click());

  importFileInput.addEventListener('change', async () => {
    if (importFileInput.files.length === 0) return;
    await processImportQueue(importFileInput.files, {
      parseFn: parseMonthlyPlanDocxImport,
      renderPreview: renderMonthlyPlanImportPreviewView,
      container,
      backToList: () => renderMonthlyPlanListView(container, { onSelectPlan, onBack, confirmDelete }),
    });
  });
}
