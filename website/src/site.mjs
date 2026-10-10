// What build.mjs and check.mjs share: the page list, the languages and the address of a page.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../site.config.mjs';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const contentDir = join(root, 'content');
export const outDir = join(root, 'dist');

/**
 * Pages in menu order. `file` is the content file in each language folder. `menu: false` keeps a
 * page out of the main menu; it is still in the footer, the sitemap and every language.
 */
export const pages = [
  { id: 'home', slug: '', file: 'home.html' },
  { id: 'classes', slug: 'classes', file: 'classes.html' },
  { id: 'join', slug: 'join', file: 'join.html' },
  { id: 'app', slug: 'get-the-app', file: 'app.html' },
  { id: 'tech', slug: 'how-the-app-is-built', file: 'tech.html', menu: false },
  { id: 'privacy', slug: 'privacy', file: 'privacy.html' },
  { id: 'contact', slug: 'contact', file: 'contact.html' },
];
export const notFound = { id: 'notFound', slug: null, file: '404.html' };

/**
 * Languages: every folder in content/ that holds a strings.json (DECISIONS #129). The default
 * language comes first, the rest by meta.order.
 */
export function loadLanguages() {
  const langs = readdirSync(contentDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(contentDir, d.name, 'strings.json')))
    .map((d) => {
      const strings = JSON.parse(readFileSync(join(contentDir, d.name, 'strings.json'), 'utf8'));
      return { code: d.name, strings, meta: strings.meta };
    });
  langs.sort((a, b) =>
    a.code === config.defaultLang ? -1 : b.code === config.defaultLang ? 1 : a.meta.order - b.meta.order,
  );
  return langs;
}

/** Site-relative address of a page in a language, always ending in '/'. */
export function pagePath(langCode, slug) {
  const prefix = langCode === config.defaultLang ? '' : `/${langCode}`;
  return `${prefix}/${slug ? `${slug}/` : ''}`;
}
