import { escapeHtml } from './escapeHtml.js';
import { generateParentReportDocxBlob, downloadParentReportDocx } from '../export/parentReportDocxExport.js';
import { listCoursePlanEntriesForReport, listCourseOccurrencesForEntry, listDevelopmentRecordEntriesForReport, listBehaviorObservationsForReport, listHighlightEntriesForReport } from '../storage/parentReportDb.js';
import { renderCoursePlanTab } from './courseplanTabView.js';
import { renderDevelopmentRecordTab } from './developmentRecordTabView.js';
import { renderBehaviorObservationTab } from './behaviorObservationTabView.js';
import { renderHighlightsTab } from './highlightsTabView.js';

const TABS = [
  { key: 'coursePlan', label: '課程計畫表', render: renderCoursePlanTab },
  { key: 'developmentRecord', label: '適性發展紀錄表', render: renderDevelopmentRecordTab },
  { key: 'behaviorObservation', label: '行為觀察', render: renderBehaviorObservationTab },
  { key: 'highlights', label: '點滴分享', render: renderHighlightsTab },
];

async function exportReport(child, report) {
  const coursePlanEntries = await listCoursePlanEntriesForReport(report.id);
  const courseOccurrencesByEntryId = {};
  for (const entry of coursePlanEntries) {
    courseOccurrencesByEntryId[entry.id] = await listCourseOccurrencesForEntry(entry.id);
  }
  const developmentRecordEntries = await listDevelopmentRecordEntriesForReport(report.id);
  const behaviorObservations = await listBehaviorObservationsForReport(report.id);
  const highlightEntries = await listHighlightEntriesForReport(report.id);

  return generateParentReportDocxBlob({
    child, report, coursePlanEntries, courseOccurrencesByEntryId,
    developmentRecordEntries, behaviorObservations, highlightEntries,
  });
}

export async function renderParentReportEditorView(container, { child, report, onBack, activeTab = 'coursePlan' }) {
  container.innerHTML = `
    <div class="page-header page-header--editor">
      <button type="button" class="btn btn--ghost" data-action="back">← 返回適性紀錄列表</button>
      <h2 class="page-header__title">${escapeHtml(child.name)}　${escapeHtml(report.tier)} 階段　${escapeHtml(report.period)}</h2>
      <button type="button" class="btn btn--primary" data-action="export">匯出 Word</button>
    </div>
    <p class="field-error field-error--center" data-error="export"></p>
    <div class="tabs" role="tablist">
      ${TABS.map(
        tab =>
          `<button type="button" class="tabs__button${tab.key === activeTab ? ' tabs__button--active' : ''}" data-tab="${tab.key}" role="tab">${tab.label}</button>`
      ).join('')}
    </div>
    <div class="tabs__panel" data-tab-panel></div>
  `;

  container.querySelector('[data-action="back"]').addEventListener('click', onBack);

  container.querySelector('[data-action="export"]').addEventListener('click', async () => {
    const errorEl = container.querySelector('[data-error="export"]');
    try {
      const blob = await exportReport(child, report);
      downloadParentReportDocx(blob, `${child.name}-適性紀錄-${report.period}.docx`);
      if (errorEl) errorEl.textContent = '';
    } catch (err) {
      if (errorEl) errorEl.textContent = '匯出失敗，請再試一次';
    }
  });

  for (const tab of TABS) {
    container.querySelector(`[data-tab="${tab.key}"]`).addEventListener('click', () => {
      renderParentReportEditorView(container, { child, report, onBack, activeTab: tab.key });
    });
  }

  const activeTabConfig = TABS.find(tab => tab.key === activeTab);
  const panel = container.querySelector('[data-tab-panel]');
  const onChange = () => renderParentReportEditorView(container, { child, report, onBack, activeTab });
  await activeTabConfig.render(panel, { report, onChange });
}
