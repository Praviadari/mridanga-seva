// A module's landing screen ("/staff/modules/<key>", docs/DECISIONS.md #701-#704): what a circle on the facilitator's
// Home opens. The module's sections (the spec's submodules), each with rows that open screens that already existed,
// at their own addresses (lib/facilitator-modules.ts); Back returns here, and Back again to Home. A row that is a
// bottom tab goes back to the tabs and selects it (R4-01). Rows and modules a role may not use are left out; that
// is not the guard (each screen checks the role, row-level security refuses the data). An address with an unknown
// module says so; a module not built yet (Media) says Coming soon, with nothing to tap.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Columns } from '@/components/columns';
import { GuruOnly } from '@/components/guru-only';
import { ListRow } from '@/components/list-row';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { hasOwnRecord } from '@/data/my-student';
import { facilitatorModule, moduleAllowed, visibleSections, type ModuleRow } from '@/lib/facilitator-modules';
import { useWide } from '@/theme/use-theme';

/** Opens a row's screen on top of this one, or a tab's in the tabs. */
function openRow(row: ModuleRow) {
  if (row.tab) router.navigate(row.href);
  else router.push(row.href);
}

/** The landing screen of one Home module. */
export default function ModuleScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const wide = useWide();
  const { key } = useLocalSearchParams<{ key: string }>();
  const module = facilitatorModule(key);
  // Me (0053) shows only with an own student record; asked only where the module has such a row.
  const wantsOwn = module?.sections.some((s) => s.rows.some((r) => r.ownRecord)) ?? false;
  const [ownRecord, setOwnRecord] = useState(false);
  const myId = profile?.id ?? '';
  useEffect(() => {
    if (!wantsOwn || !myId) return;
    let live = true;
    void hasOwnRecord(myId).then((own) => {
      if (live) setOwnRecord(own);
    });
    return () => {
      live = false;
    };
  }, [wantsOwn, myId]);

  if (!module) {
    return (
      <Screen underHeader centred>
        <Stack.Screen options={{ title: t('facilitatorHome.title') }} />
        <Notice tone="info">{t('facilitatorHome.notFound')}</Notice>
      </Screen>
    );
  }
  const title = t(module.label);
  if (!moduleAllowed(module, profile?.role)) return <GuruOnly title={title} />;

  return (
    <Screen underHeader wide>
      <Stack.Screen options={{ title }} />
      {/* The way back up the tree on a laptop, where the header has no room to say it (spec B). */}
      {Platform.OS === 'web' && wide ? (
        <AppText variant="small" tone="muted">
          {t('facilitatorHome.crumb', { home: t('tabs.home'), module: title })}
        </AppText>
      ) : null}
      {module.soon ? (
        <Notice tone="info" title={t('comingSoon.title')}>
          {t('facilitatorHome.soonBody')}
        </Notice>
      ) : (
        visibleSections(module, profile?.role, ownRecord).map((section) => (
          <Section key={section.key} title={t(section.title)}>
            <Columns>
              {section.rows.map((row) => (
                <ListRow key={row.key} leading={row.icon} title={t(row.label)} onPress={() => openRow(row)} />
              ))}
            </Columns>
          </Section>
        ))
      )}
    </Screen>
  );
}
