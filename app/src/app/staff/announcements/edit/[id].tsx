// C15 Edit an announcement, for its author and the Guru: the same fields as posting, filled in,
// photos and PDFs included (add or remove). "When should students see it?" is offered only while
// it is still scheduled: once published, its time stays. Read receipts are kept, and a published
// announcement shows "Edited" with the time (docs/DECISIONS.md #27, #32). Opened from the
// announcement (../[id].tsx); saving goes back there.
// Data: src/data/announcements.ts; the database checks everything again (migrations 0008, 0010).

import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
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
  fetchComposeOptions,
  fetchStaffAnnouncement,
  formFromAnnouncement,
  isScheduled,
  updateAnnouncement,
  type Announcement,
  type AnnouncementForm,
  type AnnouncementFormErrors,
} from '@/data/announcements';

/** What the screen loaded: the announcement and what the form may offer. */
type Loaded = {
  announcement: Announcement;
  authorName: string | null;
  /** Groups to offer: the active ones, plus the announcement's own group if it is switched off. */
  groups: { id: number; name: string }[];
  hasMentees: boolean;
};

/** The filled-in form and the Save button. */
export default function EditAnnouncementScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  // undefined = loading, null = could not load, 'not_found' = deleted or never there.
  const [loaded, setLoaded] = useState<Loaded | 'not_found' | null | undefined>(undefined);
  const [form, setForm] = useState<AnnouncementForm | null>(null);
  const [errors, setErrors] = useState<AnnouncementFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [detail, options] = await Promise.all([fetchStaffAnnouncement(id, myId), fetchComposeOptions(myId)]);
    if (detail === 'not_found') {
      setLoaded('not_found');
      return;
    }
    if (!detail || !options) {
      setLoaded(null);
      return;
    }
    const { announcement, groupName } = detail;
    const groups =
      announcement.audienceGroup !== null && !options.groups.some((g) => g.id === announcement.audienceGroup)
        ? [...options.groups, { id: announcement.audienceGroup, name: groupName ?? '' }]
        : options.groups;
    setLoaded({ announcement, authorName: detail.authorName, groups, hasMentees: options.hasMentees });
    // Filled in only the first time, so coming back to the screen never wipes what was typed.
    setForm((current) => current ?? formFromAnnouncement(announcement));
  }, [id, myId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t('announcements.edit.title') }} />;
  const backToAnnouncement = () =>
    router.canGoBack()
      ? router.back()
      : router.replace({ pathname: '/staff/announcements/[id]', params: { id: String(id) } });

  if (loaded === undefined || loaded === null || loaded === 'not_found' || !form) {
    return (
      <Screen underHeader centred>
        {header}
        {loaded === undefined ? <LoadingCards /> : null}
        {loaded === 'not_found' ? (
          <>
            <Notice tone="error">{t('announcements.detail.notFound')}</Notice>
            <Button label={t('announcements.detail.back')} onPress={() => router.replace('/staff/announcements')} />
          </>
        ) : null}
        {loaded === null ? (
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

  const { announcement: original, authorName } = loaded;
  const byMe = original.createdBy === myId;
  // The database decides in the end (row-level security); this only explains early.
  if (!byMe && profile?.role !== 'guru') {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="error">{t('announcements.errors.cannotChange')}</Notice>
        <Button label={t('announcements.edit.back')} onPress={backToAnnouncement} />
      </Screen>
    );
  }

  const scheduled = isScheduled(original);
  // "Mentees" always means the author's mentees. Offer it to an author who mentors someone, and
  // keep it when the announcement already has it; "A group" only when there is a group to choose.
  const audiences = AUDIENCES.filter(
    (audience) =>
      (audience !== 'mentees' || (byMe && loaded.hasMentees) || original.audience === 'mentees') &&
      (audience !== 'group' || loaded.groups.length > 0),
  );
  const menteesLabel =
    !byMe && authorName ? t('announcements.audience.menteesOf', { name: authorName }) : undefined;

  const update = (change: Partial<AnnouncementForm>) => {
    setForm((current) => (current ? { ...current, ...change } : current));
    setServerError(null);
  };

  async function save() {
    if (!form) return;
    const found = checkAnnouncementForm(form, Date.now(), isScheduled(original));
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    const outcome = await updateAnnouncement(original, form, myId);
    setSaving(false);
    if (outcome.errorKey) {
      setServerError(t(outcome.errorKey));
      return;
    }
    backToAnnouncement();
  }

  return (
    <Screen underHeader>
      {header}
      <AppText tone="muted">
        {scheduled ? t('announcements.edit.scheduledNote') : t('announcements.edit.publishedNote')}
      </AppText>
      <AnnouncementFields
        form={form}
        errors={errors}
        onChange={update}
        audiences={audiences}
        groups={loaded.groups}
        menteesLabel={menteesLabel}
        showWhen={scheduled}
      />
      <FormErrorSummary errors={errors} />
      {serverError ? <Notice tone="error">{serverError}</Notice> : null}
      {saving && form.files.some(isPicked) ? <AppText tone="muted">{t('announcements.files.uploading')}</AppText> : null}
      <Button label={t('announcements.edit.save')} loading={saving} onPress={() => void save()} />
      <Button variant="link" label={t('announcements.edit.cancel')} onPress={backToAnnouncement} />
    </Screen>
  );
}
