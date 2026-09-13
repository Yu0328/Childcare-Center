import { runRequest } from '../storage/dbCore.js';
import { writeSyncState, deleteSyncState } from '../storage/syncStateDb.js';
import { mapWithConcurrency, MAX_CONCURRENCY } from './driveClient.js';
import { PHOTO_STORE } from './syncStores.js';

// A photo's sync state lives in the syncState store keyed by photoUid, never as a flag on the
// record itself. Writing "synced: true" back onto the 點滴分享 entry would bump its updatedAt and
// make the record look locally edited, which would bounce it back up as a fake change on every
// single sync.
function collectLocalPhotos(snapshot) {
  const descriptors = new Map();
  for (const entry of snapshot.records.values()) {
    if (entry.store !== PHOTO_STORE) continue;
    for (const photo of entry.record.photos || []) {
      if (photo && photo.photoUid) descriptors.set(photo.photoUid, { entry, photo });
    }
  }
  return descriptors;
}

async function attachDownloadedPhoto(entry, photoUid, blob) {
  const stored = await runRequest(entry.store, 'readonly', store => store.get(entry.id));
  if (!stored) return;
  const photos = (stored.photos || []).map(photo =>
    photo.photoUid === photoUid ? { ...photo, blob } : photo
  );
  // Raw put, not putRecord: filling in bytes the cloud already has is not a local edit, and
  // bumping updatedAt here would schedule a pointless re-upload of the whole record.
  await runRequest(entry.store, 'readwrite', store => store.put({ ...stored, photos, id: entry.id }));
  entry.record.photos = photos;
}

export async function syncPhotos({ drive, folderId, snapshot, cloudPhotos, state, cloudNow }) {
  const localPhotos = collectLocalPhotos(snapshot);

  const toUpload = [];
  const toDownload = [];
  for (const [photoUid, { entry, photo }] of localPhotos) {
    if (photo.blob && !state.has(photoUid)) {
      toUpload.push({ photoUid, blob: photo.blob });
    } else if (!photo.blob && cloudPhotos.has(photoUid)) {
      // Descriptor without bytes: this record arrived from the cloud and its photo has not been
      // fetched yet. Each photo is its own file, so an interrupted first sync resumes here.
      toDownload.push({ photoUid, entry, fileId: cloudPhotos.get(photoUid).fileId });
    }
  }

  // Only photos this device has synced before are candidates for deletion. A cloud photo we have
  // never seen is another device's brand-new upload, not a leftover — trashing it would be the
  // "刪了又跑出來" bug in reverse.
  const toTrash = [];
  for (const [photoUid, cloudPhoto] of cloudPhotos) {
    if (!localPhotos.has(photoUid) && state.has(photoUid)) {
      toTrash.push({ photoUid, fileId: cloudPhoto.fileId });
    }
  }

  const uploads = await mapWithConcurrency(toUpload, MAX_CONCURRENCY, async ({ photoUid, blob }) => {
    const { fileId } = await drive.uploadPhoto(folderId, { photoUid, blob });
    await writeSyncState({ uid: photoUid, store: 'photo', hash: null, fileId, syncedAt: cloudNow });
  });

  const downloads = await mapWithConcurrency(toDownload, MAX_CONCURRENCY, async ({ photoUid, entry, fileId }) => {
    const blob = await drive.downloadPhoto(fileId);
    await attachDownloadedPhoto(entry, photoUid, blob);
    await writeSyncState({ uid: photoUid, store: 'photo', hash: null, fileId, syncedAt: cloudNow });
  });

  const trashes = await mapWithConcurrency(toTrash, MAX_CONCURRENCY, async ({ photoUid, fileId }) => {
    await drive.trashFile(fileId);
    await deleteSyncState(photoUid);
  });

  const all = [...uploads, ...downloads, ...trashes];
  return {
    uploaded: uploads.filter(r => r.ok).length,
    downloaded: downloads.filter(r => r.ok).length,
    trashed: trashes.filter(r => r.ok).length,
    failed: all.filter(r => !r.ok).length,
  };
}
