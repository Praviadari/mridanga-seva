// A Copy button next to text people would otherwise retype (docs/DECISIONS.md #802): the sign-in code's setup key,
// the privacy contact, a crash's technical detail. expo-clipboard puts the text on the phone's clipboard (the 1.1.0 APK;
// in the browser, the page's clipboard), and the button says "Copied" for a moment, read out on TalkBack. Loaded on
// the first press, so the web's first download does not carry it (#797).

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { announce } from '@/lib/announce';

import { Button } from './button';

/** How long the button says "Copied", in ms. */
const COPIED_FOR_MS = 2500;

/** Props for CopyButton. */
export type CopyButtonProps = {
  /** The exact text to copy. */
  text: string;
  /** What is copied, for screen readers ("Copy the setup key"); default the button's label. */
  accessibilityLabel?: string;
};

/** A small "Copy" link-button that copies `text`. */
export function CopyButton({ text, accessibilityLabel }: CopyButtonProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_FOR_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      const Clipboard = await import('expo-clipboard');
      // The web answers whether the browser allowed it; a phone always copies.
      if (!(await Clipboard.setStringAsync(text))) return;
    } catch {
      return; // no clipboard (an old browser): the text stays selectable on the screen
    }
    setCopied(true);
    announce(t('common.copied'));
  }

  return (
    <Button
      variant="link"
      icon={copied ? 'check' : 'copy'}
      label={copied ? t('common.copied') : t('common.copy')}
      accessibilityLabel={copied ? undefined : accessibilityLabel}
      onPress={copy}
    />
  );
}
