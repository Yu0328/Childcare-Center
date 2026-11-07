// 月計畫's child order (plan.childIds), set by tapping children in turn in 管理幼兒 → 排順序.

// Tapped children first, in tap order; the untapped keep their old order after them.
export function applyTapOrder(currentIds, tappedIds) {
  return [...tappedIds, ...currentIds.filter(id => !tappedIds.includes(id))];
}

// What 儲存 writes: the ordered children still checked, then newly checked ones in list order.
export function finalChildIds(orderedIds, checkedIds) {
  return [...orderedIds.filter(id => checkedIds.includes(id)), ...checkedIds.filter(id => !orderedIds.includes(id))];
}
