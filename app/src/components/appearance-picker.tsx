// Three buttons on My profile for light or dark screens: Same as phone, Light, Dark (docs/DECISIONS.md #361). The
// choice applies at once and is remembered on this phone; it is not saved to the profile, because another phone of the
// same person may want its own.

import { useTranslation } from 'react-i18next';

import { APPEARANCES, type AppearanceChoice } from '@/lib/appearance';
import { setAppearance, useAppearance } from '@/theme/appearance';

import { ChoiceGroup } from './choice-group';

/** Light / dark switch. */
export function AppearancePicker() {
  const { t } = useTranslation();
  const choice = useAppearance();
  // One joined row, so "Dark" no longer wraps alone at 375 px (#385).
  return (
    <ChoiceGroup<AppearanceChoice>
      segmented
      accessibilityLabel={t('myProfile.appearance')}
      choices={APPEARANCES.map((value) => ({ value, label: t(`myProfile.appearanceChoices.${value}`) }))}
      value={choice}
      onChange={setAppearance}
    />
  );
}
