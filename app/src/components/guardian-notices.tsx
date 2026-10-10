// C8: under a guardian of a minor, whether they get the check-in / check-out emails (0043,
// docs/DECISIONS.md #224-#231), with the switch and the language a coordinator sets when the
// parent asks. Renders nothing before migration 0043 or for an adult student.
// Data: src/data/parent-notices.ts.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { Notice } from '@/components/notice';
import type { MessageKey } from '@/data/errors';
import { fetchGuardianNotices, saveGuardianNotices, type GuardianNotice } from '@/data/parent-notices';
import { LANGUAGES, type Language } from '@/i18n';
import { formatDate, localDate, localTime } from '@/lib/dates';

/** The language choice: the child's app language, or one of the three. */
type LanguageChoice = Language | 'app';

/** The notice lines for one student's guardians, keyed by guardian id; rendered per guardian. */
export function useGuardianNotices(studentId: string, minor: boolean) {
  // undefined = loading or hidden; null = could not load.
  const [notices, setNotices] = useState<Map<string, GuardianNotice> | null | undefined>(undefined);
  // Bumped to load again after a change.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!minor) return;
    let cancelled = false;
    void fetchGuardianNotices(studentId).then((result) => {
      if (!cancelled) setNotices(result === 'missing' ? undefined : result);
    });
    return () => {
      cancelled = true;
    };
  }, [studentId, minor, attempt]);
  const reload = useCallback(async () => setAttempt((n) => n + 1), []);
  return { notices: minor ? notices : undefined, reload };
}

type Props = { notice: GuardianNotice | undefined; onChanged: () => Promise<void> };

/** One guardian's line: status, and for a guardian with an email the switch and the language. */
export function GuardianNoticeLine({ notice, onChanged }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKey | undefined>(undefined);
  if (!notice) return null;

  const stopped = notice.block === 'stopped';
  const canSwitch = notice.block === null || stopped || notice.block === 'switched_off';
  const language: LanguageChoice = notice.language ?? 'app';

  async function save(on: boolean, next: LanguageChoice) {
    if (!notice) return;
    setBusy(true);
    setErrorKey(await saveGuardianNotices(notice.guardianId, on, next === 'app' ? null : next));
    await onChanged();
    setBusy(false);
  }

  return (
    <>
      <AppText variant="small" tone={notice.block === null ? 'success' : 'muted'}>
        {notice.block === null ? t('parentNotices.on') : t(`parentNotices.blocks.${notice.block}`)}
        {notice.lastSentAt
          ? ` · ${t('parentNotices.lastSent', { date: formatDate(localDate(notice.lastSentAt)), time: localTime(notice.lastSentAt) })}`
          : ''}
      </AppText>
      {canSwitch && !stopped ? (
        <ChoiceGroup
          label={t('parentNotices.language')}
          chips
          choices={[
            { value: 'app', label: t('parentNotices.appLanguage') },
            ...LANGUAGES.map((l) => ({ value: l.code, label: l.nativeName, lang: l.code })),
          ]}
          value={language}
          onChange={(next) => void save(true, next)}
        />
      ) : null}
      {canSwitch ? (
        <Button
          variant="secondary"
          icon="guardian"
          loading={busy}
          label={stopped ? t('parentNotices.start') : t('parentNotices.stop')}
          onPress={() => void save(stopped, language)}
        />
      ) : null}
      {errorKey ? <Notice tone="error">{t(errorKey)}</Notice> : null}
    </>
  );
}
