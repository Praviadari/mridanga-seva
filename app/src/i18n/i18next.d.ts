// Tells TypeScript which translation keys exist (taken from the English file), so that
// t('signIn.titel') — a typo — is an error in `npx tsc --noEmit` instead of a blank label.

import 'i18next';

import type en from './locales/en.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}
