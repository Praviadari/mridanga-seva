// The email check of every form. Pure, unit-tested (tests/form-checks.test.mjs).

/**
 * Catches typing mistakes; the server does the real check. One @, no spaces or commas, no dot at the
 * start, end or twice in a row before it; after it a domain of letters, digits and hyphens ending in
 * a dot and at least two letters (name@gmail.com, not name@gmail or name@gmail.c; docs/DECISIONS.md #267).
 */
export function isValidEmail(email: string): boolean {
  const text = email.trim();
  if (text.length > 254) return false;
  const match = /^([^\s@,;:<>()[\]\\"]+)@((?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,})$/.exec(text);
  if (!match) return false;
  const local = match[1];
  return local.length <= 64 && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..');
}
