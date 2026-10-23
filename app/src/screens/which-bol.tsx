// "Which bol?", an ear quiz (docs/DECISIONS.md #471; research idea 3): ear training was missing. The app sounds a bol
// (or a phrase of 2-4 bols) and the student picks it from three cards, each with the hands that play it (the drawings
// of #404); after the answer every card can be heard, to compare. The bols are those of the chosen level's taals
// (lib/ear-quiz.ts); the student's own level is chosen first. A gentle "in a row" count and the best of it on this
// phone; no time limit, no score for anyone else. Routes: student/which-bol.tsx, staff/which-bol.tsx.

import { Stack, useFocusEffect } from 'expo-router';
import type { TFunction } from 'i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { HandDrawing } from '@/components/hand-view';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { fetchMyPracticePlan, fetchTaals, type Taal } from '@/data/practice';
import { LEVEL_IDS, levelName } from '@/i18n/labels';
import {
  bolQuestion,
  isRight,
  phrasePattern,
  phraseQuestion,
  phraseText,
  quizBols,
  quizPhrases,
  type QuizBol,
  type QuizPhrase,
  type QuizQuestion,
} from '@/lib/ear-quiz';
import { applySoundChoice } from '@/lib/khol-samples';
import { quizBest, saveQuizBest } from '@/lib/play-bests';
import { createPracticePlayer } from '@/lib/practice-audio';
import { radius, spacing, useTheme } from '@/theme/use-theme';

/** How fast a phrase is played, beats (bols) a minute; a single bol slower, so both hands of dhā are heard. */
const PHRASE_BPM = 84;
const BOL_BPM = 60;

/** The quiz. */
export function WhichBol() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';
  const [player] = useState(createPracticePlayer);
  useEffect(() => () => player.dispose(), [player]);
  useEffect(() => {
    void applySoundChoice();
  }, []);

  const [taals, setTaals] = useState<Taal[] | undefined>(undefined);
  const [level, setLevel] = useState<number>(1);
  const [length, setLength] = useState(1);
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [inARow, setInARow] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [soundFailed, setSoundFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void fetchTaals().then((loaded) => setTaals(loaded.taals));
      return () => player.stop();
    }, [player]),
  );
  // A student starts at their own level.
  useEffect(() => {
    if (profile?.role !== 'student' || !profileId) return;
    void fetchMyPracticePlan(profileId).then((mine) => {
      if (mine && mine !== 'not_found') setLevel(mine.plan.levelId);
    });
  }, [profile?.role, profileId]);

  const pool = useMemo(() => (taals ? quizBols(taals, level) : []), [taals, level]);
  const phrases = useMemo(() => (taals && length > 1 ? quizPhrases(taals, level, length) : []), [taals, level, length]);
  const bestKey = `${level}:${length}`;
  // The best in a row kept on the phone for this level and length, in state (a plain read would be kept from the first
  // render by the React Compiler); read again when either changes.
  const bestOf = `${profileId}|${bestKey}`;
  const [bestState, setBestState] = useState(() => ({ of: bestOf, n: quizBest(profileId, bestKey) }));
  if (bestState.of !== bestOf) setBestState({ of: bestOf, n: quizBest(profileId, bestKey) });
  const best = bestState.n;

  const hear = async (phrase: QuizPhrase) => {
    const ok = await player.playOnce(phrasePattern(phrase), phrase.bols.length > 1 ? PHRASE_BPM : BOL_BPM);
    setSoundFailed(!ok);
  };

  const next = () => {
    const last = question?.answer.key ?? null;
    const q = length === 1 ? bolQuestion(pool, Math.random, last) : phraseQuestion(phrases, pool, length, Math.random, last);
    setQuestion(q);
    setPicked(null);
    setNewBest(false);
    if (q) void hear(q.answer);
  };

  const choose = (card: QuizPhrase) => {
    if (!question) return;
    if (picked !== null) {
      // After the answer a card is heard again, to compare.
      void hear(card);
      return;
    }
    setPicked(card.key);
    if (isRight(question, card)) {
      const n = inARow + 1;
      setInARow(n);
      const better = saveQuizBest(profileId, bestKey, n);
      setNewBest(better);
      if (better) setBestState({ of: bestOf, n });
    } else {
      setInARow(0);
    }
  };

  /** A new level or length: a new round. */
  const changeSetting = (apply: () => void) => {
    player.stop();
    apply();
    setQuestion(null);
    setPicked(null);
    setInARow(0);
    setNewBest(false);
  };

  const answered = question && picked !== null;
  const right = question && picked !== null && picked === question.answer.key;

  return (
    <Screen underHeader>
      <Stack.Screen options={{ title: t('whichBol.title') }} />
      <AppText tone="muted">{t('whichBol.intro')}</AppText>

      <ChoiceGroup<number>
        chips
        label={t('whichBol.level')}
        value={level}
        onChange={(v) => changeSetting(() => setLevel(v))}
        choices={LEVEL_IDS.map((id) => ({ value: id, label: levelName(t, id) }))}
      />
      <ChoiceGroup<number>
        segmented
        label={t('whichBol.length')}
        value={length}
        onChange={(v) => changeSetting(() => setLength(v))}
        choices={[1, 2, 3, 4].map((n) => ({ value: n, label: t('whichBol.bols', { count: n }) }))}
      />

      {soundFailed ? (
        <Notice tone="error" title={t('practice.soundFailedTitle')}>
          {t('practice.soundFailed')}
        </Notice>
      ) : null}

      <Section icon="listen" title={t('whichBol.listen')}>
        {taals === undefined ? <LoadingCards /> : null}
        {taals && pool.length < 3 ? <AppText tone="muted">{t('whichBol.tooFew')}</AppText> : null}
        {!question ? (
          <Button size="large" icon="play" label={t('whichBol.start')} disabled={!taals || pool.length < 3} onPress={next} />
        ) : (
          <>
            <Button size="large" icon="listen" label={t('whichBol.hearAgain')} onPress={() => void hear(question.answer)} />
            <AppText variant="label">{answered ? t('whichBol.compare') : t('whichBol.pick')}</AppText>
            <View style={styles.cards}>
              {question.cards.map((card) => {
                const isAnswer = card.key === question.answer.key;
                const state = !answered ? 'open' : isAnswer ? 'right' : card.key === picked ? 'wrong' : 'other';
                return <QuizCard key={card.key} phrase={card} state={state} onPress={() => choose(card)} />;
              })}
            </View>
            {answered ? (
              <Notice tone={right ? 'success' : 'info'} haptic={false}>
                {right
                  ? t('whichBol.right', { bol: phraseText(question.answer) })
                  : t('whichBol.wrong', { bol: phraseText(question.answer) })}
              </Notice>
            ) : null}
            {answered ? <Button size="large" icon="chevron" label={t('whichBol.next')} onPress={next} /> : null}
          </>
        )}
        <View style={[styles.row, { borderColor: colors.border }]} accessible accessibilityLiveRegion="polite">
          <AppText variant="label">{t('whichBol.inARow', { count: inARow })}</AppText>
          <AppText variant="small" tone="muted">
            {newBest ? t('whichBol.newBest') : best > 0 ? t('whichBol.best', { count: best }) : t('whichBol.noBest')}
          </AppText>
        </View>
      </Section>
    </Screen>
  );
}

type CardState = 'open' | 'right' | 'wrong' | 'other';

/** One card: the bols in large type and the hands that play them. */
function QuizCard({ phrase, state, onPress }: { phrase: QuizPhrase; state: CardState; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const single = phrase.bols.length === 1 ? phrase.bols[0] : null;
  const border = state === 'right' ? colors.success : state === 'wrong' ? colors.danger : colors.cardBorder;
  const said = phrase.bols.map((b) => `${b.text} (${handsWord(t, b)})`).join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        state === 'right' ? t('whichBol.cardRight', { bols: said }) : state === 'wrong' ? t('whichBol.cardWrong', { bols: said }) : said
      }
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? colors.surfaceSunken : colors.surface, borderColor: border, borderWidth: state === 'right' || state === 'wrong' ? 3 : 1 },
      ]}
    >
      <View style={styles.cardText}>
        <AppText variant="title" family="sans">
          {phraseText(phrase)}
        </AppText>
        {single ? null : (
          <AppText variant="small" tone="muted">
            {phrase.bols.map((b) => handsMark(t, b)).join(' · ')}
          </AppText>
        )}
        {state === 'right' ? <AppText variant="label" tone="success">{t('whichBol.thisOne')}</AppText> : null}
        {state === 'wrong' ? <AppText variant="label" tone="danger">{t('whichBol.yourPick')}</AppText> : null}
      </View>
      {single ? (
        <View style={styles.hands} aria-hidden>
          <View style={styles.hand}>
            <HandDrawing side="left" stroke={single.bol.strokes.find((s) => s.head === 'baya') ?? null} fresh />
          </View>
          <View style={styles.hand}>
            <HandDrawing side="right" stroke={single.bol.strokes.find((s) => s.head === 'dayan') ?? null} fresh />
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

function handsOf(bol: QuizBol): 'left' | 'right' | 'both' {
  const left = bol.bol.strokes.some((s) => s.head === 'baya');
  const right = bol.bol.strokes.some((s) => s.head === 'dayan');
  return left && right ? 'both' : left ? 'left' : 'right';
}

/** L, R or L+R, as under the beat grid. */
function handsMark(t: TFunction, bol: QuizBol): string {
  const hands = handsOf(bol);
  return t(hands === 'both' ? 'practice.handBothShort' : hands === 'left' ? 'practice.handLeftShort' : 'practice.handRightShort');
}

/** "left hand", "right hand" or "both hands", for screen readers. */
function handsWord(t: TFunction, bol: QuizBol): string {
  const hands = handsOf(bol);
  if (hands === 'both') return t('whichBol.bothHands');
  return t(hands === 'left' ? 'practice.handLeft' : 'practice.handRight');
}

const styles = StyleSheet.create({
  cards: {
    gap: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 88,
    padding: spacing.md,
    borderRadius: radius,
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  hands: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  hand: {
    width: 60,
    height: 60,
  },
  row: {
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    gap: 2,
  },
});
