// "Possible duplicate" at the desk (docs/DECISIONS.md #274, #390; launch audit 15-10-2026): before a person is
// saved or accepted, Register a student asks possible_duplicates (migration 0047) for student records and waiting
// sign-ups with the same name and date of birth, or the same phone. 0047 added the function for the desk, but the
// app never asked it, so a person registered by hand and also signed up, or typed in twice at two desks, became two
// records on the registration weekend. Pure, so tests run it; the call is in src/data/students.ts.

/** One record or sign-up that may be the person at the desk. */
export type PossibleDuplicate = {
  kind: 'student' | 'sign_up';
  id: string;
  /** Students only. */
  rollNo: string | null;
  fullName: string;
  /** The centre's name, or null. */
  centre: string | null;
  /** 'YYYY-MM-DD': joined (a student) or signed up (a sign-up); null when unknown. */
  since: string | null;
  /** A student record whose consent was withdrawn. */
  withdrawn: boolean;
  /** Same name and date of birth, and / or same phone. */
  sameNameAndBirth: boolean;
  samePhone: boolean;
};

/**
 * The answer of possible_duplicates as a list, leaving out `self` (the sign-up being accepted or filled in, which
 * always matches itself) and anything malformed. Students come first, as the database orders them.
 * @param rows possible_duplicates' JSON array (anything else gives an empty list).
 * @param self the id of the sign-up the desk is working from, if any.
 */
export function duplicatesFrom(rows: unknown, self: string | null = null): PossibleDuplicate[] {
  if (!Array.isArray(rows)) return [];
  const out: PossibleDuplicate[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const kind = r.kind === 'student' || r.kind === 'sign_up' ? r.kind : null;
    if (!kind || typeof r.id !== 'string' || typeof r.full_name !== 'string') continue;
    if (kind === 'sign_up' && r.id === self) continue;
    const matched = Array.isArray(r.matched) ? r.matched : [];
    out.push({
      kind,
      id: r.id,
      rollNo: typeof r.roll_no === 'string' ? r.roll_no : null,
      fullName: r.full_name,
      centre: typeof r.centre === 'string' ? r.centre : null,
      since: typeof r.since === 'string' ? r.since.slice(0, 10) : null,
      withdrawn: r.withdrawn === true,
      sameNameAndBirth: matched.includes('name_dob'),
      samePhone: matched.includes('phone'),
    });
  }
  return out;
}

/**
 * The question possible_duplicates is asked, or null when there is nothing to match on: a name with a date of
 * birth, and / or a phone with 7 or more digits (the database's own minimum).
 * @param fullName the name as typed. @param dob 'YYYY-MM-DD' or null. @param phone as typed, or null.
 */
export function duplicateQuery(
  fullName: string,
  dob: string | null,
  phone: string | null,
): { p_full_name: string; p_dob: string | null; p_phone: string | null } | null {
  const name = fullName.trim();
  const digits = (phone ?? '').replace(/\D/g, '');
  const byName = name !== '' && dob !== null;
  const byPhone = digits.length >= 7;
  if (!byName && !byPhone) return null;
  return { p_full_name: name, p_dob: byName ? dob : null, p_phone: byPhone ? (phone ?? '').trim() : null };
}

/** The same question again gives the same key: a list is shown only for the person it was asked for. */
export function duplicateKey(query: ReturnType<typeof duplicateQuery>): string {
  return query ? `${query.p_full_name.toLowerCase()}|${query.p_dob ?? ''}|${(query.p_phone ?? '').replace(/\D/g, '')}` : '';
}
