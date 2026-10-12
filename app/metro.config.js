// BRANCH p3-spike ONLY (face spike): lets Metro bundle the .tflite models in assets/models as assets
// (react-native-fast-tflite README). main has no metro.config.js.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('tflite');

module.exports = config;
