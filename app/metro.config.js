// Phase 3 face scan (branch p3-native, docs/DECISIONS.md #307): lets Metro bundle the models in assets/models as
// assets (react-native-fast-tflite README). They end in .bin, not .tflite (#631): the Android build never compresses a
// .tflite file, and the 9.9 MB SFace model then filled the APK at full size (7.9 MB compressed). fast-tflite reads the
// file whatever its name. Everything else is Expo's default.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('bin');

module.exports = config;
