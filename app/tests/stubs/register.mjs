// Makes `import ... from 'react-native'` and `'expo-linking'` load the small stubs in this folder
// when app source files run under Node's test runner (npm test). Import it before the module
// under test, and load that module with a dynamic import().

import { register } from 'node:module';

register('./hooks.mjs', import.meta.url);
