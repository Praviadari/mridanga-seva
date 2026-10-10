// "What you typed is back": shown at the top of a long form that was filled in again from the draft
// kept when the server ended the login (src/lib/form-drafts.ts, D6-20 part 2), with a button to
// throw the draft away instead.

import { useTranslation } from 'react-i18next';

import { AppText } from './app-text';
import { Button } from './button';
import { Notice } from './notice';

/** Props for DraftNotice. */
export type DraftNoticeProps = {
  /** Extra lines, already translated, e.g. "add the photos again". */
  notes?: string[];
  /** Label of the button that drops the draft, already translated. */
  discardLabel: string;
  /** Drops the draft: an empty form, or the saved version. */
  onDiscard: () => void;
};

/** Notice plus a "start empty" button, for a form filled in from a kept draft. */
export function DraftNotice({ notes = [], discardLabel, onDiscard }: DraftNoticeProps) {
  const { t } = useTranslation();
  return (
    <>
      <Notice tone="info" announced title={t('drafts.restoredTitle')}>
        {t('drafts.restoredBody')}
      </Notice>
      {notes.map((note) => (
        <AppText key={note} tone="muted">
          {note}
        </AppText>
      ))}
      <Button variant="secondary" icon="refresh" label={discardLabel} onPress={onDiscard} />
    </>
  );
}
