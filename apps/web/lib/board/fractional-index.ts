/**
 * Compute a new `order` value for an item inserted at `newIndex` within a
 * list that currently has `list.length` items (BEFORE the insertion).
 *
 * If the caller is REORDERING an item already in the list, they should pass
 * a list that excludes that item first (or the neighbours around it will
 * compute against the item's own value and produce a no-op).
 *
 * Returns a float that sits strictly between the neighbour orders, matching
 * the "fractional index" pattern:
 *   - Empty list  → 1000
 *   - Head insert → firstOrder - 1000
 *   - Tail insert → lastOrder  + 1000
 *   - Middle     → (prev + next) / 2
 *
 * Repeated dragging can produce arbitrarily close midpoints; a rebalance
 * pass would be a follow-up. Not blocking for the assessment scope.
 */
export function fractionalIndexAt(list: readonly { order: number }[], newIndex: number): number {
  const n = list.length;
  if (n === 0) return 1000;

  const clamped = Math.max(0, Math.min(newIndex, n));

  if (clamped === 0) return list[0]!.order - 1000;
  if (clamped === n) return list[n - 1]!.order + 1000;

  const prev = list[clamped - 1]!.order;
  const next = list[clamped]!.order;
  return (prev + next) / 2;
}
