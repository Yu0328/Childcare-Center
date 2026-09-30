import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { generateParentReportDocxBlob } from '../src/export/parentReportDocxExport.js';
import { parseParentReportDocxImport } from '../src/import/parentReportDocxImport.js';
import { generateDocxBlob } from '../src/export/docxExport.js';
import { parseDocxImport } from '../src/import/docxImport.js';
import { getIndicatorsForTier } from '../src/data/indicators.js';

// Word shows a raw \n inside <w:t> as a space, so a typed line break must become its own
// paragraph (the real sample files' own convention) and come back as \n on re-import.

// jsdom's Blob has no arrayBuffer(); its FileReader does read it.
function bytesOf(blob) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.readAsArrayBuffer(blob);
  });
}

async function documentXmlOf(blob) {
  return (await JSZip.loadAsync(await bytesOf(blob))).file('word/document.xml').async('text');
}

function expectNoRawNewlineInText(xml) {
  expect(xml).not.toMatch(/<w:t[^>]*>[^<]*\n[^<]*<\/w:t>/);
}

describe('適性紀錄 line breaks', () => {
  function exportReport() {
    return generateParentReportDocxBlob({
      child: { name: '陳小安', birthDate: '2024-06-20' },
      report: { tier: 'Ⅴ', period: '115年06月' },
      coursePlanEntries: [{ id: 1, reportId: 1, indicatorCode: 'Ⅴ-1-6', activityName: '我愛畫畫', indicatorText: '內容一\n內容二' }],
      courseOccurrencesByEntryId: {
        1: [
          { id: 1, entryId: 1, date: '2026-06-02', status: 'developed', note: '說明一\n說明二' },
          { id: 2, entryId: 1, date: '2026-06-09', status: null, absent: true, note: '請假說明\n第二行' },
        ],
      },
      developmentRecordEntries: [{ id: 1, reportId: 1, domain: 1, narrative: '第一段\n第二段', courseEntryIds: [] }],
      behaviorObservations: [{ id: 1, reportId: 1, title: '午睡', narrative: '觀察一\n觀察二' }],
      highlightEntries: [],
    });
  }

  it('writes each typed line as its own paragraph', async () => {
    const xml = await documentXmlOf(await exportReport());
    expectNoRawNewlineInText(xml);
    for (const line of ['內容一', '內容二', '說明一', '說明二', '第二行', '第一段', '第二段', '觀察一', '觀察二']) {
      expect(xml).toMatch(new RegExp(`<w:t[^>]*>${line}</w:t>`));
    }
  });

  it('keeps a flagged note red and struck on every line', async () => {
    const xml = await documentXmlOf(await exportReport());
    const secondLineRun = /<w:r>(?:(?!<w:r>)[\s\S])*?<w:t[^>]*>第二行<\/w:t>/.exec(xml)[0];
    expect(secondLineRun).toContain('<w:strike/>');
    expect(secondLineRun).toMatch(/<w:color w:val="FF0000"\/>/);
  });

  it('keeps the first-line indent on every narrative paragraph', async () => {
    const xml = await documentXmlOf(await exportReport());
    const paragraph = /<w:p>(?:(?!<w:p>)[\s\S])*?第二段/.exec(xml)[0];
    expect(paragraph).toContain('w:firstLine="480"');
  });

  it('reads every line back on re-import', async () => {
    const data = await parseParentReportDocxImport(await bytesOf(await exportReport()));
    const [entry] = data.coursePlanEntries;
    expect(entry.indicatorText).toBe('內容一\n內容二');
    expect(entry.occurrences.map(o => o.note)).toEqual(['說明一\n說明二', '請假說明\n第二行']);
    expect(entry.occurrences[1].absent).toBe(true);
    expect(data.developmentRecordBlocks.map(b => b.narrative)).toEqual(['第一段\n第二段']);
    expect(data.behaviorObservations.map(o => o.narrative)).toEqual(['觀察一\n觀察二']);
  });
});

describe('總表 line breaks', () => {
  function exportForm() {
    return generateDocxBlob({
      child: { name: '陳小安', birthDate: '2024-11-01' },
      form: { tier: 'Ⅳ', period: '115年01月' },
      indicators: getIndicatorsForTier('Ⅳ'),
      entries: [
        { indicatorCode: 'Ⅳ-1-1', date: '2026-01-07', status: 'developed', note: '敘述一\n敘述二' },
        { indicatorCode: 'Ⅳ-1-2', date: '2026-01-08', status: 'absent', note: '請假原因\n補充' },
      ],
      previousTierEntries: [{ indicatorCode: 'Ⅲ-1-1', date: '2025-12-01', status: 'developing', note: '備註一\n備註二' }],
    });
  }

  it('writes each typed line as its own paragraph, a flagged note red on every line', async () => {
    const xml = await documentXmlOf(await exportForm());
    expectNoRawNewlineInText(xml);
    for (const line of ['敘述一', '敘述二', '補充', '備註一', '備註二']) {
      expect(xml).toMatch(new RegExp(`<w:t[^>]*>${line}</w:t>`));
    }
    const flaggedSecondLine = /<w:r>(?:(?!<w:r>)[\s\S])*?<w:t[^>]*>補充<\/w:t>/.exec(xml)[0];
    expect(flaggedSecondLine).toMatch(/<w:color w:val="C00000"\/>/); // 總表's red, not 適性紀錄's FF0000
  });

  it('reads every line back on re-import', async () => {
    const { entries } = await parseDocxImport(await bytesOf(await exportForm()));
    const notesByCode = Object.fromEntries(entries.map(e => [e.indicatorCode, e.note]));
    expect(notesByCode['Ⅳ-1-1']).toBe('敘述一\n敘述二');
    expect(notesByCode['Ⅳ-1-2']).toBe('請假原因\n補充');
    expect(notesByCode['Ⅲ-1-1']).toBe('備註一\n備註二');
  });
});
