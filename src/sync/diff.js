// Pure three-way comparison: local snapshot vs cloud listing vs the base both sides agreed on at
// the last successful sync. It only compares content hashes, so deciding what needs to move
// takes exactly one Drive files.list call and zero downloads — "只更新不同的地方" rather than
// re-uploading everything.
export function planSync({ local, cloud, state, tombstones }) {
  const creates = [];
  const uploads = [];
  const downloads = [];
  const merges = [];
  const trashes = [];
  const localDeletes = [];
  const upToDate = [];

  const deleted = new Set(tombstones.map(tombstone => tombstone.uid));

  for (const uid of new Set([...local.keys(), ...cloud.keys(), ...deleted])) {
    const localEntry = local.get(uid);
    const cloudEntry = cloud.get(uid);

    // A tombstone wins over everything else: the teacher deliberately deleted this here, and the
    // whole point of syncing deletes is that it stays deleted rather than reappearing from
    // whichever device still had a copy.
    if (deleted.has(uid)) {
      if (cloudEntry) trashes.push({ uid, fileId: cloudEntry.fileId });
      continue;
    }

    const base = state.get(uid);

    if (localEntry && !cloudEntry) {
      if (base) localDeletes.push(uid);
      else creates.push(uid);
      continue;
    }

    if (!localEntry && cloudEntry) {
      if (base) trashes.push({ uid, fileId: cloudEntry.fileId });
      else downloads.push(uid);
      continue;
    }

    if (!localEntry && !cloudEntry) continue;

    if (localEntry.hash === cloudEntry.hash) {
      upToDate.push(uid);
    } else if (base && localEntry.hash === base.hash) {
      downloads.push(uid);
    } else if (base && cloudEntry.hash === base.hash) {
      uploads.push(uid);
    } else {
      // Both sides moved (or there is no base at all, as on a first sign-in) — which fields
      // actually clash is fieldMerge's job, not this function's.
      merges.push(uid);
    }
  }

  return { creates, uploads, downloads, merges, trashes, localDeletes, upToDate };
}
