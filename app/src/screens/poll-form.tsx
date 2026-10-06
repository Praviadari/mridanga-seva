// C17 New poll / Edit poll, for coordinators and the Guru: the question, 2 to 6 answers (one choice
// each), who it is for, the closing day and time (India), anonymous or not, and when the people
// voting see the results (after they vote, or only after it closes). Saving a new poll tells
// everyone it is for. After the first vote only the question's wording and the closing time can
// change (the database refuses the rest; the form shows those fields fixed).
// Routes: staff/polls/new.tsx, staff/polls/edit/[id].tsx. Data: src/data/polls.ts (migration 0022).

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { AudienceFields } from '@/components/audience-fields';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ChoiceGroup } from '@/components/choice-group';
import { FormErrorSummary } from '@/components/form-error-summary';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import { AUDIENCES, fetchComposeOptions, type ComposeOptions } from '@/data/announcements';
import {
  checkPollForm,
  createPoll,
  EMPTY_POLL_FORM,
  fetchPoll,
  formFromPoll,
  OPTION_MAX,
  OPTIONS_MAX,
  OPTIONS_MIN,
  QUESTION_MAX,
  updatePoll,
  type Poll,
  type PollForm,
  type PollFormErrors,
  type ResultsWhen,
} from '@/data/polls';
import { formatDayMonthYear, todayInIndia } from '@/lib/dates';

type Loaded = { options: ComposeOptions; original: { poll: Poll; voted: boolean } | null };

/** A closing day `days` from today (India), written day-month-year. */
function inDays(days: number): string {
  const [y, m, d] = todayInIndia().split('-').map(Number);
  return formatDayMonthYear(new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10));
}

/** The form. `pollId` = edit that poll; none = a new one. */
export function PollFormScreen({ pollId }: { pollId?: number }) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  const [loaded, setLoaded] = useState<Loaded | 'not_found' | null | undefined>(undefined);
  const [form, setForm] = useState<PollForm>({ ...EMPTY_POLL_FORM, date: inDays(3) });
  const [errors, setErrors] = useState<PollFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const filled = useRef(false);

  const load = useCallback(async () => {
    const [options, existing] = await Promise.all([
      fetchComposeOptions(myId),
      pollId !== undefined ? fetchPoll(pollId) : Promise.resolve(null),
    ]);
    if (!options || (existing === null && pollId !== undefined)) {
      setLoaded(null);
      return;
    }
    if (existing === 'not_found') {
      setLoaded('not_found');
      return;
    }
    const original = existing ? { poll: existing.item.poll, voted: existing.item.state.voted > 0 } : null;
    if (!filled.current) {
      filled.current = true;
      if (original) setForm(formFromPoll(original.poll));
    }
    setLoaded({ options, original });
  }, [myId, pollId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: pollId !== undefined ? t('polls.form.editTitle') : t('polls.form.newTitle') }} />;

  if (loaded === undefined || loaded === null || loaded === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {loaded === undefined ? <LoadingCards /> : null}
        {loaded === 'not_found' ? <Notice tone="info">{t('polls.notFound')}</Notice> : null}
        {loaded === null ? (
          <>
            <Notice tone="error" title={t('polls.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const { options, original } = loaded;
  const locked = original?.voted ?? false;
  const update = (change: Partial<PollForm>) => {
    setForm((current) => ({ ...current, ...change }));
    setServerError(null);
  };
  const authorIsMe = !original || original.poll.createdBy === myId;
  const audiences = AUDIENCES.filter(
    (a) =>
      (a !== 'mentees' || (authorIsMe ? options.hasMentees : original?.poll.audience === 'mentees')) &&
      (a !== 'group' || options.groups.length > 0),
  );
  const setOption = (i: number, value: string) => update({ options: form.options.map((o, j) => (j === i ? value : o)) });

  async function save() {
    const found = checkPollForm(form, Date.now());
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    if (original) {
      const result = await updatePoll(original.poll, form);
      setSaving(false);
      if (result.errorKey) setServerError(t(result.errorKey));
      else router.back();
    } else {
      const result = await createPoll(form);
      setSaving(false);
      if (result.errorKey || result.id === undefined) setServerError(t(result.errorKey ?? 'common.genericError'));
      else router.replace({ pathname: '/staff/polls/[id]', params: { id: String(result.id) } });
    }
  }

  return (
    <Screen underHeader>
      {header}
      {locked ? <Notice tone="info">{t('polls.form.lockedNotice')}</Notice> : null}
      <TextField
        label={t('polls.form.question')}
        hint={t('polls.form.questionHint', { max: QUESTION_MAX })}
        value={form.question}
        onChangeText={(v) => update({ question: v })}
        error={errors.question ? t(errors.question) : undefined}
        maxLength={QUESTION_MAX}
        multiline
      />
      <Section icon="poll" title={t('polls.form.answers')} description={t('polls.form.answersHint', { min: OPTIONS_MIN, max: OPTIONS_MAX })}>
        {form.options.map((o, i) => (
          <TextField
            key={i}
            label={t('polls.form.answer', { n: i + 1 })}
            value={o}
            onChangeText={(v) => setOption(i, v)}
            maxLength={OPTION_MAX}
            editable={!locked}
          />
        ))}
        {errors.options ? <AppText tone="danger">{t(errors.options)}</AppText> : null}
        {!locked && form.options.length < OPTIONS_MAX ? (
          <Button variant="link" icon="add" label={t('polls.form.addAnswer')} onPress={() => update({ options: [...form.options, ''] })} />
        ) : null}
        {!locked && form.options.length > OPTIONS_MIN ? (
          <Button
            variant="link"
            icon="delete"
            label={t('polls.form.removeAnswer')}
            onPress={() => update({ options: form.options.slice(0, -1) })}
          />
        ) : null}
      </Section>
      <Section icon="time" title={t('polls.form.closes')}>
        <TextField
          label={t('events.form.date')}
          hint={t('announcements.compose.dateHint')}
          value={form.date}
          onChangeText={(v) => update({ date: v })}
          error={errors.date ? t(errors.date) : undefined}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
        <TextField
          label={t('polls.form.closesTime')}
          hint={t('announcements.compose.timeHint')}
          value={form.time}
          onChangeText={(v) => update({ time: v })}
          error={errors.time ? t(errors.time) : undefined}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
        />
      </Section>
      <AudienceFields
        audiences={audiences}
        audience={form.audience}
        levelId={form.levelId}
        groupId={form.groupId}
        groups={options.groups}
        onChange={(change) => update(change)}
        menteesLabel={!authorIsMe ? t('events.form.authorsMentees') : undefined}
        errors={{
          audience: errors.audience ? t(errors.audience) : undefined,
          levelId: errors.levelId ? t(errors.levelId) : undefined,
          groupId: errors.groupId ? t(errors.groupId) : undefined,
        }}
        locked={locked}
      />
      <Section icon="anonymous" title={t('polls.form.privacy')}>
        {locked ? (
          <AppText>{form.anonymous ? t('polls.form.anonymousOn') : t('polls.form.anonymousOff')}</AppText>
        ) : (
          <Checkbox label={t('polls.form.anonymous')} checked={form.anonymous} onChange={(anonymous) => update({ anonymous })} />
        )}
        <AppText tone="muted">{form.anonymous ? t('polls.form.anonymousHelp') : t('polls.form.namedHelp')}</AppText>
        <ChoiceGroup<ResultsWhen>
          label={t('polls.form.resultsWhen')}
          choices={(locked ? [form.resultsWhen] : (['after_vote', 'after_close'] as const)).map((v) => ({
            value: v,
            label: t(`polls.form.results.${v}`),
          }))}
          value={form.resultsWhen}
          onChange={(resultsWhen) => update({ resultsWhen })}
        />
      </Section>
      {!original ? <Notice tone="info">{t('polls.form.newNotice')}</Notice> : null}
      <FormErrorSummary errors={errors} />
      {serverError ? <Notice tone="error">{serverError}</Notice> : null}
      <Button label={original ? t('polls.form.save') : t('polls.form.create')} loading={saving} onPress={() => void save()} />
    </Screen>
  );
}
