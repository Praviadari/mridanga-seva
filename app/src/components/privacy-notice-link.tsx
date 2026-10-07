// A link to the privacy notice on the public website, in the reader's language (sign-up A1 and the
// registration screen C2). The address comes from one constant (src/lib/privacy-notice.ts).

import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { privacyNoticeUrl } from '@/lib/privacy-notice';

/** Opens the website's privacy notice in the browser. `label` is the text shown. */
export function PrivacyNoticeLink({ label }: { label: string }) {
  const { i18n } = useTranslation();
  return (
    <Button
      variant="link"
      icon="open"
      label={label}
      onPress={() => void WebBrowser.openBrowserAsync(privacyNoticeUrl(i18n.language))}
    />
  );
}
