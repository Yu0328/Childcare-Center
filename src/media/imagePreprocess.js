export function calculateTargetDimensions(width, height, maxEdge) {
  const longerEdge = Math.max(width, height);
  if (longerEdge <= maxEdge) return { width, height };

  const scale = maxEdge / longerEdge;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// Draws `file` onto an offscreen canvas at a reduced size/quality and returns the compressed
// result plus its final pixel dimensions (needed later to size the image correctly in the docx
// export, since photos arrive in whatever aspect ratio the phone camera used).
//
// maxEdge is 960 because that is already wider than anywhere a photo is ever shown:
// parentReportDocxExport.js lays 點滴分享 photos out at most ~717px wide in the Word file. Storing
// 1600px cost ~3x the bytes for resolution nothing displays — which now also means 3x the upload
// on every sync. Photos already saved under the old setting are left alone.
export async function compressImage(file, { maxEdge = 960, quality = 0.8 } = {}) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('無法讀取這張照片'));
      img.src = objectUrl;
    });

    const { width, height } = calculateTargetDimensions(image.naturalWidth, image.naturalHeight, maxEdge);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
