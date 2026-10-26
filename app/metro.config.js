// Metro (the bundler) settings: Expo's own, plus one size cut (docs/DECISIONS.md #618).
//
// On Android, expo-router's layouts reach expo-symbols (layouts/withLayoutContext → native-tabs →
// materialIconConverter.android), and expo-symbols registers the whole Material Symbols font (970 KB) as an
// asset plus a 77 KB name table. The app draws its icons with its own font (assets/fonts/app-icons.ttf,
// #592) and never uses NativeTabs or SymbolView, so on Android expo-symbols is swapped for a small stand-in
// (src/lib/expo-symbols-stub.tsx). The font then leaves the APK and every update; the web and iOS are untouched.
// tests/metro-config.test.mjs checks that the swap still points at a real file.

const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const SYMBOLS_STUB = path.join(__dirname, 'src', 'lib', 'expo-symbols-stub.tsx');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'expo-symbols' && platform === 'android') {
    return { type: 'sourceFile', filePath: SYMBOLS_STUB };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
