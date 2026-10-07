// C15 New announcement, for coordinators and the Guru: title, message, up to 3 photos or PDFs, who
// it is for (all students, one level, my mentees, staff only, a group), pin to the top, and
// publish now or at a later date and time (the class's time). Posting uploads the files, saves the
// announcement and opens it (./[id].tsx), where "seen by" fills up as people open it.
// The fields are shared with the edit screen (src/components/announcement-form.tsx).
// Data: src/data/announcements.ts; the database checks everything again (migrations 0007, 0008, 0010).

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AnnouncementFields } from '@/components/announcement-form';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { FormErrorSummary } from '@/components/form-error-summary';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { isPicked } from '@/data/announcement-files';
import {
  AUDIENCES,
  checkAnnouncementForm,
  EMPTY_ANNOUNCEMENT_FORM,
  fetchComposeOptions,
  postAnnouncement,
  type AnnouncementForm,
  type AnnouncementFormErrors,
  type ComposeOptions,
} from '@/data/announcements';

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

  // Reloads on coming back, e.g. after making the first group from the hint below.
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
        {options === undefined ? <LoadingCards /> : null}
        {options === null ? (
          <>
            <Notice tone="error" title={t('announcements.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
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
    const result = await postAnnouncement(form, myId);
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
      <AnnouncementFields
        form={form}
        errors={errors}
        onChange={update}
        audiences={audiences}
        groups={options.groups}
        showWhen
        onOpenGroups={() => router.push('/staff/groups')}
      />
      <FormErrorSummary errors={errors} />
      {serverError ? <Notice tone="error">{serverError}</Notice> : null}
      {saving && form.files.some(isPicked) ? <AppText tone="muted">{t('announcements.files.uploading')}</AppText> : null}
      <Button
        label={form.when === 'later' ? t('announcements.compose.submitLater') : t('announcements.compose.submit')}
        loading={saving}
        onPress={() => void post()}
      />
    </Screen>
  );
}
