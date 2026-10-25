/**
 * Turn zod issue paths into a plain-language field hint, so a strict-schema
 * rejection says WHICH field to fix instead of a generic "wrong format".
 * `path` is widened to PropertyKey (zod v4 allows symbol segments) and mapped
 * to strings — field paths are never symbols in practice, but the join keeps
 * the signature total.
 */
export function fieldHint(
  issues: readonly { path: readonly PropertyKey[] }[],
  labelFor?: (key: string) => string
): string {
  const names = Array.from(
    new Set(
      issues.map(
        (i) =>
          i.path.map((p) => (labelFor ? labelFor(String(p)) : String(p))).join('.') || 'entry'
      )
    )
  );
  return `Please check these fields: ${names.join(', ')}.`;
}
