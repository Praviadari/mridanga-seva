// Who an event or a poll is for (C16, C17): the announcement audiences (all students, one level,
// my mentees, staff only, a group) as chips, with the level or group when needed. The screen
// leaves out the choices nobody could receive (no mentees, no groups). Data: migration 0022.

import { useTranslation } from 'react-i18next';

import type { Audience } from '@/data/announcements';
import { levelName } from '@/i18n/labels';

import { AppText } from './app-text';
import { ChoiceGroup } from './choice-group';
import type { IconName } from './icon';
import { Section } from './section';

const AUDIENCE_ICONS: Record<Audience, IconName> = {
  all: 'students',
  level: 'level',
  mentees: 'person',
  staff: 'guardian',
  group: 'groups',
};

/** Props for AudienceFields. */
export type AudienceFieldsProps = {
  audiences: readonly Audience[];
  audience: Audience | null;
  levelId: number | null;
  groupId: number | null;
  groups: { id: number; name: string }[];
  onChange: (change: { audience?: Audience; levelId?: number; groupId?: number }) => void;
  /** Label of "mentees" when not "My mentees", e.g. the Guru editing a coordinator's event. */
  menteesLabel?: string;
  /** Errors, already translated. */
  errors: { audience?: string; levelId?: string; groupId?: string };
  /** True once people answered or voted: the audience is shown but cannot change. */
  locked?: boolean;
};

/** The audience section of the event and poll forms. */
export function AudienceFields({
  audiences,
  audience,
  levelId,
  groupId,
  groups,
  onChange,
  menteesLabel,
  errors,
  locked,
}: AudienceFieldsProps) {
  const { t } = useTranslation();
  const label = (a: Audience) =>
    a === 'mentees' && menteesLabel ? menteesLabel : t(`announcements.compose.audienceChoices.${a}`);
  // A locked audience offers only the one chosen, so nothing can be changed by mistake.
  const shown = locked && audience ? [audience] : audiences;
  return (
    <Section icon="groups" title={t('events.form.audience')}>
      <ChoiceGroup
        chips
        choices={shown.map((a) => ({ value: a, label: label(a), icon: AUDIENCE_ICONS[a] }))}
        value={audience}
        onChange={(a) => onChange({ audience: a })}
        error={errors.audience}
      />
      {audience ? <AppText tone="muted">{t(`events.audienceHelp.${audience}`)}</AppText> : null}
      {locked ? <AppText tone="muted">{t('events.form.audienceLocked')}</AppText> : null}
      {audience === 'level' ? (
        <ChoiceGroup
          chips
          label={t('announcements.compose.level')}
          choices={(locked && levelId ? [levelId] : [1, 2, 3]).map((id) => ({ value: id, label: levelName(t, id), icon: 'level' as const }))}
          value={levelId}
          onChange={(id) => onChange({ levelId: id })}
          error={errors.levelId}
        />
      ) : null}
      {audience === 'group' ? (
        <ChoiceGroup
          chips
          label={t('announcements.compose.group')}
          choices={groups
            .filter((g) => !locked || g.id === groupId)
            .map((g) => ({ value: g.id, label: g.name, icon: 'groups' as const }))}
          value={groupId}
          onChange={(id) => onChange({ groupId: id })}
          error={errors.groupId}
        />
      ) : null}
    </Section>
  );
}
