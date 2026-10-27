// Weekly email to parents (0058, docs/DECISIONS.md #530-#539), from G10 Settings and a student's page: the Guru's
// switch (off by default; every change in the audit log), who would get it and why not, this week's and today's
// numbers against the daily ceilings, and, opened from a student's page (?student=<id>), a preview of exactly the
// email that student's parent gets, built by notify-parents with the code that sends it. Coordinators see
// everything but the switch. Data: src/data/parent-digest.ts. Also the parent page's own switch and how often it was
// opened (0063, docs/DECISIONS.md #640-#649; src/data/parent-view.ts).

import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { LoadingCards } from '@/components/loading-cards';
import { ScreenIntro } from '@/components/more-text';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import type { MessageKey } from '@/data/errors';
import { fetchDigestOverview, fetchDigestPreview, switchDigest, type DigestOverview, type DigestPreview } from '@/data/parent-digest';
import { fetchParentViewOverview, switchParentView, type ParentViewOverview } from '@/data/parent-view';
import { LANGUAGES, type Language } from '@/i18n';
import { announce } from '@/lib/announce';
import { formatDate, formatDateTime } from '@/lib/dates';
import { isRouteId } from '@/lib/route-id';
import { confirmReady, confirmShown } from '@/lib/second-tap';

/** The reasons a parent address gets no email, in the order the overview lists them. */
const REASONS = ['no_digest_consent', 'no_consent', 'not_active', 'withdrawn', 'no_email', 'adult', 'not_eligible'] as const;
/** What became of an email, and the job's answers, as the app words them; anything newer is shown as stored. */
const OUTCOMES = ['waiting', 'sent', 'skipped', 'expired', 'stopped', 'switched_off', 'not_eligible', 'gave_up'] as const;
const JOB_RESULTS = ['off', 'nothing_due', 'night', 'cap_reached', 'not_set_up', 'called'] as const;

export default function ParentDigestScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { student } = useLocalSearchParams<{ student?: string }>();
  const studentId = typeof student === 'string' && isRouteId(student, 'uuid') ? student : null;
  // undefined = loading, null = could not load, 'missing' = the database has no weekly email yet (before 0058).
  const [overview, setOverview] = useState<DigestOverview | 'missing' | null | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<MessageKey | null>(null);
  const [language, setLanguage] = useState<Language | null>(null);
  const [preview, setPreview] = useState<DigestPreview | { errorKey: MessageKey } | undefined>(undefined);

  const load = useCallback(async () => {
    setOverview(await fetchDigestOverview());
  }, []);
  // undefined = loading, null = could not load, 'missing' = before 0063 (the section stays hidden).
  const [page, setPage] = useState<ParentViewOverview | 'missing' | null | undefined>(undefined);
  const loadPage = useCallback(async () => {
    setPage(await fetchParentViewOverview());
  }, []);
  const loadPreview = useCallback(async (lang: Language | null) => {
    if (!studentId) return;
    setPreview(undefined);
    setPreview(await fetchDigestPreview(studentId, lang));
  }, [studentId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      void loadPage();
      void loadPreview(language);
      // The language is changed by its own chips below; a focus reloads what is shown.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, loadPage, loadPreview]),
  );

  const header = <Stack.Screen options={{ title: t('parentDigest.title') }} />;
  if (overview === undefined || overview === null || overview === 'missing') {
    return (
      <Screen underHeader centred>
        {header}
        {overview === undefined ? <LoadingCards /> : null}
        {overview === 'missing' ? <Notice tone="info">{t('parentDigest.missing')}</Notice> : null}
        {overview === null ? (
          <>
            <Notice tone="error" title={t('parentDigest.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const guru = profile?.role === 'guru';
  const turnOn = !overview.enabled;
  async function flip() {
    if (!confirming) {
      // Switching on emails parents: asked once more, in place; the button ignores a double tap (#332).
      setConfirming(true);
      confirmShown();
      announce(t(turnOn ? 'parentDigest.confirmOn' : 'parentDigest.confirmOff'));
      return;
    }
    if (!confirmReady()) return;
    setConfirming(false);
    setSwitching(true);
    const result = await switchDigest(turnOn);
    setSwitching(false);
    if ('errorKey' in result) setSwitchError(result.errorKey);
    else {
      setSwitchError(null);
      setOverview(result.overview);
    }
  }

  const gets = overview.parents.gets_it ?? 0;
  const reasons = REASONS.filter((r) => (overview.parents[r] ?? 0) > 0);
  const weekTotal = Object.values(overview.weekRows).reduce((a, b) => a + b, 0);
  const lim = overview.limits;

  return (
    <Screen underHeader onRefresh={async () => { await load(); await loadPage(); await loadPreview(language); }}>
      {header}
      <ScreenIntro text={t('parentDigest.intro')} />

      <Section icon="guardian" title={t('parentDigest.switchTitle')} description={t('parentDigest.switchHint')}>
        <AppText variant="label" tone={overview.enabled ? 'success' : 'default'}>
          {overview.enabled ? t('parentDigest.isOn') : t('parentDigest.isOff')}
        </AppText>
        {guru ? (
          <Button
            variant={turnOn ? 'primary' : 'secondary'}
            icon={turnOn ? 'send' : 'pause'}
            loading={switching}
            label={confirming ? t(turnOn ? 'parentDigest.confirmOn' : 'parentDigest.confirmOff') : t(turnOn ? 'parentDigest.switchOn' : 'parentDigest.switchOff')}
            onPress={() => void flip()}
          />
        ) : (
          <AppText tone="muted">{t('parentDigest.guruSwitches')}</AppText>
        )}
        {switchError ? <Notice tone="error">{t(switchError)}</Notice> : null}
      </Section>

      {page && page !== 'missing' ? <ParentPageSection overview={page} guru={guru} onChange={setPage} /> : null}

      <Section icon="students" title={t('parentDigest.whoTitle')} description={t('parentDigest.whoHint')}>
        <AppText>{t('parentDigest.gets', { n: gets })}</AppText>
        {reasons.map((r) => (
          <AppText key={r} tone="muted">
            {t(`parentDigest.reasons.${r}`, { n: overview.parents[r] })}
          </AppText>
        ))}
      </Section>

      <Section icon="report" title={t('parentDigest.numbersTitle')}>
        <AppText>
          {t('parentDigest.weekRows', { from: formatDate(overview.lastWeek), total: weekTotal })}
          {Object.entries(overview.weekRows)
            .map(([outcome, n]) => ` · ${(OUTCOMES as readonly string[]).includes(outcome) ? t(`parentDigest.outcomes.${outcome as (typeof OUTCOMES)[number]}`) : outcome} ${n}`)
            .join('')}
        </AppText>
        <AppText>{t('parentDigest.today', { digests: overview.digestsToday, digestDay: lim.digest_day, all: overview.appMailsToday, appDay: lim.app_day })}</AppText>
        <AppText tone="muted">{t('parentDigest.rules', { from: lim.send_from, until: lim.send_until, perRun: lim.per_run, hours: lim.expire_hours })}</AppText>
        {overview.jobAt ? (
          <AppText tone="muted">
            {t('parentDigest.lastJob', {
              when: formatDateTime(overview.jobAt),
              result: (JOB_RESULTS as readonly (string | null)[]).includes(overview.jobResult)
                ? t(`parentDigest.jobResults.${overview.jobResult as (typeof JOB_RESULTS)[number]}`)
                : (overview.jobResult ?? ''),
            })}
          </AppText>
        ) : null}
      </Section>

      <Section icon="news" title={t('parentDigest.previewTitle')} description={studentId ? t('parentDigest.previewHint') : undefined}>
        {!studentId ? <AppText tone="muted">{t('parentDigest.previewFromProfile')}</AppText> : null}
        {studentId ? (
          <ChoiceGroup
            label={t('parentDigest.previewLanguage')}
            chips
            choices={[
              { value: 'parents', label: t('parentDigest.parentsLanguages') },
              ...LANGUAGES.map((l) => ({ value: l.code, label: l.nativeName, lang: l.code })),
            ]}
            value={language ?? 'parents'}
            onChange={(next) => {
              const lang = next === 'parents' ? null : (next as Language);
              setLanguage(lang);
              void loadPreview(lang);
            }}
          />
        ) : null}
        {studentId && preview === undefined ? <LoadingCards /> : null}
        {preview && 'errorKey' in preview ? <Notice tone="error">{t(preview.errorKey)}</Notice> : null}
        {preview && !('errorKey' in preview) ? (
          <>
            {preview.guardians.length === 0 ? <AppText tone="muted">{t('parentDigest.noGuardians')}</AppText> : null}
            {preview.guardians.map((g, i) => (
              <AppText key={g.guardianId} variant="small" tone={g.block === null ? 'success' : 'muted'}>
                {t('parentDigest.guardianLine', { number: i + 1 })}
                {g.block === null
                  ? t('parentDigest.guardianGets', { language: LANGUAGES.find((l) => l.code === g.language)?.nativeName ?? g.language })
                  : t(`parentDigest.blocks.${g.block}`)}
              </AppText>
            ))}
            {!preview.enabled ? <Notice tone="info">{t('parentDigest.previewWhileOff')}</Notice> : null}
            {Object.entries(preview.emails).map(([lang, email]) =>
              email ? (
                <Notice key={lang} tone="info" title={email.subject}>
                  <AppText lang={lang}>{email.text}</AppText>
                </Notice>
              ) : null,
            )}
          </>
        ) : null}
      </Section>
    </Screen>
  );
}

/**
 * The parent page (0063, docs/DECISIONS.md #640-#649): its own switch (the Guru; asked twice; off by default; off stops
 * every link at once and the next weekly emails carry none), how long a link works, and how often pages were opened.
 */
function ParentPageSection({ overview, guru, onChange }: { overview: ParentViewOverview; guru: boolean; onChange: (next: ParentViewOverview) => void }) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const turnOn = !overview.enabled;
  async function flip() {
    if (!confirming) {
      setConfirming(true);
      confirmShown();
      announce(t(turnOn ? 'parentView.staff.confirmOn' : 'parentView.staff.confirmOff'));
      return;
    }
    if (!confirmReady()) return;
    setConfirming(false);
    setSwitching(true);
    const result = await switchParentView(turnOn);
    setSwitching(false);
    if ('errorKey' in result) setError(result.errorKey);
    else {
      setError(null);
      onChange(result.overview);
    }
  }
  return (
    <Section icon="guardian" title={t('parentView.staff.title')} description={t('parentView.staff.hint', { days: overview.linkDays })}>
      <AppText variant="label" tone={overview.enabled ? 'success' : 'default'}>
        {overview.enabled ? t('parentView.staff.isOn') : t('parentView.staff.isOff')}
      </AppText>
      {guru ? (
        <Button
          variant={turnOn ? 'primary' : 'secondary'}
          icon={turnOn ? 'open' : 'pause'}
          loading={switching}
          label={confirming ? t(turnOn ? 'parentView.staff.confirmOn' : 'parentView.staff.confirmOff') : t(turnOn ? 'parentView.staff.switchOn' : 'parentView.staff.switchOff')}
          onPress={() => void flip()}
        />
      ) : (
        <AppText tone="muted">{t('parentDigest.guruSwitches')}</AppText>
      )}
      {error ? <Notice tone="error">{t(error)}</Notice> : null}
      <AppText>{t('parentView.staff.opened', { week: overview.opened7, month: overview.opened30, children: overview.children30 })}</AppText>
    </Section>
  );
}