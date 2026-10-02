// The fields of an announcement, shared by the compose screen (C15 new) and the edit screen
// (C15 edit): title, message, photos and PDFs, who it is for (with the level or group), when
// students see it, and pin to the top. The screen keeps the form values and the submit button;
// this only draws the fields and reports changes. Data and checks: src/data/announcements.ts.

import { useTranslation } from 'react-i18next';

import {
  BODY_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  type Audience,
  type AnnouncementForm,
  type AnnouncementFormErrors,
} from '@/data/announcements';
import { levelName } from '@/i18n/labels';

import { AppText } from './app-text';
import { AttachmentPicker } from './attachment-picker';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { ChoiceGroup } from './choice-group';
import type { IconName } from './icon';
import { Section } from './section';
import { TextField } from './text-field';

/** The icon on each audience chip. */
const AUDIENCE_ICONS: Record<Audience, IconName> = {
  all: 'students',
  level: 'level',
  mentees: 'person',
  staff: 'guardian',
  group: 'groups',
};

/** Props for AnnouncementFields. */
export type AnnouncementFieldsProps = {
  form: AnnouncementForm;
  /** Problems found by checkAnnouncementForm, shown under their fields. */
  errors: AnnouncementFormErrors;
  /** Called with the fields that changed. */
  onChange: (change: Partial<AnnouncementForm>) => void;
  /** The audiences to offer, in order. The screen leaves out those nobody could receive. */
  audiences: readonly Audience[];
  /** The groups to offer for audience "A group", by name. */
  groups: { id: number; name: string }[];
  /**
   * Label of the "mentees" choice when it is not "My mentees", e.g. "Mentees of Radha" when the
   * Guru edits a coordinator's announcement.
   */
  menteesLabel?: string;
  /** Shows "When should students see it?". False when editing a published announcement. */
  showWhen: boolean;
  /** When given and there are no groups yet, a hint with a link to make one is shown. */
  onOpenGroups?: () => void;
};

/** The announcement fields in the app's style. */
export function AnnouncementFields({
  form,
  errors,
  onChange,
  audiences,
  groups,
  menteesLabel,
  showWhen,
  onOpenGroups,
}: AnnouncementFieldsProps) {
  const { t } = useTranslation();
  const audienceLabel = (audience: Audience) =>
    audience === 'mentees' && menteesLabel ? menteesLabel : t(`announcements.compose.audienceChoices.${audience}`);

  return (
    <>
      <TextField
        label={t('announcements.compose.titleLabel')}
        hint={t('announcements.compose.titleHint', { max: TITLE_MAX_LENGTH })}
        value={form.title}
        onChangeText={(title) => onChange({ title })}
        error={errors.title ? t(errors.title) : undefined}
        maxLength={TITLE_MAX_LENGTH}
      />
      <TextField
        label={t('announcements.compose.body')}
        hint={t('announcements.compose.bodyHint', { max: BODY_MAX_LENGTH })}
        value={form.body}
        onChangeText={(body) => onChange({ body })}
        error={errors.body ? t(errors.body) : undefined}
        maxLength={BODY_MAX_LENGTH}
        multiline
        numberOfLines={6}
        style={{ minHeight: 140, textAlignVertical: 'top' }}
      />

      <AttachmentPicker
        files={form.files}
        onChange={(files) => onChange({ files })}
        error={errors.files ? t(errors.files) : undefined}
      />

      <Section icon="groups" title={t('announcements.compose.audience')}>
        <ChoiceGroup
          chips
          choices={audiences.map((audience) => ({
            value: audience,
            label: audienceLabel(audience),
            icon: AUDIENCE_ICONS[audience],
          }))}
          value={form.audience}
          onChange={(audience) => onChange({ audience })}
          error={errors.audience ? t(errors.audience) : undefined}
        />
        {form.audience ? (
          <AppText tone="muted">{t(`announcements.compose.audienceHelp.${form.audience}`)}</AppText>
        ) : null}
        {form.audience === 'level' ? (
          <ChoiceGroup
            chips
            label={t('announcements.compose.level')}
            choices={[1, 2, 3].map((id) => ({ value: id, label: levelName(t, id), icon: 'level' as const }))}
            value={form.levelId}
            onChange={(levelId) => onChange({ levelId })}
            error={errors.levelId ? t(errors.levelId) : undefined}
          />
        ) : null}
        {form.audience === 'group' ? (
          <ChoiceGroup
            chips
            label={t('announcements.compose.group')}
            choices={groups.map((g) => ({ value: g.id, label: g.name, icon: 'groups' as const }))}
            value={form.groupId}
            onChange={(groupId) => onChange({ groupId })}
            error={errors.groupId ? t(errors.groupId) : undefined}
          />
        ) : null}
        {onOpenGroups && groups.length === 0 ? (
          <>
            <AppText tone="muted">{t('announcements.compose.noGroups')}</AppText>
            <Button variant="link" label={t('announcements.compose.openGroups')} onPress={onOpenGroups} />
          </>
        ) : null}
      </Section>

      {showWhen ? (
        <Section icon="time" title={t('announcements.compose.when')}>
          <ChoiceGroup
            choices={[
              { value: 'now', label: t('announcements.compose.now') },
              { value: 'later', label: t('announcements.compose.later') },
            ]}
            value={form.when}
            onChange={(when) => onChange({ when })}
          />
          {form.when === 'later' ? (
            <>
              <AppText tone="muted">{t('announcements.compose.laterHelp')}</AppText>
              <TextField
                label={t('announcements.compose.date')}
                hint={t('announcements.compose.dateHint')}
                value={form.date}
                onChangeText={(date) => onChange({ date })}
                error={errors.date ? t(errors.date) : undefined}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
              <TextField
                label={t('announcements.compose.time')}
                hint={t('announcements.compose.timeHint')}
                value={form.time}
                onChangeText={(time) => onChange({ time })}
                error={errors.time ? t(errors.time) : undefined}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </>
          ) : null}
        </Section>
      ) : null}

      <Checkbox label={t('announcements.compose.pin')} checked={form.pinned} onChange={(pinned) => onChange({ pinned })} />
    </>
  );
}
