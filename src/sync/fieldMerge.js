function same(a, b) {
  return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
}

// 點滴分享 photos are a set, not a value: one device adding a photo while the other edits the
// caption is not a disagreement, it is two additions to keep. Union by photoUid (falling back to
// the whole element for anything without one) keeps both without ever asking.
function unionByPhotoUid(localList, cloudList) {
  const merged = [];
  const seen = new Set();
  for (const item of [...(localList || []), ...(cloudList || [])]) {
    const key = item && item.photoUid ? item.photoUid : JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

// Three-way field merge. `base` is the version both sides last agreed on: with it, "this field
// only moved on one side" is answerable without asking anyone, which is what keeps the conflict
// screen for genuine disagreements only. Without a base (first sign-in) any difference has to be
// treated as a disagreement — there is no way to tell who changed what.
export function mergeFields(base, localPayload, cloudPayload, { unionArrayFields = [] } = {}) {
  const merged = {};
  const conflicts = [];
  const unionFields = new Set(unionArrayFields);

  for (const field of new Set([...Object.keys(localPayload), ...Object.keys(cloudPayload)])) {
    const localValue = localPayload[field];
    const cloudValue = cloudPayload[field];

    if (unionFields.has(field)) {
      merged[field] = unionByPhotoUid(localValue, cloudValue);
      continue;
    }
    if (same(localValue, cloudValue)) {
      merged[field] = localValue === undefined ? cloudValue : localValue;
      continue;
    }
    if (base && same(localValue, base[field])) {
      merged[field] = cloudValue;
      continue;
    }
    if (base && same(cloudValue, base[field])) {
      merged[field] = localValue;
      continue;
    }

    conflicts.push({ field, local: localValue, cloud: cloudValue });
    merged[field] = localValue;
  }

  return { merged, conflicts };
}
