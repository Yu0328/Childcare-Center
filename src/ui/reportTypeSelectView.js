import { processImportQueue } from './importQueue.js';
import { parseUnifiedDocxImport } from '../import/unifiedDocxImport.js';
import { renderImportPreviewView } from './importPreviewView.js';
import { renderParentReportImportPreviewView } from './parentReportImportPreviewView.js';
import { renderMonthlyPlanImportPreviewView } from './monthlyPlanImportPreviewView.js';

const IMPORT_PREVIEW_BY_TYPE = {
  assessment: renderImportPreviewView,
  'parent-report': renderParentReportImportPreviewView,
  'monthly-plan': renderMonthlyPlanImportPreviewView,
};

const TYPE_SELECT_ICONS = {
  assessment:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1Z"/><path d="M6 5h12a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/><path d="M9 11h6M9 15h6"/></svg>',
  'parent-report':
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20v-1a5 5 0 0 1 5-5h1a5 5 0 0 1 5 5v1"/><circle cx="9" cy="8" r="3.5"/><path d="M16 4.5c1.9.4 3.3 2.1 3.3 4.1 0 1.7-1 3.2-2.5 3.9"/><path d="M20 20v-.6c0-1.9-1.1-3.6-2.8-4.4"/></svg>',
  'monthly-plan':
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/><path d="M8 14h2M11 14h2M14 14h2M8 17h2"/></svg>',
};

const TYPE_SELECT_OPTIONS = [
  { type: 'assessment', title: '適性總表', desc: '幼兒發展觀察紀錄總表', variant: 'brand' },
  { type: 'parent-report', title: '適性紀錄(家長版)', desc: '每月課程計畫與發展紀錄', variant: 'edit' },
  { type: 'monthly-plan', title: '課程月計畫', desc: '班級每月活動安排', variant: 'filled' },
];

const UTIL_ICONS = {
  // baby / infant — deliberately different from parent-report's two-person icon
  'manage-children':
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h.01"/><path d="M15 12h.01"/><path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1"/></svg>',
  'import-any-docx':
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>',
};

export async function renderReportTypeSelectView(container, { onSelectType, onManageChildren }) {
  const CHEVRON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';

  container.innerHTML = `
    <div class="type-select-home">
      <h2 class="type-select-home__title">請選擇要填寫的表單</h2>
      <hr class="type-select-home__divider">
      <div class="type-select-home__utils">
        <button type="button" class="type-select__option type-select__option--rose type-select__option--compact" data-action="manage-children">
          <span class="type-select__icon">${UTIL_ICONS['manage-children']}</span>
          <span class="type-select__title">管理幼兒</span>
        </button>
        <button type="button" class="type-select__option type-select__option--rose type-select__option--compact" data-action="import-any-docx">
          <span class="type-select__icon">${UTIL_ICONS['import-any-docx']}</span>
          <span class="type-select__title">匯入檔案</span>
        </button>
        <input type="file" accept=".docx" data-field="import-any-file" multiple hidden>
      </div>
      <p class="field-error field-error--center" data-error="import"></p>
      <div class="type-select">
        ${TYPE_SELECT_OPTIONS.map(
          ({ type, title, desc, variant }) => `
            <button type="button" class="type-select__option type-select__option--${variant}" data-type="${type}">
              <span class="type-select__icon">${TYPE_SELECT_ICONS[type]}</span>
              <span class="type-select__text">
                <span class="type-select__title">${title}</span>
                <span class="type-select__desc">${desc}</span>
              </span>
              <span class="type-select__go" aria-hidden="true">${CHEVRON}</span>
            </button>
          `
        ).join('')}
      </div>
    </div>
  `;

  container.querySelector('[data-action="manage-children"]').addEventListener('click', onManageChildren);

  container.querySelector('[data-type="assessment"]').addEventListener('click', () => onSelectType('assessment'));
  container.querySelector('[data-type="parent-report"]').addEventListener('click', () => onSelectType('parent-report'));
  container.querySelector('[data-type="monthly-plan"]').addEventListener('click', () => onSelectType('monthly-plan'));

  const importFileInput = container.querySelector('[data-field="import-any-file"]');
  container.querySelector('[data-action="import-any-docx"]').addEventListener('click', () => importFileInput.click());

  importFileInput.addEventListener('change', async () => {
    if (importFileInput.files.length === 0) return;
    await processImportQueue(importFileInput.files, {
      parseFn: parseUnifiedDocxImport,
      renderPreview: (container, { parsed: { type, parsed }, onCancel, onImported }) =>
        IMPORT_PREVIEW_BY_TYPE[type](container, { parsed, onCancel, onImported }),
      container,
      backToList: () => renderReportTypeSelectView(container, { onSelectType }),
    });
  });
}
