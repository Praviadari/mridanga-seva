// C18 Suggest material (Phase 2 slice 8, docs/DECISIONS.md #65). A coordinator: "Suggest a
// material" (the G5 form in suggestion mode) and their own suggestions with where each stands,
// the facilitator's reason when declined, and Take back / Remove. The Guru: the suggestions
// waiting, oldest first (Review opens the form with Add to lessons and Decline), then those
// decided in the last 30 days. Notices about suggestions open this screen.
// Data: data/suggestions.ts; migration 0023_team_tools.sql.

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { LoadingCards } from '@/components/loading-cards';
import { MaterialRow } from '@/components/material-row';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { Chip } from '@/components/status-chip';
import { fetchSuggestions, removeSuggestion, type Suggestion } from '@/data/suggestions';
import { levelName } from '@/i18n/labels';
import { formatDateTime } from '@/lib/dates';
import { spacing } from '@/theme/use-theme';

/** The suggestions screen. */
export default function SuggestionsScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const isGuru = profile?.role === 'guru';
  const myId = profile?.id ?? '';
  const [list, setList] = useState<Suggestion[] | null | undefined>(undefined);
  const [asking, setAsking] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setList(await fetchSuggestions(myId, isGuru));
  }, [myId, isGuru]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function remove(suggestion: Suggestion) {
    setBusy(true);
    setMessage(null);
    const outcome = await removeSuggestion(suggestion.material);
    setBusy(false);
    setAsking(null);
    if (outcome.errorKey) setMessage(t(outcome.errorKey));
    await load();
  }

  const waiting = list?.filter((s) => s.state === 'waiting') ?? [];
  const decided = list?.filter((s) => s.state !== 'waiting') ?? [];

  function card(s: Suggestion) {
    const where = s.material.levelId ? levelName(t, s.material.levelId) : t('suggestions.allLevels');
    return (
      <View key={s.material.id} style={styles.card}>
        <View style={styles.chips}>
          <Chip
            label={t(`suggestions.states.${s.state}`)}
            tone={s.state === 'added' ? 'success' : s.state === 'declined' ? 'danger' : 'warning'}
          />
          <AppText variant="small" tone="muted">
            {[isGuru ? s.suggestedBy : null, where, formatDateTime(s.createdAt)].filter(Boolean).join(' · ')}
          </AppText>
        </View>
        {/* The chip above says where it stands, so the row does not add "waiting" of its own. */}
        <MaterialRow material={{ ...s.material, approved: true }} />
        {s.reason ? <AppText variant="small">{t('suggestions.reasonLine', { reason: s.reason })}</AppText> : null}
        {s.state === 'declined' && s.declinedReason ? (
          <AppText variant="small" tone="danger">
            {t('suggestions.declinedLine', { reason: s.declinedReason })}
          </AppText>
        ) : null}
        {isGuru && s.state === 'waiting' ? (
          <Button
            icon="check"
            label={t('suggestions.review')}
            onPress={() => router.push({ pathname: '/staff/materials/[id]', params: { id: String(s.material.id) } })}
          />
        ) : null}
        {!isGuru && s.state !== 'added' && s.suggestedById === myId ? (
          asking === s.material.id ? (
            <View style={styles.row}>
              <Button
                icon="delete"
                label={s.state === 'waiting' ? t('suggestions.takeBackYes') : t('suggestions.removeYes')}
                loading={busy}
                disabled={busy}
                onPress={() => void remove(s)}
              />
              <Button variant="link" label={t('syllabusEditor.cancel')} onPress={() => setAsking(null)} />
            </View>
          ) : (
            <Button
              variant="link"
              icon="delete"
              label={s.state === 'waiting' ? t('suggestions.takeBack') : t('suggestions.remove')}
              onPress={() => setAsking(s.material.id)}
            />
          )
        ) : null}
      </View>
    );
  }

  return (
    <Screen underHeader onRefresh={load}>
      <Stack.Screen options={{ title: t('suggestions.title') }} />
      <Notice tone="info">{isGuru ? t('suggestions.introGuru') : t('suggestions.introCoordinator')}</Notice>
      {!isGuru ? (
        <Button icon="add" label={t('suggestions.suggest')} onPress={() => router.push({ pathname: '/staff/materials/[id]', params: { id: 'new' } })} />
      ) : null}
      {message ? <Notice tone="error">{message}</Notice> : null}
      {list === undefined ? <LoadingCards /> : null}
      {list === null ? (
        <>
          <Notice tone="error" title={t('suggestions.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}
      {list ? (
        <>
          <Section icon="library" title={t('suggestions.waitingTitle', { count: waiting.length })}>
            {waiting.length === 0 ? <EmptyState icon="library" title={t('suggestions.noneWaiting')} /> : waiting.map(card)}
          </Section>
          {decided.length > 0 ? (
            <Section icon="check" title={t('suggestions.decidedTitle')} description={isGuru ? t('suggestions.decidedHintGuru') : undefined}>
              {decided.map(card)}
            </Section>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
});
