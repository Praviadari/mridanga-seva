// Shown instead of the app when app/.env is missing or holds the wrong key, so a new
// developer gets a clear instruction instead of a crash. See docs/OPERATIONS.md.

import { useTranslation } from 'react-i18next';

import { AppText } from './app-text';
import { Notice } from './notice';
import { Screen } from './screen';

/** Props for SetupNeeded. */
export type SetupNeededProps = {
  /** From supabaseConfigProblem in src/lib/supabase.ts. */
  problem: 'missing' | 'secretKey';
};

/** Explains what is wrong with the Supabase settings and how to fix it. */
export function SetupNeeded({ problem }: SetupNeededProps) {
  const { t } = useTranslation();
  return (
    <Screen centred>
      <AppText variant="title">{t('setup.title')}</AppText>
      <Notice tone="error">{problem === 'secretKey' ? t('setup.secretKey') : t('setup.missing')}</Notice>
    </Screen>
  );
}
