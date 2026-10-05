// "Items on loan" (C19, Phase 2 slice 8, docs/DECISIONS.md #65): the instruments and other items a
// person holds now, with the date lent and the due date. On C8 (a student's profile, staff open
// the item from here) and on A3 My profile (what I hold). Loads itself; shows nothing when the
// person holds nothing or the list cannot be loaded, so it never gets in the way.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fetchHeldItems, type HeldItem } from '@/data/inventory';
import { dateInIndia, formatDayMonthYear, todayInIndia } from '@/lib/dates';

import { ListRow } from './list-row';
import { Section } from './section';

/** Props for HeldItemsPanel. */
export type HeldItemsPanelProps = {
  /** Whose items: a student record (C8), a staff login, or 'mine' for a signed-in student. */
  by: { studentId: string } | { profileId: string } | 'mine';
  /** Staff: a row opens the item. */
  openable?: boolean;
};

/** The items a person holds now. */
export function HeldItemsPanel({ by, openable }: HeldItemsPanelProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<HeldItem[] | null>(null);
  const key = by === 'mine' ? 'mine' : 'studentId' in by ? by.studentId : by.profileId;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void fetchHeldItems(by).then((result) => {
        if (!cancelled) setItems(result);
      });
      return () => {
        cancelled = true;
      };
      // `key` stands for `by`, which is a new object on every render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]),
  );

  if (!items || items.length === 0) return null;
  const today = todayInIndia();
  return (
    // "Bring them back to a coordinator" is for the student's own view, not for staff.
    <Section icon="instruments" title={t('inventory.heldTitle')} description={by === 'mine' ? t('inventory.heldHint') : undefined}>
      {items.map((item) => (
        <ListRow
          key={item.loanId}
          leading="instruments"
          highlighted={item.dueOn !== null && item.dueOn < today}
          title={item.label}
          details={[
            [
              t(`inventory.kinds.${item.kind}`),
              t('inventory.sinceLine', { date: formatDayMonthYear(dateInIndia(item.issuedAt)) }),
              ...(item.dueOn
                ? [t(item.dueOn < today ? 'inventory.overdueLine' : 'inventory.dueLine', { date: formatDayMonthYear(item.dueOn) })]
                : []),
            ].join(' · '),
          ]}
          onPress={openable ? () => router.push({ pathname: '/staff/inventory/[id]', params: { id: String(item.itemId) } }) : undefined}
        />
      ))}
    </Section>
  );
}
