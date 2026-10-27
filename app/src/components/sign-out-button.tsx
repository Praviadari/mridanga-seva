// The Sign out button of every screen that has one. Signing out waits for the server (the push
// token is deleted first), so the button shows a spinner until it is done and ignores a second
// tap; before, nothing seemed to happen and a shared phone could be handed on still signed in.
// Since #678 (Sarvesh Prji's student spec, section 11): while practice entries or check-ins of this login still wait on
// the phone for the signal (lib/offline-queue.ts), the first tap warns that signing out deletes them and offers to
// stay signed in, the first choice; "Sign out anyway" signs out.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { signOut } from '@/auth/auth-actions';
import { useAuth } from '@/auth/auth-provider';
import { useQueuedCount } from '@/lib/offline-queue';
import { spacing } from '@/theme/use-theme';

import { Button, type ButtonProps } from './button';
import { Notice } from './notice';

/** Props for SignOutButton: the look of the button; the label defaults to "Sign out". */
export type SignOutButtonProps = Pick<ButtonProps, 'variant' | 'icon'> & { label?: string };

/** The saves that are lost at sign-out (lib/device-traces.ts deletes the list). */
const WAITING_KINDS = ['practice', 'scan', 'mark'] as const;

/** Signs out on this device, with a spinner while it runs; warns first while saves wait on the phone. */
export function SignOutButton({ variant = 'secondary', icon, label }: SignOutButtonProps) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const waiting = useQueuedCount(profile?.id, WAITING_KINDS);
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState(false);
  const run = () => {
    if (busy) return;
    setBusy(true);
    void signOut().finally(() => setBusy(false));
  };

  if (warning && waiting > 0) {
    return (
      <View style={styles.warning}>
        <Notice tone="warning" title={t('signOutWarning.title')}>
          {t('signOutWarning.body', { count: waiting })}
        </Notice>
        <Button icon="check" label={t('signOutWarning.stay')} onPress={() => setWarning(false)} />
        <Button variant="secondary" icon={icon} label={t('signOutWarning.anyway')} loading={busy} onPress={run} />
      </View>
    );
  }
  return (
    <Button
      variant={variant}
      icon={icon}
      label={label ?? t('common.signOut')}
      loading={busy}
      onPress={() => (waiting > 0 ? setWarning(true) : run())}
    />
  );
}

const styles = StyleSheet.create({
  warning: {
    gap: spacing.sm,
  },
});
