// C16 New event / Edit event, for coordinators and the Guru: title, day and time (India), an end
// time on the same day, a centre and/or a place, who it is for, and a description. Saving tells
// everyone it is for (a new event; on an edit only a new time or place). Routes:
// staff/events/new.tsx and staff/events/edit/[id].tsx. Data: src/data/events.ts (migration 0022).

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AudienceFields } from '@/components/audience-fields';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { FormErrorSummary } from '@/components/form-error-summary';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import { AUDIENCES, fetchComposeOptions, type ComposeOptions } from '@/data/announcements';
import {
  checkEventForm,
  createEvent,
  EMPTY_EVENT_FORM,
  EVENT_DESCRIPTION_MAX,
  EVENT_PLACE_MAX,
  EVENT_TITLE_MAX,
  fetchActiveCentres,
  fetchEvent,
  formFromEvent,
  updateEvent,
  type ClassEvent,
  type EventForm,
  type EventFormErrors,
} from '@/data/events';

type Loaded = {
  options: ComposeOptions;
  centres: { id: number; name: string }[];
  /** The event being edited, with whether people answered (the audience is then fixed). */
  original: { event: ClassEvent; answered: boolean } | null;
};

/** The form. `eventId` = edit that event; none = a new one. */
export function EventFormScreen({ eventId }: { eventId?: number }) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  const [loaded, setLoaded] = useState<Loaded | 'not_found' | null | undefined>(undefined);
  const [form, setForm] = useState<EventForm>(EMPTY_EVENT_FORM);
  const [errors, setErrors] = useState<EventFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const filled = useRef(false);

  const load = useCallback(async () => {
    const [options, centres, existing] = await Promise.all([
      fetchComposeOptions(myId),
      fetchActiveCentres(),
      eventId !== undefined ? fetchEvent(eventId) : Promise.resolve(null),
    ]);
    if (!options || !centres || existing === null && eventId !== undefined) {
      setLoaded(null);
      return;
    }
    if (existing === 'not_found') {
      setLoaded('not_found');
      return;
    }
    const original = existing
      ? {
          event: existing.item.event,
          answered: existing.item.counts.going + existing.item.counts.maybe + existing.item.counts.notGoing > 0,
        }
      : null;
    // Fill the form once; coming back to the screen must not wipe what was typed.
    if (!filled.current) {
      filled.current = true;
      if (original) setForm(formFromEvent(original.event));
      else if (centres.length === 1) setForm((f) => ({ ...f, centreId: centres[0].id }));
    }
    setLoaded({ options, centres, original });
  }, [eventId, myId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const title = eventId !== undefined ? t('events.form.editTitle') : t('events.form.newTitle');
  const header = <Stack.Screen options={{ title }} />;

  if (loaded === undefined || loaded === null || loaded === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {loaded === undefined ? <LoadingCards /> : null}
        {loaded === 'not_found' ? <Notice tone="info">{t('events.notFound')}</Notice> : null}
        {loaded === null ? (
          <>
            <Notice tone="error" title={t('events.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const { options, centres, original } = loaded;
  const update = (change: Partial<EventForm>) => {
    setForm((current) => ({ ...current, ...change }));
    setServerError(null);
  };
  const authorIsMe = !original || original.event.createdBy === myId;
  const audiences = AUDIENCES.filter(
    (a) =>
      (a !== 'mentees' || (authorIsMe ? options.hasMentees : original?.event.audience === 'mentees')) &&
      (a !== 'group' || options.groups.length > 0),
  );

  async function save() {
    const found = checkEventForm(form, Date.now(), original?.event.startsAt);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    if (original) {
      const result = await updateEvent(original.event, form);
      setSaving(false);
      if (result.errorKey) {
        setServerError(t(result.errorKey));
        return;
      }
      router.back();
    } else {
      const result = await createEvent(form);
      setSaving(false);
      if (result.errorKey || result.id === undefined) {
        setServerError(t(result.errorKey ?? 'common.genericError'));
        return;
      }
      router.replace({ pathname: '/staff/events/[id]', params: { id: String(result.id) } });
    }
  }

  return (
    <Screen underHeader>
      {header}
      <TextField
        label={t('events.form.title')}
        hint={t('events.form.titleHint', { max: EVENT_TITLE_MAX })}
        value={form.title}
        onChangeText={(v) => update({ title: v })}
        error={errors.title ? t(errors.title) : undefined}
        maxLength={EVENT_TITLE_MAX}
      />
      <Section icon="time" title={t('events.form.when')}>
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
          label={t('events.form.time')}
          hint={t('announcements.compose.timeHint')}
          value={form.time}
          onChangeText={(v) => update({ time: v })}
          error={errors.time ? t(errors.time) : undefined}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
        />
        <TextField
          label={t('events.form.endTime')}
          hint={t('events.form.endTimeHint')}
          value={form.endTime}
          onChangeText={(v) => update({ endTime: v })}
          error={errors.endTime ? t(errors.endTime) : undefined}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
        />
      </Section>
      <Section icon="location" title={t('events.form.where')}>
        {centres.length > 0 ? (
          <ChoiceGroup
            chips
            label={t('events.form.centre')}
            choices={[
              ...centres.map((c) => ({ value: c.id, label: c.name, icon: 'location' as const })),
              { value: 0, label: t('events.form.noCentre'), icon: 'cancel' as const },
            ]}
            value={form.centreId ?? 0}
            onChange={(id) => update({ centreId: id === 0 ? null : id })}
          />
        ) : null}
        <TextField
          label={t('events.form.place')}
          hint={t('events.form.placeHint', { max: EVENT_PLACE_MAX })}
          value={form.place}
          onChangeText={(v) => update({ place: v })}
          error={errors.place ? t(errors.place) : undefined}
          maxLength={EVENT_PLACE_MAX}
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
        locked={original?.answered}
      />
      <TextField
        label={t('events.form.description')}
        hint={t('events.form.descriptionHint', { max: EVENT_DESCRIPTION_MAX })}
        value={form.description}
        onChangeText={(v) => update({ description: v })}
        error={errors.description ? t(errors.description) : undefined}
        maxLength={EVENT_DESCRIPTION_MAX}
        multiline
        numberOfLines={5}
        style={{ minHeight: 120, textAlignVertical: 'top' }}
      />
      {original ? <Notice tone="info">{t('events.form.editNotice')}</Notice> : <Notice tone="info">{t('events.form.newNotice')}</Notice>}
      <FormErrorSummary errors={errors} />
      {serverError ? <Notice tone="error">{serverError}</Notice> : null}
      <Button label={original ? t('events.form.save') : t('events.form.create')} loading={saving} onPress={() => void save()} />
    </Screen>
  );
}
