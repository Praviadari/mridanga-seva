// Groups, for coordinators and the Guru (no screen number yet in docs/SCREENS.md): every group with
// its purpose and number of members, switched-off ones last, and a form to make a new group.
// Tapping a group opens it (./[id].tsx) to rename it, switch it off or on, and add or remove
// members. An announcement sent to "A group" (C15) goes to its members; groups replace the class
// WhatsApp groups. Data: src/data/groups.ts; the database checks names again (migration 0008).

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  checkGroupForm,
  createGroup,
  EMPTY_GROUP_FORM,
  fetchGroups,
  GROUP_NAME_MAX_LENGTH,
  GROUP_PURPOSE_MAX_LENGTH,
  type GroupForm,
  type GroupFormErrors,
  type GroupSummary,
} from '@/data/groups';

/** The list of groups and the "New group" form. */
export default function GroupsScreen() {
  const { t } = useTranslation();
  // undefined = loading, null = could not load.
  const [groups, setGroups] = useState<GroupSummary[] | null | undefined>(undefined);
  const [form, setForm] = useState<GroupForm>(EMPTY_GROUP_FORM);
  const [errors, setErrors] = useState<GroupFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setGroups(await fetchGroups());
  }, []);

  // Reload on coming back from a group, so member counts and names are current.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t('groups.title') }} />;

  const update = (change: Partial<GroupForm>) => {
    setForm((current) => ({ ...current, ...change }));
    setErrors({});
    setServerError(null);
  };

  async function create() {
    const found = checkGroupForm(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    const outcome = await createGroup(form);
    setSaving(false);
    if (outcome.errors) {
      setErrors(outcome.errors);
      return;
    }
    if (outcome.errorKey || outcome.id === undefined) {
      setServerError(t(outcome.errorKey ?? 'common.genericError'));
      return;
    }
    setForm(EMPTY_GROUP_FORM);
    // Straight to the new group, where its members are added.
    router.push({ pathname: '/staff/groups/[id]', params: { id: String(outcome.id), created: '1' } });
  }

  if (groups === null) {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="error" title={t('groups.loadFailed')}>
          {t('common.networkError')}
        </Notice>
        <Button label={t('common.tryAgain')} onPress={() => void load()} />
      </Screen>
    );
  }

  return (
    <Screen underHeader>
      {header}
      <AppText tone="muted">{t('groups.intro')}</AppText>
      {groups === undefined ? <LoadingCards /> : null}
      {groups && groups.length === 0 ? <EmptyState icon="groups" title={t('groups.empty')} /> : null}
      {groups?.map((g) => (
        <ListRow
          key={g.id}
          leading="groups"
          title={g.name}
          details={[
            ...(g.purpose ? [g.purpose] : []),
            t('groups.memberCount', { number: g.members }),
            ...(g.active ? [] : [t('groups.switchedOff')]),
          ]}
          onPress={() => router.push({ pathname: '/staff/groups/[id]', params: { id: String(g.id) } })}
        />
      ))}

      <Section title={t('groups.newTitle')}>
        <TextField
          label={t('groups.name')}
          hint={t('groups.nameHint', { max: GROUP_NAME_MAX_LENGTH })}
          value={form.name}
          onChangeText={(name) => update({ name })}
          error={errors.name ? t(errors.name) : undefined}
          maxLength={GROUP_NAME_MAX_LENGTH}
        />
        <TextField
          label={t('groups.purpose')}
          hint={t('groups.purposeHint', { max: GROUP_PURPOSE_MAX_LENGTH })}
          value={form.purpose}
          onChangeText={(purpose) => update({ purpose })}
          error={errors.purpose ? t(errors.purpose) : undefined}
          maxLength={GROUP_PURPOSE_MAX_LENGTH}
        />
        {serverError ? <Notice tone="error">{serverError}</Notice> : null}
        <Button label={t('groups.create')} loading={saving} onPress={() => void create()} />
      </Section>
    </Screen>
  );
}
