// Module resolve hook for the unit tests (registered by register.mjs): sends the native packages and
// app modules a pure helper imports to stand-ins, so the helper can run in plain Node.

const stub = (file) => new URL(file, import.meta.url).href;
const stubs = {
  'react-native': stub('./react-native.mjs'),
  'expo-linking': stub('./expo-linking.mjs'),
  '@/i18n': stub('./i18n.mjs'),
};

/** Node module hook: resolves a stubbed package or app module to its stand-in file. */
export async function resolve(specifier, context, nextResolve) {
  if (stubs[specifier]) return { url: stubs[specifier], shortCircuit: true };
  // src/lib/class-locale.ts reads the database and the device's storage; the stand-in lets a test
  // pick the class's zone and country.
  if (/(^|\/)class-locale(\.ts)?$/.test(specifier)) return { url: stub('./class-locale.mjs'), shortCircuit: true };
  // App source imports a sibling without its extension ('./dates'), as Metro allows; Node needs '.ts'.
  if (/^\.\.?\/[^.]+$/.test(specifier)) {
    try {
      return await nextResolve(specifier, context);
    } catch {
      return nextResolve(`${specifier}.ts`, context);
    }
  }
  return nextResolve(specifier, context);
}
