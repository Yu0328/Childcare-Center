import esbuild from 'esbuild';
import { execSync } from 'node:child_process';
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

// Version = total commit count across every change since the project began. Counts the union of
// `public` (deploy snapshots) and the dev branch explicitly, rather than plain HEAD — otherwise the
// number depends on which branch happens to be checked out at build time (public's own history is
// much shorter than the dev branch's, since it only holds one squashed-ish commit per deploy).
const version = execSync('git rev-list --count public worktree-monthly-course-plan-design').toString().trim();

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
  <button type="button" class="app-header__brand" id="home-button">屏東縣內埔鄉育英公托填表系統</button>
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
<footer class="app-version">v${version}</footer>
</body>
</html>
`;

writeFileSync('dist/TableC.html', html);
console.log('Built dist/TableC.html (%d bytes)', html.length);
