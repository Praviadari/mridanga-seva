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

  /** Mail addresses, forwarded by Cloudflare Email Routing since 26-10-2026 (NOTES_lead.md). */
  emails: {
    info: 'info@mridangaseva.com',
    privacy: 'privacy@mridangaseva.com',
  },

  /** The one phone number the site publishes (Sarvesh Prabhu, Guru; Praveen 26-10-2026), for tel: links. */
  phone: '+919989336301',

  app: {
    /**
     * The web version of the app: the LIVE site on Cloudflare Pages since 16-10-2026 (GO_LIVE_CHECKLIST E1),
     * at app.mridangaseva.com since the domain moved to Cloudflare on 26-10-2026 (E3).
     */
    webUrl: 'https://app.mridangaseva.com/',
    /** false shows the web app as "coming soon" without a link. */
    webLive: true,
    /**
     * Android APK: the production build 90c6d1cd (versionCode 12, fingerprint 23dc7e4a, 16-10-2026; GO_LIVE_CHECKLIST
     * E7) as a GitHub Release asset (tag android-1.0.0), since EAS deletes its own copy on 30-10-2026. The SHA-256 is
     * shown on the Get the app page so anyone can check the file. A new APK = a new release, then both values here.
     */
    apkUrl: 'https://github.com/Praviadari/mridanga-seva/releases/download/android-1.0.0/mridanga-seva-1.0.0.apk',
    apkSha256: 'aec19a5208a274da850a390083d1c641226ff2538cccb6784cf7c3a316fb7e96',
    /** Google Play listing; null until there is one. */
    playStoreUrl: null,
  },

  /** Public source code (MIT). */
  sourceUrl: 'https://github.com/Praviadari/mridanga-seva',
};
