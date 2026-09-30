// C15 New announcement, for coordinators and the Guru: title, message, who it is for (all
// students, one level, my mentees, staff only, a group), pin to the top, and publish now or at a
// later date and time (India time). Posting opens the announcement (./[id].tsx), where "seen by"
// fills up as people open it. Images and files come later.
// Data: src/data/announcements.ts; the database checks everything again (migration 0007).

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ChoiceGroup } from '@/components/choice-group';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  AUDIENCES,
  BODY_MAX_LENGTH,
  checkAnnouncementForm,
  EMPTY_ANNOUNCEMENT_FORM,
  fetchComposeOptions,
  postAnnouncement,
  TITLE_MAX_LENGTH,
  type AnnouncementForm,
  type AnnouncementFormErrors,
  type ComposeOptions,
} from '@/data/announcements';
import { levelName } from '@/i18n/labels';

/** The compose form and the Post button. */
export default function NewAnnouncementScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  // undefined = loading, null = could not load.
  const [options, setOptions] = useState<ComposeOptions | null | undefined>(undefined);
  const [form, setForm] = useState<AnnouncementForm>(EMPTY_ANNOUNCEMENT_FORM);
  const [errors, setErrors] = useState<AnnouncementFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setOptions(await fetchComposeOptions(myId));
  }, [myId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t('announcements.compose.title') }} />;

  if (options === undefined || options === null) {
    return (
      <Screen underHeader centred>
        {header}
        {options === undefined ? <AppText tone="muted">{t('common.loading')}</AppText> : null}
        {options === null ? (
          <>
            <Notice tone="error" title={t('announcements.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const update = (change: Partial<AnnouncementForm>) => {
    setForm((current) => ({ ...current, ...change }));
    setServerError(null);
  };

  // "My mentees" only for someone who mentors students, "A group" only when groups exist, so
  // no choice leads to an announcement nobody can receive.
  const audiences = AUDIENCES.filter(
    (audience) => (audience !== 'mentees' || options.hasMentees) && (audience !== 'group' || options.groups.length > 0),
  );

  async function post() {
    const found = checkAnnouncementForm(form, Date.now());
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    const result = await postAnnouncement(form);
    setSaving(false);
    if (result.errorKey || result.id === undefined) {
      setServerError(t(result.errorKey ?? 'common.genericError'));
      return;
    }
    // Replace, so Back from the new announcement returns to the list, not to an empty form.
    router.replace({ pathname: '/staff/announcements/[id]', params: { id: String(result.id), posted: '1' } });
  }

  return (
    <Screen underHeader>
      {header}
      <TextField
        label={t('announcements.compose.titleLabel')}
        hint={t('announcements.compose.titleHint', { max: TITLE_MAX_LENGTH })}
        value={form.title}
        onChangeText={(title) => update({ title })}
        error={errors.title ? t(errors.title) : undefined}
        maxLength={TITLE_MAX_LENGTH}
      />
      <TextField
        label={t('announcements.compose.body')}
        hint={t('announcements.compose.bodyHint', { max: BODY_MAX_LENGTH })}
        value={form.body}
        onChangeText={(body) => update({ body })}
        error={errors.body ? t(errors.body) : undefined}
        maxLength={BODY_MAX_LENGTH}
        multiline
        numberOfLines={6}
        style={{ minHeight: 140, textAlignVertical: 'top' }}
      />

      <Section title={t('announcements.compose.audience')}>
        <ChoiceGroup
          choices={audiences.map((audience) => ({
            value: audience,
            label: t(`announcements.compose.audienceChoices.${audience}`),
          }))}
          value={form.audience}
          onChange={(audience) => update({ audience })}
          error={errors.audience ? t(errors.audience) : undefined}
        />
        {form.audience ? (
          <AppText tone="muted">{t(`announcements.compose.audienceHelp.${form.audience}`)}</AppText>
        ) : null}
        {form.audience === 'level' ? (
          <ChoiceGroup
            label={t('announcements.compose.level')}
            choices={[1, 2, 3].map((id) => ({ value: id, label: levelName(t, id) }))}
            value={form.levelId}
            onChange={(levelId) => update({ levelId })}
            error={errors.levelId ? t(errors.levelId) : undefined}
          />
        ) : null}
        {form.audience === 'group' ? (
          <ChoiceGroup
            label={t('announcements.compose.group')}
            choices={options.groups.map((g) => ({ value: g.id, label: g.name }))}
            value={form.groupId}
            onChange={(groupId) => update({ groupId })}
            error={errors.groupId ? t(errors.groupId) : undefined}
          />
        ) : null}
      </Section>

      <Section title={t('announcements.compose.when')}>
        <ChoiceGroup
          choices={[
            { value: 'now', label: t('announcements.compose.now') },
            { value: 'later', label: t('announcements.compose.later') },
          ]}
          value={form.when}
          onChange={(when) => update({ when })}
        />
        {form.when === 'later' ? (
          <>
            <AppText tone="muted">{t('announcements.compose.laterHelp')}</AppText>
            <TextField
              label={t('announcements.compose.date')}
              hint={t('announcements.compose.dateHint')}
              value={form.date}
              onChangeText={(date) => update({ date })}
              error={errors.date ? t(errors.date) : undefined}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
            <TextField
              label={t('announcements.compose.time')}
              hint={t('announcements.compose.timeHint')}
              value={form.time}
              onChangeText={(time) => update({ time })}
              error={errors.time ? t(errors.time) : undefined}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
          </>
        ) : null}
      </Section>

      <Checkbox label={t('announcements.compose.pin')} checked={form.pinned} onChange={(pinned) => update({ pinned })} />

      {serverError ? <Notice tone="error">{serverError}</Notice> : null}
      <Button
        label={form.when === 'later' ? t('announcements.compose.submitLater') : t('announcements.compose.submit')}
        loading={saving}
        onPress={() => void post()}
      />
    </Screen>
  );
}
