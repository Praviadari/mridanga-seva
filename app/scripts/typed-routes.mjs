// Writes Expo Router's typed routes (.expo/types/router.d.ts and expo-env.d.ts) without starting the
// dev server, so `npm run typecheck` on a fresh clone or in CI checks every router.push / <Link>
// path against the real screens (audit FS4-05). Both files are gitignored; `npx expo start` writes
// the same ones. Uses the Expo CLI's own generator, resolved through the installed `expo` package.
// Run from app/: node scripts/typed-routes.mjs

import { createRequire } from 'node:module';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const requireFromExpo = createRequire(createRequire(import.meta.url).resolve('expo/package.json'));
const { startTypescriptTypeGenerationAsync } = requireFromExpo(
  '@expo/cli/build/src/start/server/type-generation/startTypescriptTypeGeneration',
);

const routerTypes = new URL('../.expo/types/router.d.ts', import.meta.url);
// A stale file from an older set of screens would hide a broken path, so start from none.
rmSync(routerTypes, { force: true });
await startTypescriptTypeGenerationAsync({ projectRoot });
// The generator writes the file after a short debounce; wait for it (at most 20 s).
for (let i = 0; i < 100 && !existsSync(routerTypes); i++) await new Promise((r) => setTimeout(r, 200));
if (!existsSync(routerTypes)) {
  console.error('typed routes: .expo/types/router.d.ts was not written (is experiments.typedRoutes on in app.json?)');
  process.exit(1);
}
console.log('typed routes written to .expo/types/router.d.ts');
