import type { CanonicalDocument, CanonicalItem } from './canonicalize';
import type { DiffLine } from './contracts';
export type ItemDiff = {
  identity: string;
  type: 'new' | 'updated' | 'removed';
  before: CanonicalItem | null;
  after: CanonicalItem | null;
};
export function compareSnapshots(previous: CanonicalDocument, next: CanonicalDocument): ItemDiff[] {
  if (previous.normalizationVersion !== next.normalizationVersion)
    throw new Error('BASELINE_REQUIRED');
  const before = new Map(previous.items.map((i) => [i.identity, i]));
  const after = new Map(next.items.map((i) => [i.identity, i]));
  const changes: ItemDiff[] = [];
  for (const [identity, item] of after) {
    const old = before.get(identity);
    if (!old) changes.push({ identity, type: 'new', before: null, after: item });
    else if (old.hash !== item.hash)
      changes.push({ identity, type: 'updated', before: old, after: item });
  }
  for (const [identity, item] of before)
    if (!after.has(identity))
      changes.push({ identity, type: 'removed', before: item, after: null });
  return changes;
}
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n'),
    b = after.split('\n');
  if (a.length * b.length > 500_000) {
    const setA = new Set(a),
      setB = new Set(b);
    return [
      ...a.filter((x) => !setB.has(x)).map((text) => ({ kind: 'removed' as const, text })),
      ...b.map((text) => ({
        kind: setA.has(text) ? ('unchanged' as const) : ('added' as const),
        text,
      })),
    ];
  }
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ kind: 'unchanged', text: a[i++] });
      j++;
    } else if (j < b.length && (i === a.length || dp[i][j + 1] >= dp[i + 1][j]))
      out.push({ kind: 'added', text: b[j++] });
    else out.push({ kind: 'removed', text: a[i++] });
  }
  return out;
}
