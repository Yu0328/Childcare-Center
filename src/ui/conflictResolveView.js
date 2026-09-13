import { escapeHtml } from './escapeHtml.js';

const STORE_LABELS = {
  children: '幼兒基本資料',
  forms: '適性總表',
  entries: '觀察紀錄',
  parentReports: '適性紀錄（家長版）',
  coursePlanEntries: '課程計畫',
  courseOccurrences: '課程出席紀錄',
  developmentRecordEntries: '適性發展紀錄',
  behaviorObservations: '行為觀察',
  highlightEntries: '點滴分享',
  monthlyCoursePlans: '月計畫',
  planSlots: '月計畫時段',
  planSlotItems: '月計畫活動',
  childItemOverrides: '月計畫個別調整',
};

const FIELD_LABELS = {
  name: '姓名', birthDate: '出生日期', tier: '月齡階段', period: '紀錄年月',
  indicatorCode: '指標代碼', activityName: '活動名稱', indicatorText: '指標內容',
  date: '日期', status: '狀態', note: '備註', narrative: '文字紀錄', domain: '領域',
  title: '標題', caption: '描述', photos: '照片', replacementText: '替代活動',
};

function valueText(value) {
  if (value === undefined || value === null || value === '') return '（空白）';
  if (Array.isArray(value)) return `${value.length} 項`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function conflictCard(conflict) {
  const rows = conflict.fields
    .map(
      field => `
        <div class="conflict-card__field">
          <span class="conflict-card__field-name">${escapeHtml(FIELD_LABELS[field.field] || field.field)}</span>
          <div class="conflict-card__side"><strong>這台裝置</strong><span>${escapeHtml(valueText(field.local))}</span></div>
          <div class="conflict-card__side"><strong>雲端</strong><span>${escapeHtml(valueText(field.cloud))}</span></div>
        </div>
      `
    )
    .join('');

  const uid = escapeHtml(conflict.uid);
  return `
    <div class="conflict-card" data-conflict="${uid}">
      <h3 class="conflict-card__title">${escapeHtml(STORE_LABELS[conflict.store] || conflict.store)}</h3>
      ${rows}
      <div class="conflict-card__actions">
        <button type="button" class="btn btn--outline btn--small" data-choice="local" data-uid="${uid}">保留這台裝置的</button>
        <button type="button" class="btn btn--outline btn--small" data-choice="cloud" data-uid="${uid}">保留雲端的</button>
        <button type="button" class="btn btn--outline btn--small" data-choice="both" data-uid="${uid}">都保留</button>
      </div>
    </div>
  `;
}

// Only reached for genuine same-field disagreements — everything else was merged without asking.
export function renderConflictResolveView(container, { conflicts }) {
  container.innerHTML = `
    <div class="conflict-view">
      <div class="page-header">
        <h2 class="page-header__title">有 ${conflicts.length} 筆資料兩邊都改過</h2>
      </div>
      <p class="conflict-view__hint">請選擇每一筆要保留哪一份。選「都保留」會變成兩筆記錄並標上「待確認」，讓你之後自己整理。</p>
      ${conflicts.map(conflictCard).join('')}
      <button type="button" class="btn btn--primary" data-action="conflicts-done" disabled>完成</button>
    </div>
  `;

  const choices = new Map();
  const doneButton = container.querySelector('[data-action="conflicts-done"]');

  for (const button of container.querySelectorAll('[data-choice]')) {
    button.addEventListener('click', () => {
      const { uid, choice } = button.dataset;
      choices.set(uid, choice);
      for (const sibling of container.querySelectorAll(`[data-uid="${uid}"]`)) {
        sibling.classList.toggle('btn--primary', sibling === button);
        sibling.classList.toggle('btn--outline', sibling !== button);
      }
      doneButton.disabled = choices.size !== conflicts.length;
    });
  }

  return new Promise(resolve => {
    doneButton.addEventListener('click', () => {
      resolve(conflicts.map(conflict => ({ uid: conflict.uid, choice: choices.get(conflict.uid) || 'local' })));
    });
  });
}
