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

// Semantic Versioning (MAJOR.MINOR.PATCH) — bump package.json's "version" by hand per release,
// same as any npm package. A commit-count-derived number (the previous approach) isn't meaningful
// on its own and swung wildly depending which branch happened to be checked out at build time.
const { version } = JSON.parse(readFileSync('package.json', 'utf-8'));

// This build has no external files at all (the whole point is one self-contained offline HTML
// file), so the header icon/favicon has to be inlined as a data URI rather than a normal <img src>.
const iconDataUri = `data:image/png;base64,${readFileSync('assets/icons/icon-192.png').toString('base64')}`;

const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="${iconDataUri}">
<title>屏東縣內埔鄉育英公托填表系統</title>
<style>
${css}
</style>
</head>
<body>
<header class="app-header">
  <button type="button" class="app-header__brand" id="home-button"><img src="${iconDataUri}" alt="" class="app-header__brand-icon">屏東縣內埔鄉育英公托填表系統</button>
  <div class="app-header__actions">
    <button type="button" class="btn btn--header" id="export-backup" title="此備份檔為未加密的完整資料（含幼兒姓名、出生日期等個資），請勿放在共用雲端資料夾">匯出備份</button>
    <label class="btn btn--header btn--header-file">匯入備份 <input type="file" id="import-backup" accept="application/json"></label>
  </div>
</header>
<main id="app"></main>
<script>
${js}
document.addEventListener('DOMContentLoaded', () => {
  const backupControls = CFormApp.wireBackupControls({
    exportButton: document.getElementById('export-backup'),
    importInput: document.getElementById('import-backup'),
  });
  CFormApp.mountApp(document.getElementById('app'), { onUnlock: backupControls.updateLockState });
});
</script>
<footer class="app-version">v${version}</footer>
</body>
</html>
`;

writeFileSync('dist/TableC.html', html);
console.log('Built dist/TableC.html (%d bytes)', html.length);
