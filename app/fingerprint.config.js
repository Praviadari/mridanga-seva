// What Expo leaves out of the app's fingerprint, the hash that decides which APKs an update may
// reach (app.json runtimeVersion "fingerprint", docs/DECISIONS.md #35). Every file counted here
// means a new APK when it changes, so leave out what cannot change the native app:
// - PackageJsonScriptsAll: the npm scripts in package.json. This app has no android/ or ios/
//   folder in git (they are generated at build time). EAS Build does run npm's install hooks
//   (preinstall, postinstall, prepare) and its own eas-build-* hooks; package.json has none of
//   them, so no script takes part in a build. Adding one that can change the native side means a
//   new APK by hand, since the fingerprint would not notice (audit D11-09, docs/DECISIONS.md #198).
// - GitIgnore: .gitignore, counted by Expo only for apps that keep those native folders in git.
// Packages, app.json, plugins, icons, eas.json and google-services.json stay counted.

/** @type {import('expo/fingerprint').Config} */
const config = {
  sourceSkips: ['PackageJsonScriptsAll', 'GitIgnore'],
};

module.exports = config;
