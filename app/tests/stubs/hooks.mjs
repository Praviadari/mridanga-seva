// Module resolve hook for the unit tests (registered by register.mjs): sends the native packages a
// pure helper imports to stand-ins, so the helper can run in plain Node.

const stubs = {
  'react-native': new URL('./react-native.mjs', import.meta.url).href,
  'expo-linking': new URL('./expo-linking.mjs', import.meta.url).href,
};

/** Node module hook: resolves a stubbed package name to its stand-in file. */
export async function resolve(specifier, context, nextResolve) {
  if (stubs[specifier]) return { url: stubs[specifier], shortCircuit: true };
  return nextResolve(specifier, context);
}
