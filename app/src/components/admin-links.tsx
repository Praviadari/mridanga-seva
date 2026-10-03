// "Running the class" on the Guru home (G1): the Guru's own screens G2 Coordinators, G3 Students
// (whole database and Excel import), G10 Settings and G11 Audit log, as a short list under the
// ring. Not on the ring: it holds nine circles, its limit (docs/DECISIONS.md #44), and these are
// laptop screens for one person, not daily modules (docs/DECISIONS.md #45).

import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Columns } from './columns';
import type { IconName } from './icon';
import { ListRow } from './list-row';
import { Section } from './section';

/** The Guru's admin screens. Show only to the Guru. */
export function AdminLinks() {
  const { t } = useTranslation();
  const links: { key: string; icon: IconName; title: string; detail: string; href: Href }[] = [
    { key: 'coordinators', icon: 'groups', title: t('coordinators.title'), detail: t('admin.coordinatorsLine'), href: '/staff/coordinators' },
    { key: 'database', icon: 'students', title: t('database.title'), detail: t('admin.databaseLine'), href: '/staff/database' },
    { key: 'settings', icon: 'filter', title: t('settings.title'), detail: t('admin.settingsLine'), href: '/staff/settings' },
    { key: 'audit', icon: 'syllabus', title: t('auditLog.title'), detail: t('admin.auditLine'), href: '/staff/audit-log' },
  ];
  return (
    <Section icon="profile" title={t('admin.title')}>
      <Columns>
        {links.map((link) => (
          <ListRow key={link.key} leading={link.icon} title={link.title} details={[link.detail]} onPress={() => router.push(link.href)} />
        ))}
      </Columns>
    </Section>
  );
}
