import { findCopySources, planCoursePlanCopy, copyCoursePlan } from '../domain/copyCoursePlan.js';
import { renderCopyFromChildPanel } from './copyFromChildPanel.js';

function copyConfirmMessage({ childName, currentCount, sourceCount, unlinkedRecordCount }) {
  const lines = [
    currentCount > 0
      ? `目前這份的 ${currentCount} 筆課程計畫，會換成「${childName}」的 ${sourceCount} 筆課程計畫。`
      : `會套用「${childName}」的 ${sourceCount} 筆課程計畫。`,
    '發展狀況一律先填 ○，請假、更換課程不會套用，請再逐筆確認。',
  ];
  if (unlinkedRecordCount > 0) lines.push(`有 ${unlinkedRecordCount} 段發展紀錄的對應課程會被取消勾選。`);
  lines.push('確定要套用嗎？');
  return lines.join('\n');
}

// The 適性紀錄 header's 「套用其他幼兒課程計畫」 button opens this.
export async function renderCopyCoursePlanPanel(host, { trigger, report, onChange, confirmCopy }) {
  const sources = await findCopySources(report);
  const byId = id => sources.find(source => source.report.id === id);
  renderCopyFromChildPanel(host, {
    trigger, onChange, confirmCopy,
    title: '套用其他幼兒課程計畫',
    emptyText: '沒有同年齡層、同月份的其他幼兒課程計畫可以套用',
    sources: sources.map(source => ({ id: source.report.id, label: `${source.childName}（${source.entryCount} 筆）` })),
    confirmMessage: async id => copyConfirmMessage({
      childName: byId(id).childName,
      ...(await planCoursePlanCopy({ targetReportId: report.id, sourceReportId: id })),
    }),
    copy: id => copyCoursePlan({ targetReportId: report.id, sourceReportId: id }),
  });
}
