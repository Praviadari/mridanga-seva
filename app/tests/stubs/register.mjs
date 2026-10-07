// Makes `import ... from 'react-native'`, `'expo-linking'`, `'@/i18n'` and `'./class-locale'`
// load the small stand-ins in this folder when app source files run under Node's test runner
// (npm test). Import it before the module under test, and load that module with a dynamic import().

import { register } from 'node:module';

register('./hooks.mjs', import.meta.url);
