import esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });

const result = await esbuild.build({
  entryPoints: ['src/app.js'],
  bundle: true,
  format: 'iife',
  globalName: 'CFormApp',
  write: false,
  target: ['chrome100', 'safari15'],
});

const js = result.outputFiles[0].text;
const css = readFileSync('src/styles.css', 'utf-8');

const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>屏東縣內埔鄉育英公托填表系統</title>
<style>
${css}
</style>
</head>
<body>
<header class="app-header">
  <span class="app-header__brand">屏東縣內埔鄉育英公托填表系統</span>
  <div class="app-header__actions">
    <button type="button" class="btn btn--header" id="export-backup">匯出備份</button>
    <label class="btn btn--header btn--header-file">匯入備份 <input type="file" id="import-backup" accept="application/json"></label>
  </div>
</header>
<main id="app"></main>
<script>
${js}
document.addEventListener('DOMContentLoaded', () => {
  CFormApp.wireBackupControls({
    exportButton: document.getElementById('export-backup'),
    importInput: document.getElementById('import-backup'),
  });
});
</script>
</body>
</html>
`;

writeFileSync('dist/TableC.html', html);
console.log('Built dist/TableC.html (%d bytes)', html.length);
