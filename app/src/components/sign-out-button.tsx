// The Sign out button of every screen that has one. Signing out waits for the server (the push
// token is deleted first), so the button shows a spinner until it is done and ignores a second
// tap; before, nothing seemed to happen and a shared phone could be handed on still signed in.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { signOut } from '@/auth/auth-actions';

import { Button, type ButtonProps } from './button';

/** Props for SignOutButton: the look of the button; the label defaults to "Sign out". */
export type SignOutButtonProps = Pick<ButtonProps, 'variant' | 'icon'> & { label?: string };

/** Signs out on this device, with a spinner while it runs. */
export function SignOutButton({ variant = 'secondary', icon, label }: SignOutButtonProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      icon={icon}
      label={label ?? t('common.signOut')}
      loading={busy}
      onPress={() => {
        if (busy) return;
        setBusy(true);
        void signOut().finally(() => setBusy(false));
      }}
    />
  );
}
