// Makes a VAPID key pair for web push (migration 0062, docs/DECISIONS.md #605; docs/OPERATIONS.md "Push
// notifications" part C). One pair per site and Supabase project: the TEST pair for mridanga-seva-test, the LIVE pair
// for mridanga-seva. Run from app/:
//   node scripts/web-push-keys.mjs --out <file outside the repository>
// It writes the Edge Function secrets WEB_PUSH_PUBLIC_KEY and WEB_PUSH_PRIVATE_KEY to <file>, for
//   npx supabase@2.118.0 secrets set --env-file <file> --project-ref <the project>
// after which <file> is deleted: the private key lives only in the project's secrets, never in git, a chat or a
// note. It prints only the public key, which also goes into the site's settings file (app/.env.test or app/.env.live)
// as EXPO_PUBLIC_WEB_PUSH_KEY. A new pair means every browser must switch notifications on again (the old
// subscriptions are refused with 403), so make it once per project and keep it.
//
// Node's built-in Web Crypto only; nothing is sent anywhere.

import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const i = process.argv.indexOf('--out');
const out = i === -1 ? undefined : process.argv[i + 1];
if (!out) {
  console.error('web-push-keys: say where the secrets go: node scripts/web-push-keys.mjs --out <file outside the repository>');
  process.exit(1);
}
if (existsSync(out)) {
  console.error(`web-push-keys: ${out} exists; nothing was written (a project keeps its pair: see the top of this file).`);
  process.exit(1);
}

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');
const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey);

writeFileSync(out, `WEB_PUSH_PUBLIC_KEY=${publicKey}\nWEB_PUSH_PRIVATE_KEY=${d}\n`, { mode: 0o600 });
console.log(`web-push-keys: the secrets are in ${resolve(out)}: set them on the project, then delete the file.`);
console.log(`EXPO_PUBLIC_WEB_PUSH_KEY=${publicKey}`);
