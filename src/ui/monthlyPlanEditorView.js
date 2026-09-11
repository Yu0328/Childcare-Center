import { getChild, listChildren } from '../storage/db.js';
import {
  listPlanSlotsForPlan, listPlanSlotItems, listChildItemOverridesForPlan,
  getOrCreatePlanSlot, addPlanSlotItem, updatePlanSlotItem, deletePlanSlotItem, setChildItemOverride,
  updateMonthlyCoursePlan, deleteChildItemOverridesForChild,
} from '../storage/monthlyPlanDb.js';
import { buildMonthlyCalendar, weekIndexLabel } from '../domain/monthlyCalendar.js';
import { seedDefaultPlanSlots } from '../domain/monthlyCoursePlan.js';
import { parsePeriod } from './periodFields.js';
import { TIERS, getIndicatorsForTier, getIndicator, tierFormLabel } from '../data/indicators.js';
import { calculateAgeInMonths, suggestTier } from '../domain/ageTier.js';
import { escapeHtml } from './escapeHtml.js';
import { headerButtonLabel } from './headerButtonLabel.js';
import { isMobile, fabIconHtml, nestedEntryFormDialog, wireNestedEntryForm, lockBodyScroll, unlockBodyScroll } from './formPopup.js';
import { generateMonthlyPlanDocxBlob } from '../export/monthlyPlanDocxExport.js';
import { downloadBlob } from '../export/downloadBlob.js';

// Loads everything the render pass needs in one pass: the plan's still-existing children (a
// child deleted elsewhere after being added to this plan is silently skipped rather than
// crashing the render), every slot+items for every tier in play, and every override for the
// plan (grouped by "childId:itemId" for O(1) lookup while rendering cells).
async function loadEditorData(plan) {
  // Belt-and-suspenders: childIds should never contain a falsy id (deleteChild in db.js cascades
  // to plans, and backup.js's import filters dead references), but a null/undefined id reaching
  // getChild() would throw synchronously (IndexedDB's store.get(null) raises a DataError) and take
  // down the whole render, so it's dropped here too rather than trusted from upstream.
  const validChildIds = plan.childIds.filter(Boolean);
  const childResults = await Promise.all(validChildIds.map(id => getChild(id)));
  const children = childResults.filter(Boolean);

  const slots = await listPlanSlotsForPlan(plan.id);
  const itemsBySlotId = {};
  for (const slot of slots) {
    itemsBySlotId[slot.id] = await listPlanSlotItems(slot.id);
  }

  const overrides = await listChildItemOverridesForPlan(plan.id);
  const overrideByKey = new Map(overrides.map(o => [`${o.childId}:${o.itemId}`, o]));

  const { year, month } = parsePeriod(plan.period);
  const weeks = buildMonthlyCalendar(year + 1911, month);

  return { children, slots, itemsBySlotId, overrideByKey, weeks };
}

function findSlot(slots, tier, weekIndex, weekday) {
  return slots.find(s => s.tier === tier && s.weekIndex === weekIndex && s.weekday === weekday);
}

function itemHtml(item, override) {
  const classes = ['monthly-calendar__item'];
  if (override?.notAchieved) classes.push('monthly-calendar__item--not-achieved');
  if (override?.replaced) classes.push('monthly-calendar__item--replaced');

  const label = item.indicatorCode
    ? item.activityName
      ? `${escapeHtml(item.indicatorCode)}【${escapeHtml(item.activityName)}】${escapeHtml(item.indicatorText || '')}`
      : `${escapeHtml(item.indicatorCode)}${escapeHtml(item.indicatorText || '')}`
    : escapeHtml(item.activityName);

  const replacementHtml =
    override?.replaced && override.replacementText
      ? `<span class="monthly-calendar__replacement">${escapeHtml(override.replacementText)}</span>`
      : '';

  return `<div class="${classes.join(' ')}" data-item-id="${escapeHtml(item.id)}">${label}${replacementHtml}</div>`;
}

function dayCellHtml(child, tier, week, day, data) {
  const slot = findSlot(data.slots, tier, week.weekIndex, day.weekday);
  const items = slot ? data.itemsBySlotId[slot.id] || [] : [];
  const itemsHtml = items
    .map(item => itemHtml(item, data.overrideByKey.get(`${child.id}:${item.id}`)))
    .join('');

  return `
    <button
      type="button"
      class="monthly-calendar__day"
      data-child-id="${escapeHtml(child.id)}"
      data-tier="${escapeHtml(tier)}"
      data-week-index="${week.weekIndex}"
      data-weekday="${day.weekday}"
    >
      <span class="monthly-calendar__date">${escapeHtml(day.dateLabel)}</span>
      ${itemsHtml}
    </button>
  `;
}

function childCalendarHtml(child, tier, data) {
  const ageMonths = calculateAgeInMonths(child.birthDate, `${data.weeks[0].days[0].isoDate}`);
  return `
    <section class="monthly-calendar" data-child-id="${escapeHtml(child.id)}">
      <h3 class="monthly-calendar__title">${escapeHtml(child.name)}　${ageMonths}M　${escapeHtml(tierFormLabel(tier))}</h3>
      <div class="monthly-calendar__weeks">
        ${data.weeks
          .map(
            week => `
              <div class="monthly-calendar__week">
                <div class="monthly-calendar__week-range">第${weekIndexLabel(week.weekIndex)}週　${escapeHtml(week.dateRange)}</div>
                <div class="monthly-calendar__days">
                  ${week.days.map(day => dayCellHtml(child, tier, week, day, data)).join('')}
                </div>
              </div>
            `
          )
          .join('')}
      </div>
    </section>
  `;
}

export async function renderMonthlyPlanEditorView(container, { plan, onBack }) {
  // See formEditorView.js's identical guard: opening the plan clears the 新 badge shown on
  // monthlyPlanListView.js's row, and mutating `plan` (not just the DB) prevents repeating this
  // write on every re-render this view does internally (same `plan` reference each time).
  if (plan.isNew) {
    await updateMonthlyCoursePlan(plan.id, { isNew: false });
    plan.isNew = false;
  }

  const data = await loadEditorData(plan);
  let selected = null; // { child, tier, week, day }

  container.innerHTML = `
    <div class="page-header page-header--editor">
      <button type="button" class="btn btn--ghost" data-action="back">${headerButtonLabel('← 返回課程月計畫列表', '← 返回')}</button>
      <h2 class="page-header__title">${escapeHtml(plan.period)} 課程月計畫</h2>
      <div class="page-header__actions">
        <button type="button" class="btn btn--purple" data-action="manage-children">${headerButtonLabel('管理幼兒', '管理')}</button>
        <button type="button" class="btn btn--purple" data-action="export-docx">${headerButtonLabel('匯出 Word', '匯出')}</button>
      </div>
    </div>
    <p class="field-error field-error--center" data-error="export"></p>
    <div class="tab-layout">
      <div class="monthly-calendar-list">
        ${data.children.map(child => childCalendarHtml(child, plan.childTiers[child.id], data)).join('')}
      </div>
      <div class="monthly-plan-side">
        ${nestedEntryFormDialog(`
        <form class="panel-form" data-manage-children-form>
          <h3 class="panel-form__title">選擇本月計畫涵蓋的幼兒</h3>
          <fieldset class="panel-form__field">
            <legend>幼兒</legend>
            <div class="panel-form__checkbox-list">
              ${(await listChildren())
                .map(
                  c =>
                    `<label class="panel-form__checkbox">
                      <input type="checkbox" data-manage-child-checkbox="${escapeHtml(c.id)}" ${plan.childIds.includes(c.id) ? 'checked' : ''}> ${escapeHtml(c.name)}
                    </label>`
                )
                .join('')}
            </div>
          </fieldset>
          <div class="entry-form__actions">
            <button type="button" class="btn btn--primary btn--small" data-action="save-children">儲存</button>
            <button type="button" class="btn btn--outline btn--small" data-action="cancel-manage-children">取消</button>
          </div>
          <p class="field-error" data-error="manage-children"></p>
        </form>
        `)}
        ${nestedEntryFormDialog(`
        <div class="panel-form" data-panel>
          <h3 class="panel-form__title" data-panel-header>點選左側的日期格子開始規劃</h3>
          <div data-panel-items></div>
        </div>
        `)}
      </div>
    </div>
    ${isMobile() ? `<button type="button" class="fab" data-action="open-panel-popup" hidden aria-label="編輯這天的計畫">${fabIconHtml()}</button>` : ''}
  `;

  container.querySelector('[data-action="back"]').addEventListener('click', onBack);

  const manageChildrenForm = container.querySelector('[data-manage-children-form]');

  wireNestedEntryForm(container.querySelector('[data-action="manage-children"]'), manageChildrenForm);

  container.querySelector('[data-action="cancel-manage-children"]').addEventListener('click', () => {
    const dialog = manageChildrenForm.closest('dialog.form-popup');
    if (dialog) dialog.close();
    else manageChildrenForm.hidden = true;
  });

  // The always-visible desktop panel must never be hidden by default (unlike a nested add-form),
  // so this is wired by hand instead of via wireNestedEntryForm — its desktop fallback assumes
  // hide-until-clicked, which is wrong here.
  const panelDialog = container.querySelector('[data-panel]').closest('dialog.form-popup');
  if (panelDialog) {
    unlockBodyScroll(); // see formPopup.js's wireFormPopup — a fresh render's dialog starts closed
    panelDialog.querySelector('[data-action="close-form-popup"]').addEventListener('click', () => panelDialog.close());
    panelDialog.addEventListener('click', event => {
      if (event.target === panelDialog) panelDialog.close();
    });
    panelDialog.addEventListener('close', unlockBodyScroll);
  }

  function openPanelPopup() {
    panelDialog?.showModal();
    if (panelDialog) lockBodyScroll();
  }

  function updateFabVisibility() {
    const fab = container.querySelector('[data-action="open-panel-popup"]');
    if (fab) fab.hidden = !selected;
  }

  container.querySelector('[data-action="open-panel-popup"]')?.addEventListener('click', () => openPanelPopup());

  // Native `dblclick` is unreliable for a double-tap gesture on real mobile browsers (its timing
  // window is tighter and less consistent than what a finger tap actually produces), so double-tap
  // is detected by hand here: two clicks on the same cell within DOUBLE_TAP_WINDOW_MS count as one.
  const DOUBLE_TAP_WINDOW_MS = 500;
  let lastTapKey = null;
  let lastTapTime = 0;

  function handleCellTap(child, tier, week, day) {
    const key = `${child.id}:${week.weekIndex}:${day.weekday}`;
    const now = Date.now();
    const isDoubleTap = key === lastTapKey && now - lastTapTime < DOUBLE_TAP_WINDOW_MS;
    lastTapKey = isDoubleTap ? null : key;
    lastTapTime = now;
    selectCell(child, tier, week, day).then(() => {
      if (isDoubleTap) openPanelPopup();
    });
  }

  container.querySelector('[data-action="export-docx"]').addEventListener('click', async () => {
    const errorEl = container.querySelector('[data-error="export"]');
    try {
      const blob = await generateMonthlyPlanDocxBlob({
        plan, children: data.children, slots: data.slots, itemsBySlotId: data.itemsBySlotId,
        overrides: [...data.overrideByKey.values()],
      });
      downloadBlob(blob, `${plan.period}課程月計畫.docx`);
      if (errorEl) errorEl.textContent = '';
    } catch (err) {
      if (errorEl) errorEl.textContent = `匯出失敗，請再試一次（${err?.message || err}）`;
    }
  });

  container.querySelector('[data-action="save-children"]').addEventListener('click', async () => {
    try {
      const allChildren = await listChildren();
      const newChildIds = allChildren.filter(c => container.querySelector(`[data-manage-child-checkbox="${c.id}"]`).checked).map(c => c.id);
      const removedChildIds = plan.childIds.filter(id => !newChildIds.includes(id));

      const { year, month } = parsePeriod(plan.period);
      const asOfDate = `${year + 1911}-${String(month).padStart(2, '0')}-01`;
      const newChildTiers = { ...plan.childTiers };
      for (const childId of newChildIds) {
        if (newChildTiers[childId]) continue;
        const child = allChildren.find(c => c.id === childId);
        newChildTiers[childId] = suggestTier(child.birthDate, asOfDate);
      }
      for (const childId of removedChildIds) {
        delete newChildTiers[childId];
      }

      const updatedPlan = await updateMonthlyCoursePlan(plan.id, { childIds: newChildIds, childTiers: newChildTiers });

      const weeks = buildMonthlyCalendar(year + 1911, month);
      const tiers = [...new Set(Object.values(newChildTiers))];
      await seedDefaultPlanSlots({ planId: plan.id, tiers, weeks });

      for (const childId of removedChildIds) {
        await deleteChildItemOverridesForChild(plan.id, childId);
      }

      await renderMonthlyPlanEditorView(container, { plan: updatedPlan, onBack });
    } catch (err) {
      container.querySelector('[data-error="manage-children"]').textContent = '更新失敗，請再試一次';
    }
  });

  // Reselecting the cell already open (via the FAB reopening it, or a repeated double-tap) skips
  // the panel re-render, so any unsaved typed input in the add-item form survives — only a genuine
  // change of cell should wipe it.
  async function selectCell(child, tier, week, day) {
    const sameAsSelected =
      selected && selected.child.id === child.id && selected.tier === tier &&
      selected.week.weekIndex === week.weekIndex && selected.day.weekday === day.weekday;
    selected = { child, tier, week, day };
    container.querySelectorAll('.monthly-calendar__day--selected').forEach(el => el.classList.remove('monthly-calendar__day--selected'));
    container.querySelector(
      `.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="${week.weekIndex}"][data-weekday="${day.weekday}"]`
    ).classList.add('monthly-calendar__day--selected');
    container.querySelector('[data-panel-header]').textContent = `${child.name}　第${weekIndexLabel(week.weekIndex)}週　${day.dateLabel}`;
    if (!sameAsSelected) await renderPanelItems();
    updateFabVisibility();
  }

  function indicatorOptionsHtml(tier) {
    const indicators = getIndicatorsForTier(tier);
    const byDomain = new Map();
    for (const indicator of indicators) {
      if (!byDomain.has(indicator.domainName)) byDomain.set(indicator.domainName, []);
      byDomain.get(indicator.domainName).push(indicator);
    }
    return (
      '<option value="">（不選指標，純活動）</option>' +
      [...byDomain.entries()]
        .map(
          ([domainName, group]) =>
            `<optgroup label="${escapeHtml(domainName)}">
              ${group.map(i => `<option value="${escapeHtml(i.code)}">${escapeHtml(i.code)} ${escapeHtml(i.description)}</option>`).join('')}
            </optgroup>`
        )
        .join('')
    );
  }

  // Read-only summary by default (code badge + activity + description, corner 編輯/× actions —
  // same card pattern as courseplanTabView.js's entryCard) with the actual editable fields tucked
  // into a hidden form revealed by 編輯, rather than always-open inputs: keeps the panel from
  // reading as a wall of unlabeled boxes when nothing is being edited, and gives the delete button
  // a fixed, low-key spot instead of wrapping onto its own line.
  function panelItemRowHtml(item, override) {
    const summaryText = item.indicatorCode
      ? item.activityName
        ? `【${escapeHtml(item.activityName)}】${escapeHtml(item.indicatorText || '')}`
        : escapeHtml(item.indicatorText || '')
      : escapeHtml(item.activityName);

    return `
      <div class="indicator-block" data-panel-item="${item.id}">
        <h4 class="indicator-block__title">
          ${item.indicatorCode ? `<span class="indicator-block__code">${escapeHtml(item.indicatorCode)}</span>` : ''}
          ${summaryText}
          <span class="indicator-block__actions">
            <button type="button" class="btn btn--edit btn--small" data-edit-item="${item.id}" aria-label="編輯${escapeHtml(item.activityName)}">編輯</button>
            <button type="button" class="btn--delete-circle" data-delete-item="${item.id}" aria-label="刪除${escapeHtml(item.activityName)}">×</button>
          </span>
        </h4>
        <div class="entry-form" data-item-edit-form-for="${item.id}" hidden>
          <label class="panel-form__field">
            活動名稱
            <input data-item-edit-field="activityName" data-item-id="${item.id}" value="${escapeHtml(item.activityName)}">
          </label>
          <label class="panel-form__field">
            指標內容／說明
            <textarea data-item-edit-field="indicatorText" data-item-id="${item.id}" rows="2">${escapeHtml(item.indicatorText || '')}</textarea>
          </label>
          <div class="entry-form__actions">
            <button type="button" class="btn btn--primary btn--small" data-item-edit-save-for="${item.id}">儲存</button>
            <button type="button" class="btn btn--outline btn--small" data-item-edit-cancel-for="${item.id}">取消</button>
          </div>
        </div>
        <div class="entry-form__checkbox-row">
          <label class="entry-form__checkbox">
            <input type="checkbox" data-override-field="notAchieved" data-item-id="${item.id}" ${override?.notAchieved ? 'checked' : ''}> 未達成
          </label>
          <label class="entry-form__checkbox">
            <input type="checkbox" data-override-field="replaced" data-item-id="${item.id}" ${override?.replaced ? 'checked' : ''}> 請假／其他活動代替
          </label>
          <input
            type="text"
            data-override-field="replacementText"
            data-item-id="${item.id}"
            placeholder="替代活動內容"
            value="${escapeHtml(override?.replacementText || '')}"
            ${override?.replaced ? '' : 'disabled'}
          >
        </div>
      </div>
    `;
  }

  async function renderPanelItems() {
    const panelItems = container.querySelector('[data-panel-items]');
    if (!selected) {
      panelItems.innerHTML = '';
      return;
    }
    const { child, tier, week, day } = selected;
    const slot = await getOrCreatePlanSlot({ planId: plan.id, tier, weekIndex: week.weekIndex, weekday: day.weekday });
    const items = await listPlanSlotItems(slot.id);
    const allOverrides = await listChildItemOverridesForPlan(plan.id);
    const overrideByItemId = new Map(allOverrides.filter(o => o.childId === child.id).map(o => [o.itemId, o]));

    // Lets staff pick an indicator from a tier other than this cell's own tier — a child may not
    // have caught up to their assigned tier yet, so the teacher plans with an earlier tier's
    // indicator instead. Starts on the cell's own tier and only affects which options the 指標
    // select shows; the item is still saved into this cell's own slot regardless of which tier
    // its indicator came from.
    let indicatorTier = tier;

    panelItems.innerHTML = `
      ${items.map(item => panelItemRowHtml(item, overrideByItemId.get(item.id))).join('')}
      <form class="entry-form" data-action="add-item">
        <div class="panel-form__field">
          指標所屬年齡層
          <div class="tier-switch">
            ${TIERS.map(
              t =>
                `<button type="button" class="tier-switch__btn${t.code === tier ? ' tier-switch__btn--active' : ''}" data-indicator-tier="${escapeHtml(t.code)}">${escapeHtml(t.label)}</button>`
            ).join('')}
          </div>
        </div>
        <label class="panel-form__field">
          指標
          <select data-field="new-item-indicator">${indicatorOptionsHtml(tier)}</select>
        </label>
        <label class="panel-form__field">活動名稱 <input data-field="new-item-activity-name"></label>
        <label class="panel-form__field">指標內容 <textarea data-field="new-item-indicator-text" rows="2"></textarea></label>
        <button type="submit" class="btn btn--primary btn--small">新增項目</button>
        <p class="field-error" data-error></p>
      </form>
    `;

    panelItems.querySelectorAll('[data-indicator-tier]').forEach(btn => {
      btn.addEventListener('click', () => {
        indicatorTier = btn.dataset.indicatorTier;
        panelItems.querySelectorAll('[data-indicator-tier]').forEach(b => b.classList.toggle('tier-switch__btn--active', b === btn));
        panelItems.querySelector('[data-field="new-item-indicator"]').innerHTML = indicatorOptionsHtml(indicatorTier);
      });
    });

    panelItems.querySelector('[data-field="new-item-indicator"]').addEventListener('change', event => {
      const indicator = getIndicator(event.target.value);
      if (!indicator) return;
      // activityName is the indicator's own official 【活動名稱】 label (not a copy of the
      // description) — 25個月以上's indicators have none in their source document, so this is ''
      // for those and the field is left blank rather than duplicating the description into it.
      panelItems.querySelector('[data-field="new-item-activity-name"]').value = indicator.activityName;
      panelItems.querySelector('[data-field="new-item-indicator-text"]').value = indicator.description;
    });

    panelItems.querySelector('[data-action="add-item"]').addEventListener('submit', async event => {
      event.preventDefault();
      const indicatorCode = panelItems.querySelector('[data-field="new-item-indicator"]').value || null;
      const activityName = panelItems.querySelector('[data-field="new-item-activity-name"]').value;
      const indicatorText = panelItems.querySelector('[data-field="new-item-indicator-text"]').value;
      // Activity name is only mandatory when no indicator is picked (it's then the item's only
      // label) — an indicator-backed item can rely on the indicator's own description instead
      // (25個月以上's indicators have no activity name to fill in at all).
      if (!indicatorCode && !activityName) {
        panelItems.querySelector('[data-action="add-item"] [data-error]').textContent = '請輸入活動名稱或選擇指標';
        return;
      }
      try {
        await addPlanSlotItem({ slotId: slot.id, indicatorCode, activityName, indicatorText });
        await refreshCellAndPanel();
      } catch (err) {
        panelItems.querySelector('[data-action="add-item"] [data-error]').textContent = '新增失敗，請再試一次';
      }
    });

    for (const item of items) {
      panelItems.querySelector(`[data-edit-item="${item.id}"]`).addEventListener('click', () => {
        const form = panelItems.querySelector(`[data-item-edit-form-for="${item.id}"]`);
        form.hidden = !form.hidden;
      });
      panelItems.querySelector(`[data-item-edit-cancel-for="${item.id}"]`).addEventListener('click', () => {
        panelItems.querySelector(`[data-item-edit-form-for="${item.id}"]`).hidden = true;
      });
      panelItems.querySelector(`[data-item-edit-save-for="${item.id}"]`).addEventListener('click', async () => {
        const activityName = panelItems.querySelector(`[data-item-edit-field="activityName"][data-item-id="${item.id}"]`).value;
        const indicatorText = panelItems.querySelector(`[data-item-edit-field="indicatorText"][data-item-id="${item.id}"]`).value;
        await updatePlanSlotItem(item.id, { activityName, indicatorText });
        await refreshCellAndPanel();
      });
      panelItems.querySelector(`[data-delete-item="${item.id}"]`).addEventListener('click', async () => {
        await deletePlanSlotItem(item.id);
        await refreshCellAndPanel();
      });

      const notAchievedBox = panelItems.querySelector(`[data-override-field="notAchieved"][data-item-id="${item.id}"]`);
      const replacedBox = panelItems.querySelector(`[data-override-field="replaced"][data-item-id="${item.id}"]`);
      const replacementInput = panelItems.querySelector(`[data-override-field="replacementText"][data-item-id="${item.id}"]`);

      async function saveOverride() {
        await setChildItemOverride({
          planId: plan.id,
          childId: child.id,
          itemId: item.id,
          notAchieved: notAchievedBox.checked,
          replaced: replacedBox.checked,
          replacementText: replacementInput.value,
        });
        await refreshCellAndPanel();
      }

      notAchievedBox.addEventListener('change', saveOverride);
      replacedBox.addEventListener('change', () => {
        replacementInput.disabled = !replacedBox.checked;
        saveOverride();
      });
      replacementInput.addEventListener('change', saveOverride);
    }
  }

  // Re-reads this one (tier, week, weekday) slot and rewrites every child's cell that shares it
  // (same tier → same slot, per the shared-per-tier design), then redraws the panel.
  async function refreshCellAndPanel() {
    const { tier, week, day } = selected;
    const freshSlots = await listPlanSlotsForPlan(plan.id);
    const freshItemsBySlotId = {};
    for (const slot of freshSlots) {
      freshItemsBySlotId[slot.id] = await listPlanSlotItems(slot.id);
    }
    const freshOverrides = await listChildItemOverridesForPlan(plan.id);
    const freshOverrideByKey = new Map(freshOverrides.map(o => [`${o.childId}:${o.itemId}`, o]));
    // Write back onto the shared `data` object itself (not just a local copy) so every consumer
    // of `data` — the export button included — sees post-edit state without needing a full
    // renderMonthlyPlanEditorView re-render.
    data.slots = freshSlots;
    data.itemsBySlotId = freshItemsBySlotId;
    data.overrideByKey = freshOverrideByKey;

    for (const child of data.children) {
      if (plan.childTiers[child.id] !== tier) continue;
      const cell = container.querySelector(
        `.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="${week.weekIndex}"][data-weekday="${day.weekday}"]`
      );
      cell.outerHTML = dayCellHtml(child, tier, week, day, data);
      const freshCell = container.querySelector(
        `.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="${week.weekIndex}"][data-weekday="${day.weekday}"]`
      );
      freshCell.addEventListener('click', () => handleCellTap(child, tier, week, day));
    }
    await renderPanelItems();
  }

  for (const child of data.children) {
    for (const week of data.weeks) {
      for (const day of week.days) {
        const cell = container.querySelector(
          `.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="${week.weekIndex}"][data-weekday="${day.weekday}"]`
        );
        cell.addEventListener('click', () => handleCellTap(child, plan.childTiers[child.id], week, day));
      }
    }
  }
}
