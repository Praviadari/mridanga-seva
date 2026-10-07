// Builds the public website into website/dist: plain HTML and one CSS file, no JavaScript.
//
//   node src/build.mjs            draft build (what site.config.mjs says)
//   node src/build.mjs --release  the same with draft off (no "Draft" note, indexable)
//
// Every folder in content/ that holds a strings.json is a language. Adding a language is copying
// content/en to content/<code>, translating it and setting its "meta" (DECISIONS #129).

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import config from '../site.config.mjs';
import { contentDir, loadLanguages, notFound, outDir, pagePath, pages, root } from './site.mjs';

const release = process.argv.includes('--release');
const draft = config.draft && !release;
const out = outDir;

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function formatDate(iso, lang, withYear = true) {
  const opts = { day: 'numeric', month: 'long', timeZone: 'UTC' };
  if (withYear) opts.year = 'numeric';
  return new Intl.DateTimeFormat(lang.meta.dateLocale ?? lang.meta.bcp47, opts).format(new Date(`${iso}T00:00:00Z`));
}
const time = (iso, lang, withYear = true) =>
  `<time datetime="${iso}">${esc(formatDate(iso, lang, withYear))}</time>`;

/** Fills {{...}} values and [[TEAM: ...]] placeholders in a content file. */
function fill(html, lang) {
  const vars = {
    pilotDates: `${time(config.pilot.start, lang, false)} – ${time(config.pilot.end, lang)}`,
    launchDate: time(config.launch, lang),
    noticeDate: time(config.privacyNotice.date, lang),
    noticeVersion: esc(config.privacyNotice.version),
    apkUrl: esc(config.app.apkUrl),
    appWebUrl: esc(config.app.webUrl),
    sourceUrl: esc(config.sourceUrl),
  };
  return html
    .replace(/<!--[\s\S]*?-->\s*/g, '')
    .replace(/\{\{(\w+)(?::(\w+))?\}\}/g, (m, key, arg) => {
      if (key === 'href') {
        const page = pages.find((p) => p.id === arg);
        if (!page) throw new Error(`Unknown page in ${m}`);
        return pagePath(lang.code, page.slug);
      }
      if (key === 'email') {
        const address = config.emails[arg];
        if (!address) throw new Error(`Unknown email in ${m}`);
        return `<a href="mailto:${address}">${address}</a>`;
      }
      if (!(key in vars)) throw new Error(`Unknown value ${m} in ${lang.code}`);
      return vars[key];
    })
    .replace(/\[\[TEAM:\s*([\s\S]*?)\]\]/g, (m, text) => `<mark class="todo">${lang.strings.ui.todo}: ${text.trim()}</mark>`);
}

/** Keeps or drops <!--if:flag-->…<!--endif--> blocks before comments are stripped. */
function conditionals(html) {
  const flags = {
    webLive: config.app.webLive,
    webSoon: !config.app.webLive,
    playStore: Boolean(config.app.playStoreUrl),
    noPlayStore: !config.app.playStoreUrl,
  };
  return html.replace(/<!--if:(\w+)-->([\s\S]*?)<!--endif-->/g, (m, flag, body) => {
    if (!(flag in flags)) throw new Error(`Unknown flag ${flag}`);
    return flags[flag] ? body : '';
  });
}

function organizationJsonLd(lang) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Mridanga Seva',
    url: `${config.origin}/`,
    email: config.emails.info,
    description: lang.strings.site.description,
    knowsLanguage: languages.map((l) => l.meta.bcp47),
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'general enquiries',
        email: config.emails.info,
        availableLanguage: languages.map((l) => l.meta.bcp47),
      },
      { '@type': 'ContactPoint', contactType: 'privacy', email: config.emails.privacy },
    ],
  };
  // JSON-LD is data, not a script: CSP does not block it. '<' is escaped so it cannot close the tag.
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

function layout({ lang, page, body, cssHref }) {
  const s = lang.strings;
  const isNotFound = page === notFound;
  const meta = s.pages[page.id];
  const path = isNotFound ? null : pagePath(lang.code, page.slug);
  const url = path && `${config.origin}${path}`;
  const title = page.id === 'home' ? `${s.site.name} — ${meta.title}` : `${meta.title} — ${s.site.name}`;

  const alternates = isNotFound
    ? ''
    : [
        ...languages.map(
          (l) => `<link rel="alternate" hreflang="${l.meta.bcp47}" href="${config.origin}${pagePath(l.code, page.slug)}">`,
        ),
        `<link rel="alternate" hreflang="x-default" href="${config.origin}${pagePath(config.defaultLang, page.slug)}">`,
      ].join('\n');

  const og = isNotFound
    ? ''
    : [
        `<meta property="og:type" content="website">`,
        `<meta property="og:site_name" content="${esc(s.site.name)}">`,
        `<meta property="og:title" content="${esc(meta.title)}">`,
        `<meta property="og:description" content="${esc(meta.description)}">`,
        `<meta property="og:url" content="${url}">`,
        `<meta property="og:locale" content="${lang.meta.ogLocale}">`,
        ...languages
          .filter((l) => l !== lang)
          .map((l) => `<meta property="og:locale:alternate" content="${l.meta.ogLocale}">`),
        `<meta name="twitter:card" content="summary">`,
      ].join('\n');

  const mainNav = pages
    .map((p) => {
      const current = p === page ? ' aria-current="page"' : '';
      return `<li><a href="${pagePath(lang.code, p.slug)}"${current}>${esc(s.nav[p.id])}</a></li>`;
    })
    .join('');

  // Language links go to the same page in the other language (404: to that language's home).
  const langNav = languages
    .map((l) => {
      const href = pagePath(l.code, isNotFound ? '' : page.slug);
      const current = l === lang ? ' aria-current="true"' : '';
      return `<li><a href="${href}" lang="${l.meta.bcp47}" hreflang="${l.meta.bcp47}"${current}>${esc(l.meta.nativeName)}</a></li>`;
    })
    .join('');
  const langLabel = lang.code === 'en' ? s.ui.language : `${s.ui.language} · Language`;

  const robots = draft || isNotFound ? '<meta name="robots" content="noindex">\n' : '';
  const draftNote = draft ? `<p class="draft">${s.ui.draftNote}</p>` : '';

  return `<!doctype html>
<html lang="${lang.meta.bcp47}" dir="${lang.meta.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(meta.description)}">
${robots}${url ? `<link rel="canonical" href="${url}">\n` : ''}${alternates}
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#9A4307">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${cssHref}">
${og}
${page.id === 'home' ? organizationJsonLd(lang) : ''}
</head>
<body>
<a class="skip" href="#main">${esc(s.ui.skip)}</a>
<header class="site-header">
${draftNote}<div class="wrap header-inner">
<a class="brand" href="${pagePath(lang.code, '')}"><span class="brand-name">${esc(s.site.name)}</span> <span class="brand-tagline" lang="sa-Latn">Saṅkalpa · Sādhana · Seva</span></a>
<nav class="lang-nav" aria-label="${esc(langLabel)}"><span class="lang-label" aria-hidden="true">${esc(langLabel)}:</span><ul>${langNav}</ul></nav>
<nav class="main-nav" aria-label="${esc(s.ui.mainNav)}"><ul>${mainNav}</ul></nav>
</div>
</header>
<main id="main" tabindex="-1">
<div class="wrap prose">
${body.trim()}
</div>
</main>
<footer class="site-footer">
<div class="wrap">
<p>${s.ui.noCookies}</p>
<ul class="footer-links">
<li><a href="${pagePath(lang.code, 'privacy')}">${esc(s.nav.privacy)}</a></li>
<li><a href="${pagePath(lang.code, 'contact')}">${esc(s.nav.contact)}</a></li>
<li><a href="${esc(config.sourceUrl)}">${esc(s.ui.source)}</a></li>
</ul>
<p>${esc(s.ui.updated)} ${time(config.updated, lang)} · © <span>2026</span> Mridanga Seva</p>
</div>
</footer>
</body>
</html>
`;
}

function sitemap() {
  const urls = pages.map((p) => {
    const links = [
      ...languages.map(
        (l) =>
          `    <xhtml:link rel="alternate" hreflang="${l.meta.bcp47}" href="${config.origin}${pagePath(l.code, p.slug)}"/>`,
      ),
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${config.origin}${pagePath(config.defaultLang, p.slug)}"/>`,
    ].join('\n');
    return languages
      .map(
        (l) =>
          `  <url>\n    <loc>${config.origin}${pagePath(l.code, p.slug)}</loc>\n    <lastmod>${config.updated}</lastmod>\n${links}\n  </url>`,
      )
      .join('\n');
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
}

// ---- build ----
const languages = loadLanguages();

{
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(join(root, 'static'), out, { recursive: true });

  const css = readFileSync(join(root, 'src', 'styles.css'));
  const cssName = `site.${createHash('sha256').update(css).digest('hex').slice(0, 10)}.css`;
  mkdirSync(join(out, 'assets'), { recursive: true });
  writeFileSync(join(out, 'assets', cssName), css);
  const cssHref = `/assets/${cssName}`;

  let count = 0;
  for (const lang of languages) {
    for (const page of [...pages, notFound]) {
      const src = join(contentDir, lang.code, page.file);
      if (!existsSync(src)) throw new Error(`Missing ${lang.code}/${page.file}`);
      const body = fill(conditionals(readFileSync(src, 'utf8')), lang);
      const html = layout({ lang, page, body, cssHref });
      const prefix = lang.code === config.defaultLang ? '' : lang.code;
      const file =
        page === notFound ? join(out, prefix, '404.html') : join(out, prefix, page.slug, 'index.html');
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, html);
      count++;
    }
  }

  writeFileSync(join(out, 'sitemap.xml'), sitemap());
  writeFileSync(
    join(out, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${config.origin}/sitemap.xml\n`,
  );
  console.log(
    `Built ${count} pages in ${languages.map((l) => l.code).join(', ')} → dist/ (${draft ? 'DRAFT' : 'release'})`,
  );
}
