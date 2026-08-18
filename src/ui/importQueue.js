// Processes a multi-file selection one at a time: parses the next file, shows its own
// preview/confirm screen, and — whether the user confirms or cancels that one — moves on to
// the next file in the queue, rather than dropping back to the list until every selected file
// has had its own turn. A file that fails to parse is skipped (not aborting the rest of the
// batch); every skipped filename is reported together in one summary once the whole queue
// finishes, since the preview screens that follow would otherwise overwrite a per-file error
// before the person ever saw it. Successfully-imported filenames get the same one-summary
// treatment via [data-success="import"] — a small change buried a few files into a multi-file
// batch is otherwise easy to miss with no confirmation at all.
export async function processImportQueue(files, { parseFn, renderPreview, container, backToList }) {
  const queue = Array.from(files);
  const skipped = [];
  const imported = [];

  async function next(index) {
    if (index >= queue.length) {
      await backToList();
      if (skipped.length > 0) {
        const importErrorEl = container.querySelector('[data-error="import"]');
        if (importErrorEl) importErrorEl.textContent = `以下檔案無法讀取，已略過：${skipped.join('、')}`;
      }
      if (imported.length > 0) {
        const importSuccessEl = container.querySelector('[data-success="import"]');
        if (importSuccessEl) importSuccessEl.textContent = `已成功匯入：${imported.join('、')}`;
      }
      return;
    }

    const file = queue[index];
    let parsed;
    try {
      parsed = await parseFn(file);
    } catch (err) {
      skipped.push(file.name);
      await next(index + 1);
      return;
    }

    renderPreview(container, {
      parsed,
      onCancel: () => next(index + 1),
      onImported: () => {
        imported.push(file.name);
        next(index + 1);
      },
    });
  }

  await next(0);
}
