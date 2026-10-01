// What Expo leaves out of the app's fingerprint, the hash that decides which APKs an update may
// reach (app.json runtimeVersion "fingerprint", docs/DECISIONS.md #35). Every file counted here
// means a new APK when it changes, so leave out what cannot change the native app:
// - PackageJsonScriptsAll: the npm scripts in package.json. This app has no android/ or ios/
//   folder in git (they are generated at build time), so no script takes part in a build.
// - GitIgnore: .gitignore, counted by Expo only for apps that keep those native folders in git.
// Packages, app.json, plugins, icons, eas.json and google-services.json stay counted.

/** @type {import('expo/fingerprint').Config} */
const config = {
  sourceSkips: ['PackageJsonScriptsAll', 'GitIgnore'],
};

module.exports = config;
