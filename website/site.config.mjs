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
  updated: '2026-10-24',

  /**
   * The privacy notice's version and date. Raise both when its meaning changes: the app asks everyone again
   * (DECISIONS #577). 1.0 is final (#571): its page shows no Draft note even while `draft` is true (site.mjs).
   */
  privacyNotice: { version: '1.0', date: '2026-10-24' },

  /**
   * The day the class opens to all: Tue 20 Oct 2026 (Dussehra), Praveen's decision of 12-10-2026 (NOTES_lead.md).
   * There is no separate pilot any more, so the pilot dates left the site (launch audit LA-13, 16-10-2026).
   */
  launch: '2026-10-20',

  /** Mail aliases on the Zoho domain (NOTES_lead.md, 06-10-2026). */
  emails: {
    info: 'info@mridangaseva.com',
    privacy: 'privacy@mridangaseva.com',
  },

  app: {
    /**
     * The web version of the app: the LIVE site on Cloudflare Pages since 16-10-2026 (GO_LIVE_CHECKLIST E1);
     * it moves to app.mridangaseva.com once the domain is on Cloudflare (E3).
     */
    webUrl: 'https://mridanga-seva.pages.dev/',
    /** false shows the web app as "coming soon" without a link. */
    webLive: true,
    /**
     * Android APK: the production build's page on expo.dev (90c6d1cd, versionCode 12, fingerprint 23dc7e4a,
     * 16-10-2026; GO_LIVE_CHECKLIST E7). EAS deletes the build on 30-10-2026: before then, replace this with
     * the shared Drive folder "Mridanga Seva APKs" link (OPERATIONS "Each build").
     */
    apkUrl:
      'https://expo.dev/accounts/mridanga-seva/projects/mridanga-seva/builds/90c6d1cd-7d56-4840-8a35-55acef76c407',
    /** Google Play listing; null until there is one. */
    playStoreUrl: null,
  },

  /** Public source code (MIT). */
  sourceUrl: 'https://github.com/Praviadari/mridanga-seva',
};
