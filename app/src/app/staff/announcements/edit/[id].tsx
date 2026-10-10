// C15 Edit an announcement, for its author and the Guru: the same fields as posting, filled in,
// photos and PDFs included (add or remove). "When should students see it?" is offered only while
// it is still scheduled: once published, its time stays. Read receipts are kept, and a published
// announcement shows "Edited" with the time (docs/DECISIONS.md #27, #32). Opened from the
// announcement (../[id].tsx); saving goes back there. When the server ends the login while editing, the changes are
// kept for the same login and filled in again next time (src/lib/form-drafts.ts, D6-20).
// Data: src/data/announcements.ts; the database checks everything again (migrations 0008, 0010).

import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AnnouncementFields } from '@/components/announcement-form';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { DraftNotice } from '@/components/draft-notice';
import { FormErrorSummary } from '@/components/form-error-summary';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { RouteIdGuard } from '@/components/route-id-guard';
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
import { discardDraft, peekDraft, useDraftKeeper } from '@/lib/form-drafts';

/** What the screen loaded: the announcement and what the form may offer. */
type Loaded = {
  announcement: Announcement;
  authorName: string | null;
  /** Groups to offer: the active ones, plus the announcement's own group if it is switched off. */
  groups: { id: number; name: string }[];
  hasMentees: boolean;
};

/**
 * What is kept of the edit when the server ends the login: the form without files picked on the phone (a
 * sign-out deletes them, src/lib/device-traces.ts) and the version it started from, so a save still
 * notices a change made by someone else meanwhile (D6-15).
 */
type EditDraft = { form: AnnouncementForm; base: Announcement; filesDropped: boolean };

/** The filled-in form and the Save button. */
function EditAnnouncementScreenContent() {
  const { t } = useTranslation();
  const { profile, session } = useAuth();
  const myId = profile?.id ?? '';
  const owner = session?.user.id;
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const draftKey = `announcement-edit:${id}`;
  // A draft kept for this login after a forced sign-out (D6-20): read once, then deleted from the device.
  const [restored] = useState(() => peekDraft<EditDraft>(draftKey, owner));
  const [showRestored, setShowRestored] = useState(restored !== null);
  // Used by the first load only; "use the saved version" and "load the latest" start from the database.
  const pendingDraft = useRef(restored);
  useEffect(() => {
    if (restored) discardDraft(draftKey);
  }, [restored, draftKey]);
  // undefined = loading, null = could not load, 'not_found' = deleted or never there.
  const [loaded, setLoaded] = useState<Loaded | 'not_found' | null | undefined>(undefined);
  const [form, setForm] = useState<AnnouncementForm | null>(null);
  const [errors, setErrors] = useState<AnnouncementFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The announcement as it was when the form was filled in: saving checks nobody changed it since (D6-15).
  const [base, setBase] = useState<Announcement | null>(null);
  // True after a save found it changed by someone else; offers to load the latest version.
  const [stale, setStale] = useState(false);

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
    const draft = pendingDraft.current;
    pendingDraft.current = null;
    setForm((current) => current ?? draft?.form ?? formFromAnnouncement(announcement));
    setBase((current) => current ?? draft?.base ?? announcement);
  }, [id, myId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Kept only when it differs from the version it started from.
  const changed = form !== null && base !== null && JSON.stringify(form) !== JSON.stringify(formFromAnnouncement(base));
  useDraftKeeper(
    draftKey,
    owner,
    changed && form && base
      ? ({ form: { ...form, files: form.files.filter((f) => !isPicked(f)) }, base, filesDropped: form.files.some(isPicked) } satisfies EditDraft)
      : null,
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
    const outcome = await updateAnnouncement(base ?? original, form, myId);
    setSaving(false);
    if (outcome.errorKey) {
      setServerError(t(outcome.errorKey));
      setStale(outcome.errorKey === 'announcements.errors.changedMeanwhile');
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
      {showRestored ? (
        <DraftNotice
          notes={restored?.filesDropped ? [t('drafts.filesAgain')] : []}
          discardLabel={t('drafts.useSaved')}
          onDiscard={() => {
            setShowRestored(false);
            setForm(null);
            setBase(null);
            setErrors({});
            setServerError(null);
            void load();
          }}
        />
      ) : null}
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
      {stale ? (
        <Button
          variant="secondary"
          icon="refresh"
          label={t('announcements.edit.loadLatest')}
          onPress={() => {
            // The latest version replaces what was typed here; the person then makes their change again.
            setForm(null);
            setBase(null);
            setStale(false);
            setServerError(null);
            void load();
          }}
        />
      ) : null}
      {saving && form.files.some(isPicked) ? <AppText tone="muted">{t('announcements.files.uploading')}</AppText> : null}
      <Button label={t('announcements.edit.save')} loading={saving} onPress={() => void save()} />
      <Button variant="link" label={t('announcements.edit.cancel')} onPress={backToAnnouncement} />
    </Screen>
  );
}

/** Checks the address's id before the screen loads anything (D6-07). */
export default function EditAnnouncementScreen() {
  return (
    <RouteIdGuard kind="number">
      <EditAnnouncementScreenContent />
    </RouteIdGuard>
  );
}
