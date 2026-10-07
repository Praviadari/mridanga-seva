// Facts and switches for the public website. Change a value here, run `npm run build`, upload
// `dist/` (docs/OPERATIONS.md "The public website"). Words live in content/<language>/, not here.

export default {
  /** The address the site will have. Canonical links, hreflang and the sitemap use it. */
  origin: 'https://mridangaseva.com',

  /** Language served at the root (/). Every other language folder is served under /<code>/. */
  defaultLang: 'en',

  /**
   * true while the words are drafts for team review: every page shows a "Draft" note and tells
   * search engines not to index it. `npm run build:release` turns it off for one build; set it to
   * false here when the team has approved the text and the domain is attached.
   */
  draft: true,

  /** Shown as "updated" in the footer and as lastmod in sitemap.xml (ISO 8601). */
  updated: '2026-10-07',

  /** The privacy notice's version and date. Raise both when its meaning changes. */
  privacyNotice: { version: '0.1-draft', date: '2026-10-07' },

  /** Class dates (NOTES.md timeline, 28-09-2026; unchanged in NOTES_lead.md 06-10-2026). */
  pilot: { start: '2026-11-16', end: '2026-11-29' },
  launch: '2026-12-01',

  /** Mail aliases on the Zoho domain (NOTES_lead.md, 06-10-2026). */
  emails: {
    info: 'info@mridangaseva.com',
    privacy: 'privacy@mridangaseva.com',
  },

  app: {
    /** The web version of the app; it moves here at go-live (audit brief 8). */
    webUrl: 'https://app.mridangaseva.com/',
    /** false shows the web app as "coming soon" without a link. */
    webLive: false,
    /**
     * Android APK: the current build page on expo.dev. NOTE (07-10-2026): this build is the
     * pilot/TEST APK. Swap in the production APK (audit brief 9) before the domain is attached.
     */
    apkUrl:
      'https://expo.dev/accounts/mridanga-seva/projects/mridanga-seva/builds/0bfc5c14-3af0-4935-a7ed-a5ad7ead9348',
    /** Google Play listing; null until there is one. */
    playStoreUrl: null,
  },

  /** Public source code (MIT). */
  sourceUrl: 'https://github.com/Praviadari/mridanga-seva',
};
