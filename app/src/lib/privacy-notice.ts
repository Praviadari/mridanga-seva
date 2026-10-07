// The privacy notice lives on the public website (website/content/<language>/privacy.html), not in
// the app: the sign-up and registration screens link to it in the reader's language, and a
// minor's consent records which version the parent was shown (consents.notice_version, 0034).
// docs/DECISIONS.md #150.

/**
 * Where the website is served. The Cloudflare Pages preview until mridangaseva.com is attached
 * (audit brief 8): change it here, once, and publish an update.
 */
export const WEBSITE_ORIGIN = 'https://mridangaseva-site.pages.dev';

/**
 * The notice's version: the same value as privacyNotice.version in website/site.config.mjs (the
 * database smoke test checks that they match). Raise both when the notice's meaning changes.
 */
export const PRIVACY_NOTICE_VERSION = '0.1-draft';

/** Languages the website has the notice in; others get the English page. */
const SITE_LANGUAGES = ['en', 'te', 'hi'] as const;

/** The notice's address in a language: English at /privacy/, the others under /<code>/privacy/. */
export function privacyNoticeUrl(language: string): string {
  const code = SITE_LANGUAGES.find((l) => language === l || language.startsWith(`${l}-`)) ?? 'en';
  return `${WEBSITE_ORIGIN}${code === 'en' ? '' : `/${code}`}/privacy/`;
}
