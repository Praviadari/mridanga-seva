# mridangaseva.com — public website

Plain HTML in English, Telugu and Hindi; no JavaScript, no cookies, no dependencies (Node 20+ only).

```bash
npm test          # build into dist/ and check it (must end in OK)
npm run serve     # preview at http://localhost:4321/
```

- Texts: `content/<lang>/*.html` and `content/<lang>/strings.json`; one folder per language.
- Facts and switches (dates, links, draft): `site.config.mjs`.
- Headers (CSP etc.), favicon, security.txt: `static/`.

How to change, add a language, upload to Cloudflare Pages and go live: `docs/OPERATIONS.md`,
"The public website". Why it is built this way: `docs/DECISIONS.md` #128-#131.
