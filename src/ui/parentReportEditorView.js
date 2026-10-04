import { escapeHtml } from './escapeHtml.js';
import { headerButtonLabel } from './headerButtonLabel.js';
import { generateParentReportDocxBlob, downloadParentReportDocx } from '../export/parentReportDocxExport.js';
import { listCoursePlanEntriesForReport, listCourseOccurrencesForEntry, listDevelopmentRecordEntriesForReport, listBehaviorObservationsForReport, listHighlightEntriesForReport, updateParentReport } from '../storage/parentReportDb.js';
import { renderCoursePlanTab } from './courseplanTabView.js';
import { renderDevelopmentRecordTab } from './developmentRecordTabView.js';
import { renderBehaviorObservationTab } from './behaviorObservationTabView.js';
import { renderHighlightsTab } from './highlightsTabView.js';
import { keepScroll } from './keepScroll.js';
import { oneAtATime } from './oneAtATime.js';
import { openTodayWordCheck } from './todayWordCheckPopup.js';
import { findTodayWords } from '../domain/findTodayWords.js';
import { renderCopyCoursePlanPanel } from './copyCoursePlanPanel.js';

const TABS = [
  { key: 'coursePlan', label: '課程計畫表', render: renderCoursePlanTab },
  { key: 'developmentRecord', label: '適性發展紀錄表', render: renderDevelopmentRecordTab },
  { key: 'behaviorObservation', label: '行為觀察', render: renderBehaviorObservationTab },
  { key: 'highlights', label: '點滴分享', render: renderHighlightsTab },
];

async function loadReportData(report) {
  const coursePlanEntries = await listCoursePlanEntriesForReport(report.id);
  const courseOccurrencesByEntryId = {};
  for (const entry of coursePlanEntries) {
    courseOccurrencesByEntryId[entry.id] = await listCourseOccurrencesForEntry(entry.id);
  }
  return {
    coursePlanEntries, courseOccurrencesByEntryId,
    developmentRecordEntries: await listDevelopmentRecordEntriesForReport(report.id),
    behaviorObservations: await listBehaviorObservationsForReport(report.id),
    highlightEntries: await listHighlightEntriesForReport(report.id),
  };
}

export async function renderParentReportEditorView(container, { child, report, onBack, activeTab = 'coursePlan' }) {
  // See formEditorView.js's identical guard: opening the report clears the 新 badge shown on
  // parentReportListView.js's row, and mutating `report` (not just the DB) prevents repeating
  // this write on every tab switch, which re-invokes this function with the same `report`.
  if (report.isNew) {
    await updateParentReport(report.id, { isNew: false });
    report.isNew = false;
  }

  const isCoursePlan = activeTab === 'coursePlan';
  const exportButton = `<button type="button" class="btn btn--purple" data-action="export">${headerButtonLabel('匯出 Word', '匯出')}</button>`;

  container.innerHTML = `
    <div class="page-header page-header--editor">
      <button type="button" class="btn btn--ghost" data-action="back">${headerButtonLabel('← 返回適性紀錄列表', '← 返回')}</button>
      <h2 class="page-header__title">${escapeHtml(child.name)}　${escapeHtml(report.tier)} 階段<span class="page-header__period">${escapeHtml(report.period)}</span></h2>
      ${isCoursePlan
        ? `<div class="page-header__actions">
            <button type="button" class="btn btn--purple" data-action="copy-course-plan">${headerButtonLabel('套用其他幼兒課程計畫', '套用')}</button>
            ${exportButton}
          </div>`
        : exportButton}
    </div>
    ${isCoursePlan ? '<div data-copy-plan-host></div>' : ''}
    <p class="field-error field-error--center" data-error="export"></p>
    <div class="tabs" role="tablist">
      ${TABS.map(
        tab =>
          `<button type="button" class="tabs__button${tab.key === activeTab ? ' tabs__button--active' : ''}" data-tab="${tab.key}" role="tab">${tab.label}</button>`
      ).join('')}
    </div>
    <div class="tabs__panel" data-tab-panel><p class="view-loading" role="status">載入中…</p></div>
  `;

  container.querySelector('[data-action="back"]').addEventListener('click', onBack);

  container.querySelector('[data-action="export"]').addEventListener('click', oneAtATime(async () => {
    const errorEl = container.querySelector('[data-error="export"]');
    try {
      let data = await loadReportData(report);
      const hits = findTodayWords(data);
      if (hits.length) {
        const outcome = await openTodayWordCheck(hits);
        if (outcome === 'cancel') return;
        // Re-render so the open tab shows the saved wording.
        keepScroll(() => renderParentReportEditorView(container, { child, report, onBack, activeTab }));
        if (outcome === 'saved') return;
        data = await loadReportData(report);
      }
      const blob = await generateParentReportDocxBlob({ child, report, ...data });
      downloadParentReportDocx(blob, `${child.name}-適性紀錄-${report.period}.docx`);
      if (errorEl) errorEl.textContent = '';
    } catch (err) {
      if (errorEl) errorEl.textContent = `匯出失敗，請再試一次（${err?.message || err}）`;
    }
  }));

  for (const tab of TABS) {
    container.querySelector(`[data-tab="${tab.key}"]`).addEventListener('click', () => {
      renderParentReportEditorView(container, { child, report, onBack, activeTab: tab.key });
    });
  }

  const activeTabConfig = TABS.find(tab => tab.key === activeTab);
  const panel = container.querySelector('[data-tab-panel]');
  // Wrapped so an add/edit/delete inside a tab (which rebuilds this whole view) doesn't scroll
  // the teacher back to the top of a long tab.
  const onChange = () => keepScroll(() => renderParentReportEditorView(container, { child, report, onBack, activeTab }));
  if (isCoursePlan) {
    // Only 課程計畫表 is replaced by 套用, so the button and its panel live on that tab only.
    await renderCopyCoursePlanPanel(container.querySelector('[data-copy-plan-host]'), {
      trigger: container.querySelector('[data-action="copy-course-plan"]'), report, onChange,
    });
  }
  await activeTabConfig.render(panel, { report, onChange });
}
