// Two buttons on My profile, Android app only: the notifications' sound, Khol or Kartal (docs/DECISIONS.md #803). Kept
// on this phone (lib/notify-sound.ts). A practice reminder that is on is scheduled again at once on the chosen sound's
// channel; the kartal's announcement channel is made at once too (lib/push.ts), for when the server sends with it.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { NOTIFY_SOUNDS, readNotifySound, saveNotifySound, type NotifySound } from '@/lib/notify-sound';
import { readReminder, setReminder } from '@/lib/practice-reminder';
import { registerForPush } from '@/lib/push';

import { ChoiceGroup } from './choice-group';

/** Khol / Kartal switch. */
export function NotifySoundPicker() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [sound, setSound] = useState<NotifySound>(readNotifySound);

  function choose(next: NotifySound) {
    setSound(next);
    saveNotifySound(next);
    void registerForPush({ ask: false });
    const reminder = profile ? readReminder(profile.id) : null;
    if (profile && reminder) void setReminder(profile.id, reminder);
  }

  return (
    <ChoiceGroup<NotifySound>
      segmented
      accessibilityLabel={t('myProfile.notifySound')}
      choices={NOTIFY_SOUNDS.map((value) => ({ value, label: t(`myProfile.notifySoundChoices.${value}`) }))}
      value={sound}
      onChange={choose}
    />
  );
}
