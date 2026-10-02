// Coming soon: what a module of the home screen's ring that is not built yet opens (Instruments,
// Events; docs/DECISIONS.md #39). It says in one line what the module will do, so the ring is
// honest about it, and offers the way back. `module` in the address says which one. Nothing here
// reads or writes data.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { Chip } from '@/components/status-chip';
import { spacing } from '@/theme/use-theme';

/** The modules that have a Coming soon page, with their icon. */
const MODULES = {
  instruments: 'instruments',
  events: 'events',
} as const;

type ModuleKey = keyof typeof MODULES;

function isModule(value: string | undefined): value is ModuleKey {
  return value !== undefined && value in MODULES;
}

/** The Coming soon page of one module. */
export default function ComingSoonScreen() {
  const { t } = useTranslation();
  const { module } = useLocalSearchParams<{ module?: string }>();
  // An unknown or missing module (a typed address) gets the generic page.
  const key: ModuleKey | null = isModule(module) ? module : null;
  const title = key ? t(`modules.${key}`) : t('comingSoon.title');

  return (
    <Screen underHeader centred>
      <Stack.Screen options={{ title }} />
      <View style={styles.chip}>
        <Chip label={t('comingSoon.chip')} tone="warning" />
      </View>
      <EmptyState
        icon={key ? MODULES[key] : 'construction'}
        title={key ? t('comingSoon.title') : t('comingSoon.body')}
        body={key ? t(`comingSoon.${key}`) : undefined}
      />
      {key ? (
        <AppText tone="muted" style={styles.centre}>
          {t('comingSoon.body')}
        </AppText>
      ) : null}
      <Button variant="secondary" icon="home" label={t('comingSoon.back')} onPress={() => router.navigate('/staff')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
  },
  centre: {
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
});
