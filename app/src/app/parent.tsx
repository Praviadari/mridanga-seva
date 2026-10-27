// /parent: the parent page (migration 0063, docs/DECISIONS.md #640-#649). The weekly email to a parent who agreed to it
// links here with a token after '#' (/parent?lang=te#v=<token>), good for 14 days. Open to everyone, signed in or not
// (src/app/_layout.tsx): there is no parent login. The token goes to notify-parents in a POST body, which checks it and
// asks the database (parent_view): one child, only while that parent's yes, the data consent and the child's record
// allow it, and only while the Guru has the page on. Read-only: the one thing a parent can do here is stop the weekly
// email and the page (asked twice), as the email's Unsubscribe. Shows nothing the child does not see in the app, and
// never a location, a photo, a mark, a remark or anything about another child. Data: src/data/parent-view.ts.

import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { BrandHeader } from '@/components/brand';
import { Button } from '@/components/button';
import { LanguagePicker } from '@/components/language-picker';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { fetchParentView, stopParentView, viewTokenFrom, type ParentView, type ParentViewResult } from '@/data/parent-view';
import { showLanguage } from '@/i18n';
import { levelName } from '@/i18n/labels';
import { announce } from '@/lib/announce';
import { formatDate } from '@/lib/dates';
import { confirmReady, confirmShown } from '@/lib/second-tap';
import { spacing } from '@/theme/use-theme';

/** The token in this page's address, read once (web only: the link opens in a browser). */
function tokenOfAddress(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return viewTokenFrom(window.location.hash);
}

export default function ParentPageScreen() {
  const { t } = useTranslation();
  const { lang } = useLocalSearchParams<{ lang?: string }>();
  const [token] = useState(tokenOfAddress);
  // undefined = loading.
  const [result, setResult] = useState<ParentViewResult | undefined>(token ? undefined : { kind: 'bad_link' });
  const [confirming, setConfirming] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState(false);

  // The email's language (?lang=te or hi) for this visit only; the language picker still works.
  useEffect(() => {
    if (lang === 'en' || lang === 'te' || lang === 'hi') showLanguage(lang);
  }, [lang]);

  const load = useCallback(async () => {
    if (token) setResult(await fetchParentView(token));
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function stop() {
    if (!token) return;
    if (!confirming) {
      // Asked once more, in place; the button ignores a double tap (#332).
      setConfirming(true);
      confirmShown();
      announce(t('parentView.stopConfirm'));
      return;
    }
    if (!confirmReady()) return;
    setConfirming(false);
    setStopping(true);
    const stopped = await stopParentView(token);
    setStopping(false);
    if (stopped.kind === 'stopped') setResult(stopped);
    else setStopError(true);
  }

  const header = <BrandHeader compact />;
  if (result === undefined) {
    return (
      <Screen centred header={header}>
        <LoadingCards />
      </Screen>
    );
  }
  if (result.kind !== 'ok') {
    return (
      <Screen centred header={header}>
        <LanguagePicker />
        {result.kind === 'error' ? (
          <>
            <Notice tone="error" title={t('parentView.loadFailed')} announced>
              {t(result.errorKey)}
            </Notice>
            <Button
              icon="refresh"
              label={t('common.tryAgain')}
              onPress={() => {
                setResult(undefined);
                void load();
              }}
            />
          </>
        ) : (
          <Notice tone={result.kind === 'stopped' ? 'success' : 'info'} title={t(`parentView.states.${result.kind}.title`)} announced>
            {t(`parentView.states.${result.kind}.body`)}
          </Notice>
        )}
      </Screen>
    );
  }

  const v = result.view;
  return (
    <Screen header={header}>
      <LanguagePicker />
      <AppText variant="title">{t('parentView.heading', { name: v.studentName })}</AppText>
      <AppText tone="muted">{t('parentView.intro', { date: formatDate(v.today) })}</AppText>

      <LevelSection view={v} />
      <AttendanceSection view={v} />
      <PracticeSection view={v} />

      {v.events.length > 0 ? (
        <Section icon="events" title={t('parentView.eventsTitle')}>
          {v.events.map((e, i) => (
            <AppText key={`${e.on}-${i}`}>
              {`• ${t(e.centre ? 'parentView.eventAt' : 'parentView.event', { title: e.title, date: formatDate(e.on), time: e.at, centre: e.centre ?? '' })}`}
            </AppText>
          ))}
        </Section>
      ) : null}

      {v.announcements.length > 0 ? (
        <Section icon="news" title={t('parentView.newsTitle')} description={t('parentView.newsHint')}>
          {v.announcements.map((a, i) => (
            <View key={`${a.on}-${i}`} style={styles.item}>
              <AppText variant="label">{a.title}</AppText>
              <AppText variant="small" tone="muted">
                {formatDate(a.on)}
              </AppText>
              <AppText>{a.body}</AppText>
            </View>
          ))}
        </Section>
      ) : null}

      <Section icon="guardian" title={t('parentView.aboutTitle')}>
        <AppText>{t('parentView.about')}</AppText>
        <AppText>{t('parentView.private')}</AppText>
        {v.contact.trim() ? <AppText>{t('parentView.questions', { contact: v.contact.trim() })}</AppText> : null}
        <Button
          variant="secondary"
          icon="pause"
          loading={stopping}
          label={confirming ? t('parentView.stopConfirm') : t('parentView.stop')}
          onPress={() => void stop()}
        />
        <AppText variant="small" tone="muted">
          {t('parentView.stopHint')}
        </AppText>
        {stopError ? <Notice tone="error">{t('parentView.stopFailed')}</Notice> : null}
      </Section>
    </Screen>
  );
}

/** The level, the syllabus of that level (done of all, what comes next), items learnt lately and level changes. */
function LevelSection({ view: v }: { view: ParentView }) {
  const { t } = useTranslation();
  const level = v.level !== null ? levelName(t, v.level, v.levelName ?? undefined) : null;
  return (
    <Section icon="level" title={t('parentView.levelTitle')}>
      {level ? <AppText variant="label">{t(v.centre ? 'parentView.levelAt' : 'parentView.level', { level, centre: v.centre })}</AppText> : null}
      {v.syllabus.total > 0 ? (
        <AppText>{t('parentView.syllabus', { done: v.syllabus.done, total: v.syllabus.total })}</AppText>
      ) : (
        <AppText tone="muted">{t('parentView.noSyllabus')}</AppText>
      )}
      {v.syllabus.next.length > 0 ? <AppText>{t('parentView.next', { items: v.syllabus.next.join(', ') })}</AppText> : null}
      {v.levelChanges.map((c, i) => (
        <AppText key={`${c.on}-${i}`} tone="success">
          {t('parentView.levelChange', { level: levelName(t, c.to, c.to_name), date: formatDate(c.on) })}
        </AppText>
      ))}
      <AppText variant="label">{t('parentView.learntTitle')}</AppText>
      {v.learnt.length === 0 ? <AppText tone="muted">{t('parentView.noLearnt')}</AppText> : null}
      {v.learnt.map((item, i) => (
        <AppText key={`${item.on}-${i}`}>{`• ${t('parentView.learntLine', { title: item.title, date: formatDate(item.on) })}`}</AppText>
      ))}
    </Section>
  );
}

/** Visits per week for 8 weeks, and the last visits with their times. */
function AttendanceSection({ view: v }: { view: ParentView }) {
  const { t } = useTranslation();
  const total = v.attendance.weeks.reduce((sum, w) => sum + w.visits, 0);
  return (
    <Section icon="attendance" title={t('parentView.attendanceTitle')} description={t('parentView.attendanceHint')}>
      <AppText variant="label">{t('parentView.visitsTotal', { count: total })}</AppText>
      {[...v.attendance.weeks].reverse().map((w) => (
        <AppText key={w.week}>{`• ${t('parentView.weekVisits', { date: formatDate(w.week), count: w.visits })}`}</AppText>
      ))}
      {v.attendance.recent.length > 0 ? <AppText variant="label">{t('parentView.recentTitle')}</AppText> : null}
      {v.attendance.recent.map((visit, i) => (
        <AppText key={`${visit.on}-${i}`}>
          {`• ${t(visit.out ? 'parentView.visitLine' : 'parentView.visitOpen', { date: formatDate(visit.on), in: visit.in, out: visit.out ?? '' })}`}
        </AppText>
      ))}
    </Section>
  );
}

/** Practice per week against the goal, and the run of days. */
function PracticeSection({ view: v }: { view: ParentView }) {
  const { t } = useTranslation();
  const p = v.practice;
  return (
    <Section icon="practice" title={t('parentView.practiceTitle')}>
      <AppText>{t('parentView.goal', { days: p.goal_days, minutes: p.goal_minutes })}</AppText>
      <AppText variant="label" tone={p.streak > 0 ? 'success' : 'default'}>
        {p.streak > 0 ? t('parentView.streak', { count: p.streak }) : t('parentView.noStreak')}
      </AppText>
      {[...p.weeks].reverse().map((w) => (
        <AppText key={w.week}>
          {`• ${w.minutes > 0
            ? t('parentView.practiceWeek', { date: formatDate(w.week), minutes: w.minutes, days: w.days, met: w.days_met })
            : t('parentView.practiceNone', { date: formatDate(w.week) })}`}
        </AppText>
      ))}
      <AppText variant="small" tone="muted">
        {t('parentView.practiceHint')}
      </AppText>
    </Section>
  );
}

const styles = StyleSheet.create({
  item: { gap: spacing.xs },
});
