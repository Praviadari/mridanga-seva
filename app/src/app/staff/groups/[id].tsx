// One group, for coordinators and the Guru: its name and purpose (can be changed), switch it off
// or on, its members with a Remove button each, and a search to add students who use the app,
// coordinators and the Guru. A group is switched off, never deleted, so old announcements keep
// their group (docs/DECISIONS.md #28). Opened from the groups list (./index.tsx).
// Data: src/data/groups.ts; the database checks names again (migration 0008).

import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { ParseKeys } from 'i18next';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  addMember,
  checkGroupForm,
  fetchGroup,
  GROUP_NAME_MAX_LENGTH,
  GROUP_PURPOSE_MAX_LENGTH,
  matchesPersonSearch,
  removeMember,
  saveGroupDetails,
  setGroupActive,
  type GroupDetail,
  type GroupForm,
  type GroupFormErrors,
  type GroupPerson,
} from '@/data/groups';

/** At most this many search results are listed, so a short search does not fill the screen. */
const MAX_RESULTS = 20;

/** The group's details, its members and the search to add people. */
export default function GroupScreen() {
  const { t } = useTranslation();
  const { id: idParam, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const id = Number(idParam);
  // undefined = loading, null = could not load, 'not_found' = not there.
  const [loaded, setLoaded] = useState<GroupDetail | 'not_found' | null | undefined>(undefined);
  // The name and purpose as typed; filled from the group once, so a reload keeps the typing.
  const [form, setForm] = useState<GroupForm | null>(null);
  const [errors, setErrors] = useState<GroupFormErrors>({});
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState('');
  // Profile id of the person being added or removed, or 'details' / 'active' while saving those.
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchGroup(id);
    setLoaded(result);
    if (result && result !== 'not_found') {
      setForm((current) => current ?? { name: result.group.name, purpose: result.group.purpose ?? '' });
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t('groups.detailTitle') }} />;

  if (loaded === undefined || loaded === null || loaded === 'not_found' || !form) {
    return (
      <Screen underHeader centred>
        {header}
        {loaded === undefined ? <LoadingCards /> : null}
        {loaded === 'not_found' ? (
          <>
            <Notice tone="error">{t('groups.notFound')}</Notice>
            <Button
              label={t('groups.back')}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/staff/groups'))}
            />
          </>
        ) : null}
        {loaded === null ? (
          <>
            <Notice tone="error" title={t('groups.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const { group, members, candidates } = loaded;
  const found = candidates.filter((p) => matchesPersonSearch(p, search));
  /** Roll number for a student, else the role; and a note when the login is switched off. */
  const personDetails = (p: GroupPerson) => [
    p.rollNo ?? (p.role === 'guru' || p.role === 'coordinator' ? t(`roles.${p.role}`) : t('groups.otherRole')),
    ...(p.active ? [] : [t('groups.accountOff')]),
  ];

  async function saveDetails() {
    if (!form) return;
    const problems = checkGroupForm(form);
    setErrors(problems);
    setSaved(false);
    if (Object.keys(problems).length > 0) return;
    setBusy('details');
    setActionError(null);
    const outcome = await saveGroupDetails(group.id, form);
    setBusy(null);
    if (outcome.errors) setErrors(outcome.errors);
    else if (outcome.errorKey) setActionError(t(outcome.errorKey));
    else {
      setSaved(true);
      await load();
    }
  }

  /** Runs one change to the group, then loads it again. `key` marks which button spins. */
  async function change(key: string, run: () => Promise<{ errorKey?: ParseKeys }>) {
    setBusy(key);
    setActionError(null);
    setSaved(false);
    const outcome = await run();
    if (outcome.errorKey) setActionError(t(outcome.errorKey));
    await load();
    setBusy(null);
  }

  return (
    <Screen underHeader>
      {header}
      {created === '1' ? <Notice tone="success">{t('groups.created')}</Notice> : null}

      <Section icon="groups" title={t('groups.detailsSection')}>
        <TextField
          label={t('groups.name')}
          hint={t('groups.nameHint', { max: GROUP_NAME_MAX_LENGTH })}
          value={form.name}
          onChangeText={(name) => {
            setForm({ ...form, name });
            setErrors({});
            setSaved(false);
          }}
          error={errors.name ? t(errors.name) : undefined}
          maxLength={GROUP_NAME_MAX_LENGTH}
        />
        <TextField
          label={t('groups.purpose')}
          hint={t('groups.purposeHint', { max: GROUP_PURPOSE_MAX_LENGTH })}
          value={form.purpose}
          onChangeText={(purpose) => {
            setForm({ ...form, purpose });
            setErrors({});
            setSaved(false);
          }}
          error={errors.purpose ? t(errors.purpose) : undefined}
          maxLength={GROUP_PURPOSE_MAX_LENGTH}
        />
        {saved ? <Notice tone="success">{t('groups.saved')}</Notice> : null}
        <Button
          variant="secondary"
          label={t('groups.save')}
          loading={busy === 'details'}
          onPress={() => void saveDetails()}
        />
      </Section>

      <Section icon="status" title={group.active ? t('groups.activeTitle') : t('groups.switchedOff')}>
        <AppText tone="muted">{group.active ? t('groups.activeHelp') : t('groups.offHelp')}</AppText>
        <Button
          variant="secondary"
          label={group.active ? t('groups.switchOff') : t('groups.switchOn')}
          loading={busy === 'active'}
          onPress={() => void change('active', () => setGroupActive(group.id, !group.active))}
        />
      </Section>

      {actionError ? <Notice tone="error">{actionError}</Notice> : null}

      <Section icon="students" title={t('groups.membersTitle', { number: members.length })}>
        {members.length === 0 ? <AppText tone="muted">{t('groups.noMembers')}</AppText> : null}
        {members.map((p) => (
          <ListRow
            key={p.profileId}
            title={p.fullName}
            details={personDetails(p)}
            action={{
              label: t('groups.remove'),
              variant: 'link',
              loading: busy === p.profileId,
              onPress: () => void change(p.profileId, () => removeMember(group.id, p.profileId)),
            }}
          />
        ))}
      </Section>

      <Section icon="add" title={t('groups.addTitle')} description={t('groups.addHelp')}>
        <TextField
          label={t('groups.search')}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {search.trim() && found.length === 0 ? <AppText tone="muted">{t('groups.noMatch')}</AppText> : null}
        {found.slice(0, MAX_RESULTS).map((p) => (
          <ListRow
            key={p.profileId}
            title={p.fullName}
            details={personDetails(p)}
            action={{
              label: t('groups.add'),
              variant: 'secondary',
              loading: busy === p.profileId,
              onPress: () => void change(p.profileId, () => addMember(group.id, p.profileId)),
            }}
          />
        ))}
        {found.length > MAX_RESULTS ? (
          <AppText tone="muted">{t('groups.moreResults', { number: found.length - MAX_RESULTS })}</AppText>
        ) : null}
      </Section>
    </Screen>
  );
}
