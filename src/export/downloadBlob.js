export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  // Safari has been observed to drop the download entirely, with no error, when the object
  // URL is revoked (and the element removed) synchronously right after click() — its download
  // handling can still be starting asynchronously at that point, unlike Chrome/Edge, which
  // capture the blob's data immediately. A short delay avoids that race; it's harmless
  // everywhere else since nothing else depends on the URL being revoked immediately.
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
