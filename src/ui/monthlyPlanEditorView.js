import { getChild } from '../storage/db.js';
import { listPlanSlotsForPlan, listPlanSlotItems, listChildItemOverridesForPlan } from '../storage/monthlyPlanDb.js';
import { buildMonthlyCalendar } from '../domain/monthlyCalendar.js';
import { parsePeriod } from './periodFields.js';
import { TIERS } from '../data/indicators.js';
import { calculateAgeInMonths } from '../domain/ageTier.js';
import { escapeHtml } from './escapeHtml.js';

function tierFormLetter(tierCode) {
  const tier = TIERS.find(t => t.code === tierCode);
  return tier ? tier.formLetter : '';
}

// Loads everything the render pass needs in one pass: the plan's still-existing children (a
// child deleted elsewhere after being added to this plan is silently skipped rather than
// crashing the render), every slot+items for every tier in play, and every override for the
// plan (grouped by "childId:itemId" for O(1) lookup while rendering cells).
async function loadEditorData(plan) {
  const childResults = await Promise.all(plan.childIds.map(id => getChild(id)));
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
    ? `${escapeHtml(item.indicatorCode)}【${escapeHtml(item.activityName)}】${escapeHtml(item.indicatorText || '')}`
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
      <h3 class="monthly-calendar__title">${escapeHtml(child.name)}　${ageMonths}M　${escapeHtml(tierFormLetter(tier))}表</h3>
      <div class="monthly-calendar__weeks">
        ${data.weeks
          .map(
            week => `
              <div class="monthly-calendar__week">
                <div class="monthly-calendar__week-range">第${week.weekIndex}週　${escapeHtml(week.dateRange)}</div>
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
  const data = await loadEditorData(plan);

  container.innerHTML = `
    <div class="page-header page-header--editor">
      <button type="button" class="btn btn--ghost" data-action="back">← 返回課程月計畫列表</button>
      <h2 class="page-header__title">${escapeHtml(plan.period)} 課程月計畫</h2>
    </div>
    <div class="tab-layout">
      <div class="monthly-calendar-list">
        ${data.children.map(child => childCalendarHtml(child, plan.childTiers[child.id], data)).join('')}
      </div>
      <div class="panel-form" data-panel>
        <h3 class="panel-form__title" data-panel-header>點選左側的日期格子開始規劃</h3>
        <div data-panel-items></div>
      </div>
    </div>
  `;

  container.querySelector('[data-action="back"]').addEventListener('click', onBack);

  for (const child of data.children) {
    for (const week of data.weeks) {
      for (const day of week.days) {
        const cell = container.querySelector(
          `.monthly-calendar__day[data-child-id="${child.id}"][data-week-index="${week.weekIndex}"][data-weekday="${day.weekday}"]`
        );
        cell.addEventListener('click', () => {
          container.querySelectorAll('.monthly-calendar__day--selected').forEach(el => el.classList.remove('monthly-calendar__day--selected'));
          cell.classList.add('monthly-calendar__day--selected');
          container.querySelector('[data-panel-header]').textContent = `${child.name}　第${week.weekIndex}週　${day.dateLabel}`;
        });
      }
    }
  }
}
