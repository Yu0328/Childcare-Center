import { addChild, listChildren } from '../storage/db.js';
import { addMonthlyCoursePlan, getOrCreatePlanSlot, addPlanSlotItem, setChildItemOverride } from '../storage/monthlyPlanDb.js';
import { TIERS } from '../data/indicators.js';
import { escapeHtml } from './escapeHtml.js';
import { currentRocYear, periodSelectsHtml, parsePeriod } from './periodFields.js';
import { birthDateSelectsHtml, wireBirthDateSelects, parseBirthDateSelects } from './birthDateField.js';

const NEW_CHILD_VALUE = '__new__';

// birthDateSelectsHtml/wireBirthDateSelects/parseBirthDateSelects all key off a `data-field`
// attribute equal to the *FieldName argument (see childListView.js's single-child usage) — there's
// no per-index test-facing attribute baked in. Per-child field names below keep those three
// functions working correctly across N children (each gets its own unique data-field value,
// looked up against the whole container); the data-child-new-birthDate-* attributes are added on
// top, purely so the preview screen's own markup (and tests) can address "the year select for
// child 0" without knowing the internal field-name string.
function birthDateFieldNames(index) {
  return {
    yearFieldName: `child-new-birthDate-year-${index}`,
    monthFieldName: `child-new-birthDate-month-${index}`,
    dayFieldName: `child-new-birthDate-day-${index}`,
  };
}

function newChildBirthDateHtml(index) {
  const fieldNames = birthDateFieldNames(index);
  return birthDateSelectsHtml(fieldNames)
    .replace(`data-field="${fieldNames.yearFieldName}"`, `data-field="${fieldNames.yearFieldName}" data-child-new-birthDate-year="${index}"`)
    .replace(`data-field="${fieldNames.monthFieldName}"`, `data-field="${fieldNames.monthFieldName}" data-child-new-birthDate-month="${index}"`)
    .replace(`data-field="${fieldNames.dayFieldName}"`, `data-field="${fieldNames.dayFieldName}" data-child-new-birthDate-day="${index}"`);
}

function childBlock(parsedChild, index, existingChildren) {
  const nameMatches = parsedChild.name ? existingChildren.filter(c => c.name === parsedChild.name) : [];
  const preselected = nameMatches.length === 1 ? nameMatches[0].id : NEW_CHILD_VALUE;
  const itemCount = parsedChild.overrides.length;

  return `
    <fieldset class="panel-form__field import-preview__child" data-child-block="${index}">
      <legend>
        <label><input type="checkbox" data-child-include="${index}" checked> ${escapeHtml(parsedChild.name || '（未知姓名）')}</label>
      </legend>
      <label class="panel-form__field">
        比對小朋友
        <select data-child-select="${index}">
          <option value="${NEW_CHILD_VALUE}" ${preselected === NEW_CHILD_VALUE ? 'selected' : ''}>建立新小朋友</option>
          ${existingChildren
            .map(c => `<option value="${escapeHtml(c.id)}" ${preselected === c.id ? 'selected' : ''}>${escapeHtml(c.name)}（${escapeHtml(c.birthDate)}）</option>`)
            .join('')}
        </select>
      </label>
      <div class="import-preview__new-child" data-child-new-fields="${index}" ${preselected === NEW_CHILD_VALUE ? '' : 'hidden'}>
        <label class="panel-form__field">姓名 <input data-child-new-name="${index}" value="${escapeHtml(parsedChild.name ?? '')}"></label>
        <label class="panel-form__field">
          出生日期
          ${newChildBirthDateHtml(index)}
        </label>
      </div>
      <label class="panel-form__field">
        月齡階段
        <select data-child-tier="${index}">
          <option value="" ${parsedChild.tier ? '' : 'selected'}>請選擇</option>
          ${TIERS.map(t => `<option value="${t.code}" ${t.code === parsedChild.tier ? 'selected' : ''}>${t.code}（${t.label}）</option>`).join('')}
        </select>
      </label>
      <p class="import-preview__entry-note">共 ${itemCount} 項標記為未達成／請假／更換課程</p>
    </fieldset>
  `;
}

export function renderMonthlyPlanImportPreviewView(container, { parsed, onCancel, onImported }) {
  return renderAsync(container, { parsed, onCancel, onImported });
}

async function renderAsync(container, { parsed, onCancel, onImported }) {
  const existingChildren = await listChildren();
  const defaultRocYear = currentRocYear();
  const defaultMonth = new Date().getMonth() + 1;
  const { year: parsedYear, month: parsedMonth } = parsePeriod(parsed.period);

  container.innerHTML = `
    <div class="page-header">
      <button type="button" class="btn btn--ghost" data-action="cancel">← 取消匯入</button>
      <h2 class="page-header__title">確認匯入內容（課程月計畫）</h2>
    </div>
    ${
      parsed.warnings.length > 0
        ? `<ul class="import-preview__warnings">${parsed.warnings.map(w => `<li class="field-error">${escapeHtml(w)}</li>`).join('')}</ul>`
        : ''
    }
    <form class="panel-form panel-form--import-grid" data-action="confirm-import">
      <h3 class="panel-form__title">年月</h3>
      ${periodSelectsHtml({
        yearFieldName: 'period-year',
        monthFieldName: 'period-month',
        selectedYear: parsedYear ?? defaultRocYear,
        selectedMonth: parsedMonth ?? defaultMonth,
      })}

      <h3 class="panel-form__title">小朋友（共 ${parsed.children.length} 位）</h3>
      <div class="import-preview__children">
        ${parsed.children.map((c, i) => childBlock(c, i, existingChildren)).join('') || '<p>沒有偵測到任何小朋友</p>'}
      </div>

      <button type="submit" class="btn btn--primary">確認匯入</button>
      <p class="field-error" data-error></p>
    </form>
  `;

  container.querySelector('[data-action="cancel"]').addEventListener('click', onCancel);

  parsed.children.forEach((_, index) => {
    wireBirthDateSelects(container, birthDateFieldNames(index));
    container.querySelector(`[data-child-select="${index}"]`).addEventListener('change', event => {
      container.querySelector(`[data-child-new-fields="${index}"]`).hidden = event.target.value !== NEW_CHILD_VALUE;
    });
  });

  container.querySelector('[data-action="confirm-import"]').addEventListener('submit', async event => {
    event.preventDefault();
    const errorEl = container.querySelector('[data-error]');

    const year = container.querySelector('[data-field="period-year"]').value;
    const month = container.querySelector('[data-field="period-month"]').value.padStart(2, '0');
    const period = `${year}年${month}月`;

    const includedIndexes = parsed.children
      .map((_, i) => i)
      .filter(i => container.querySelector(`[data-child-include="${i}"]`).checked);

    try {
      // Validation pre-pass: touch nothing in IndexedDB yet. Every included child must
      // resolve cleanly (new-child fields filled in, existing-child lookup succeeds, tier
      // matches a real slotsByTier entry) before any addChild/addMonthlyCoursePlan write
      // happens — otherwise a later child's validation failure would leave an earlier
      // child's addChild already committed as an orphan, and resubmitting after the fix
      // would create it again as a duplicate.
      const resolutions = [];
      for (const index of includedIndexes) {
        const select = container.querySelector(`[data-child-select="${index}"]`);
        const tier = container.querySelector(`[data-child-tier="${index}"]`).value;
        const label = parsed.children[index].name || '（未知姓名）';

        let pending;
        if (select.value === NEW_CHILD_VALUE) {
          const name = container.querySelector(`[data-child-new-name="${index}"]`).value;
          const birthDate = parseBirthDateSelects(container, birthDateFieldNames(index));
          if (!name || !birthDate) throw new Error('請完整填寫新小朋友的姓名與出生日期');
          pending = { isNew: true, name, birthDate };
        } else {
          // select.value is always a string; existing child ids are numeric IndexedDB
          // autoIncrement keys, so compare as strings rather than losing the match to a type
          // mismatch.
          const existingChild = existingChildren.find(c => String(c.id) === select.value);
          if (!existingChild) throw new Error(`找不到「${label}」比對到的既有小朋友`);
          pending = { isNew: false, child: existingChild };
        }

        if (!tier) throw new Error(`請為「${label}」選擇月齡階段`);
        if (!(tier in parsed.slotsByTier)) {
          throw new Error(`找不到「${tier}」的課程內容，請確認「${label}」的階段是否正確`);
        }

        resolutions.push({ ...pending, tier, overrides: parsed.children[index].overrides });
      }

      // Write pass: validation above already passed for every included child, so it's safe
      // to start creating records now.
      const resolvedChildren = [];
      for (const r of resolutions) {
        const child = r.isNew ? await addChild({ name: r.name, birthDate: r.birthDate }) : r.child;
        resolvedChildren.push({ child, tier: r.tier, overrides: r.overrides });
      }

      const childIds = resolvedChildren.map(rc => rc.child.id);
      const childTiers = Object.fromEntries(resolvedChildren.map(rc => [rc.child.id, rc.tier]));
      const plan = await addMonthlyCoursePlan({ period, childIds, childTiers });

      const tiersUsed = [...new Set(resolvedChildren.map(rc => rc.tier))];
      const itemIdsBySlotKey = new Map();
      for (const tier of tiersUsed) {
        for (const slot of parsed.slotsByTier[tier] || []) {
          const createdSlot = await getOrCreatePlanSlot({ planId: plan.id, tier, weekIndex: slot.weekIndex, weekday: slot.weekday });
          const itemIds = [];
          for (const item of slot.items) {
            const created = await addPlanSlotItem({ slotId: createdSlot.id, indicatorCode: item.indicatorCode, activityName: item.activityName, indicatorText: item.indicatorText });
            itemIds.push(created.id);
          }
          itemIdsBySlotKey.set(`${tier}:${slot.weekIndex}:${slot.weekday}`, itemIds);
        }
      }

      for (const rc of resolvedChildren) {
        for (const override of rc.overrides) {
          const itemIds = itemIdsBySlotKey.get(`${rc.tier}:${override.weekIndex}:${override.weekday}`);
          const itemId = itemIds && itemIds[override.itemIndex];
          if (!itemId) continue;
          await setChildItemOverride({
            planId: plan.id,
            childId: rc.child.id,
            itemId,
            notAchieved: override.notAchieved,
            replaced: override.replaced,
            replacementText: override.replacementText,
          });
        }
      }

      onImported();
    } catch (err) {
      errorEl.textContent = `匯入失敗，請再試一次（${err?.message || err}）`;
    }
  });
}
