// Uptime check of LIVE, run by .github/workflows/uptime.yml (docs/OPERATIONS.md "App errors and uptime",
// docs/DECISIONS.md #662). Reads, and only reads: the LIVE web app and its code, the website, and Supabase Auth's
// health address. Exits 1 when any is down, which fails the run and makes GitHub email the alert.
// Supabase's health address wants the public (publishable) key; every visitor's browser gets it in the web app's code,
// so it is read from there and nothing secret is needed. Run by hand from the repository root: node .github/uptime-check.mjs

const APP_URL = process.env.APP_URL ?? 'https://app.mridangaseva.com';
const SITE_URL = process.env.SITE_URL ?? 'https://mridangaseva.com';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://qeozvvizcojzxcjgnaei.supabase.co';

/** The text of `url`, or null after three tries (20 s each, 10 s apart): one slow answer is not an outage. */
async function read(url, headers = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
      if (response.ok) return await response.text();
      console.log(`${url}: HTTP ${response.status} (try ${attempt})`);
    } catch (error) {
      console.log(`${url}: ${error.message}${error.cause?.code ? ` (${error.cause.code})` : ''} (try ${attempt})`);
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  return null;
}

const problems = [];

const page = await read(`${APP_URL}/`);
const entry = page?.match(/\/_expo\/static\/js\/web\/entry-[a-f0-9]+\.js/)?.[0];
let key = null;
if (page === null) problems.push(`LIVE web app ${APP_URL} does not answer`);
else if (!entry) problems.push('LIVE web app answers without its app code (no entry script in the page)');
else {
  key = (await read(`${APP_URL}${entry}`))?.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0] ?? null;
  if (!key) problems.push(`LIVE web app code ${entry} could not be read, or has no Supabase key`);
}

if (key) {
  const health = await read(`${SUPABASE_URL}/auth/v1/health`, { apikey: key });
  if (health === null) problems.push('Supabase Auth health does not answer');
  else if (!health.includes('"name":"GoTrue"')) problems.push('Supabase Auth health answered unexpectedly');
}

const site = await read(`${SITE_URL}/`);
if (site === null) problems.push(`Website ${SITE_URL} does not answer`);
else if (!site.includes('<title>Mridanga Seva')) problems.push('Website answers without its home page');

// GitHub shows "::error::" lines on the run's summary page.
for (const problem of problems) console.log(`::error::${problem}`);
if (problems.length === 0) console.log(`All up: ${APP_URL}, ${SITE_URL}, Supabase Auth.`);
process.exitCode = problems.length === 0 ? 0 : 1;
