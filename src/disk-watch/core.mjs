// Disk-revision guard for the served editor. Disk state is versioned by an
// X-Artisan-Rev header (mtime-based); async responses can land out of order,
// and applying a stale response would regress the editor's "last disk state I
// saw" — making the poll flag the editor's OWN saves as external changes, and
// letting the next PUT send a stale If-Match (409 → stale-tab reload).
// Shared seam so the rule is unit-testable (test/contract.mjs).
export function diskState(rev, known) {
  if (rev > known) return 'fresh'; // disk genuinely changed → diff + apply
  if (rev === known) return 'same'; // unchanged since last look → nothing to do
  return 'stale'; // out-of-order response → ignore, never regress
}
