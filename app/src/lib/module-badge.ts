// The count on a home circle (simple home, docs/DECISIONS.md #240): what is drawn on the badge and
// what a screen reader says for the circle. Plain functions, so app/tests can check them without React.

/** The number drawn on a badge: none for 0 or less, "9+" above nine (the badge holds two characters). */
export function badgeText(count: number | undefined): string | null {
  if (!count || count <= 0) return null;
  return count > 9 ? '9+' : String(count);
}

/**
 * The accessible name of a circle: its label, then the badge said in words ("Announcements, 3 new")
 * when there is a count, then "Coming soon" for a module not built yet.
 */
export function moduleSpokenName(label: string, options: { badgeSpoken?: string; count?: number; soon?: string }): string {
  const parts = [label];
  if (options.badgeSpoken && badgeText(options.count) !== null) parts.push(options.badgeSpoken);
  if (options.soon) parts.push(options.soon);
  return parts.join(', ');
}
