// ML Kit's models from Google Play services instead of inside the APK (docs/DECISIONS.md #630, NOTES_app_size.md).
//
// expo-camera (QR scan) asks for com.google.mlkit:barcode-scanning and react-native-vision-camera-face-detector (face
// scan) for com.google.mlkit:face-detection: the "bundled" ML Kit, which puts its own native library and models in the
// APK for both phone ABIs (libbarhopper_v3.so 2.1 MB + libface_detector_v2_jni.so 3.4 MB on arm64 alone, 2.6 MB of
// .tflite models). Google publishes the same API ("unbundled") in Play services packages whose model Play services
// keeps once per phone. The app's Gradle build swaps one for the other; the libraries' Kotlin code is unchanged.
//
// The cost: until Play services has fetched the model, a scan fails with "Waiting for the ... module to be downloaded".
// The meta-data line asks for both models at install; for an APK installed outside the Play Store Play services may
// fetch them only on first use (seconds, needs internet). Test on a phone: fresh install → QR scan and face scan at
// once, then again offline. Play services is already required (Play Integrity, push notifications).

const { AndroidConfig, withAndroidManifest, withAppBuildGradle } = require('expo/config-plugins');

/** Bundled ML Kit artifact → its Play services twin (dl.google.com/android/maven2, latest on 26-10-2026). */
const SUBSTITUTES = {
  'com.google.mlkit:barcode-scanning': 'com.google.android.gms:play-services-mlkit-barcode-scanning:18.3.1',
  'com.google.mlkit:face-detection': 'com.google.android.gms:play-services-mlkit-face-detection:17.1.0',
};

/** Models Play services fetches for this app; expo-camera's own manifest asks for barcode_ui (its scanner screen). */
const MODELS = 'barcode_ui,barcode,face';

const MARK = '// with-mlkit-play-services';

function gradleBlock() {
  const lines = Object.entries(SUBSTITUTES).map(
    ([from, to]) => `    substitute module('${from}') using module('${to}')`,
  );
  return [
    '',
    `${MARK}: ML Kit models from Google Play services, not inside the APK`,
    'configurations.all {',
    '  resolutionStrategy.dependencySubstitution {',
    ...lines,
    '  }',
    '}',
    '',
  ].join('\n');
}

function withMlkitPlayServices(config) {
  config = withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes(MARK)) mod.modResults.contents += gradleBlock();
    return mod;
  });
  return withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, 'com.google.mlkit.vision.DEPENDENCIES', MODELS);
    // expo-camera's library manifest sets the same name to "barcode_ui": the app's value wins.
    const item = application['meta-data'].find((m) => m.$['android:name'] === 'com.google.mlkit.vision.DEPENDENCIES');
    item.$['tools:replace'] = 'android:value';
    mod.modResults.manifest.$['xmlns:tools'] ??= 'http://schemas.android.com/tools';
    return mod;
  });
}

module.exports = withMlkitPlayServices;
module.exports.SUBSTITUTES = SUBSTITUTES;
module.exports.gradleBlock = gradleBlock;
