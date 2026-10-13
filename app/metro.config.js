// Phase 3 face scan (branch p3-native, docs/DECISIONS.md #307): lets Metro bundle the .tflite models in
// assets/models as assets (react-native-fast-tflite README). Everything else is Expo's default.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('tflite');

module.exports = config;
