// The Rhythm Playground section of the Student profile (docs/RHYTHM_PLAYGROUND.md §6.2, §12.1-§12.3; docs/DECISIONS.md
// #749): the label of each skill with its sample size and last day played ("Ready for Review" marked), the games
// assigned to the student, the facilitators' 0-3 ratings of performance skills, and — not on a facilitator's own
// record (0053) — "Rate a skill" (play_ratings: the rating, a short note) and "Assign a game". Recognition and
// performance are never added together; only a rating says a performance skill is shown.

import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import { fetchStudentPlayground, loadPlaygroundPack, type StaffStudentPlay } from '@/data/playground';
import { rateSkill } from '@/data/playground-admin';
import { formatDate } from '@/lib/dates';
import { DEFAULT_LABEL_RULES, skillProgress } from '@/lib/playground/labels';
import { SKILL_IDS, SKILL_KIND, type SkillId, type SkillProgress } from '@/lib/playground/types';

import { ratedSkills, topSteps } from './content-rules';
import { gameName, skillName } from './parts';

const RATINGS = [0, 1, 2, 3] as const;
const RATED = ratedSkills(SKILL_IDS, SKILL_KIND);

type Loaded = { data: StaffStudentPlay; skills: SkillProgress[] };

/** The section; `ownRecord`: the signed-in facilitator's own student record (no rating, no assigning). */
export function PlaygroundPanel({ studentId, studentName, ownRecord }: { studentId: string; studentName: string; ownRecord: boolean }) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);
  const [rating, setRating] = useState(false);
  const [version, setVersion] = useState(0);

  const read = useCallback(async (): Promise<Loaded | null> => {
    const [student, packLoad] = await Promise.all([fetchStudentPlayground(studentId), loadPlaygroundPack()]);
    if (!student.data) return null;
    const pack = packLoad.pack;
    const skills = skillProgress(student.data.rounds, pack?.labels ?? DEFAULT_LABEL_RULES, topSteps(pack?.templates ?? [], student.data.levelId), Date.now());
    return { data: student.data, skills };
  }, [studentId]);

  useEffect(() => {
    let live = true;
    void read().then((result) => {
      if (live) setLoaded(result);
    });
    return () => {
      live = false;
    };
  }, [read, version]);

  return (
    <Section icon="listen" title={t('staffPlayground.student.title')} description={t('staffPlayground.student.intro')}>
      {loaded === undefined ? <LoadingCards /> : null}
      {loaded === null ? <AppText tone="muted">{t('staffPlayground.student.notLoaded')}</AppText> : null}
      {loaded ? (
        <>
          {loaded.skills.length === 0 ? <AppText tone="muted">{t('staffPlayground.student.noRounds')}</AppText> : null}
          {loaded.skills.map((s) => (
            <AppText key={s.skill}>
              {[
                `${skillName(t, s.skill)}: ${t(`playground.label.${s.label}`)}`,
                s.correct !== null ? t('playground.progress.correct', { correct: s.correct, total: s.opportunities }) : t('playground.progress.rounds', { count: s.opportunities }),
                s.lastPractised ? t('playground.progress.last', { date: formatDate(s.lastPractised.slice(0, 10)) }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </AppText>
          ))}
          {loaded.skills.some((s) => s.label === 'ready_for_review') ? <Notice tone="info">{t('staffPlayground.student.readyHint')}</Notice> : null}
          {loaded.data.assignments.length > 0 ? (
            <AppText tone="muted">
              {t('staffPlayground.student.assigned', { games: loaded.data.assignments.map((a) => gameName(t, a.game)).join(', ') })}
            </AppText>
          ) : null}
          <AppText variant="label">{t('staffPlayground.student.ratings')}</AppText>
          {loaded.data.ratings.length === 0 ? <AppText tone="muted">{t('staffPlayground.student.noRatings')}</AppText> : null}
          {loaded.data.ratings.map((r) => (
            <AppText key={r.id}>
              {[
                `${skillName(t, r.skill)}: ${t('staffPlayground.student.ratingIs', { n: r.rating })} (${t(`staffPlayground.student.rubric_${r.rating as 0 | 1 | 2 | 3}`)})`,
                r.note,
                [r.ratedByName, formatDate(r.ratedAt.slice(0, 10))].filter(Boolean).join(', '),
              ]
                .filter(Boolean)
                .join(' · ')}
            </AppText>
          ))}
          {ownRecord ? (
            <AppText variant="small" tone="muted">
              {t('staffPlayground.student.ownRecord')}
            </AppText>
          ) : (
            <>
              {rating ? (
                <RateForm studentId={studentId} onDone={() => {
                    setRating(false);
                    setVersion((v) => v + 1);
                  }} />
              ) : (
                <Button variant="secondary" icon="score" label={t('staffPlayground.student.rate')} onPress={() => setRating(true)} />
              )}
              <Button
                variant="secondary"
                icon="todo"
                label={t('staffPlayground.student.assign')}
                onPress={() => router.push({ pathname: '/staff/playground/assignments', params: { student: studentId, name: studentName } })}
              />
            </>
          )}
        </>
      ) : null}
    </Section>
  );
}

function RateForm({ studentId, onDone }: { studentId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [skill, setSkill] = useState<SkillId>(RATED[0]);
  const [value, setValue] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (value === null) {
      setError(t('staffPlayground.student.chooseRating'));
      return;
    }
    setBusy(true);
    setError(null);
    const errorKey = await rateSkill(studentId, skill, value, note);
    setBusy(false);
    if (errorKey) setError(t(errorKey));
    else onDone();
  };

  return (
    <>
      <ChoiceGroup<SkillId> chips label={t('staffPlayground.skill')} value={skill} onChange={setSkill} choices={RATED.map((s) => ({ value: s, label: skillName(t, s) }))} />
      <ChoiceGroup<number>
        label={t('staffPlayground.student.rating')}
        value={value}
        onChange={setValue}
        choices={RATINGS.map((n) => ({ value: n, label: `${n} · ${t(`staffPlayground.student.rubric_${n}`)}` }))}
      />
      <TextField label={t('staffPlayground.student.note')} value={note} onChangeText={setNote} maxLength={300} multiline />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button icon="check" label={t('staffPlayground.student.saveRating')} loading={busy} onPress={() => void save()} />
    </>
  );
}
