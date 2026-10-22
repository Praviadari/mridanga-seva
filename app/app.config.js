// App variants (docs/DECISIONS.md #430). app.json is the app's configuration; this file hands it on UNCHANGED unless
// APP_VARIANT names a variant, so the class's own APKs (EAS profiles preview and production, which never set it) and
// their updates get exactly app.json, and their fingerprint does not move (tests/app-variant.test.mjs).
//
// APP_VARIANT=facetest (EAS profile `facetest`, eas.json): "Mridanga Seva TEST", the separate test app for the
// Phase 3 face-scan class test. Its own package id, so it installs next to the class's app and a tester keeps the
// real one; its own link scheme, so links meant for the class's app never open it; icons with a red TEST band
// (scripts/make-facetest-icons.mjs); no google-services.json, which names only the class's package (no push
// notifications in the test app). It talks to the TEST Supabase project only (scripts/eas-build-guard.mjs).

const VARIANTS = {
  facetest: (config) => {
    const android = { ...config.android };
    delete android.googleServicesFile;
    return {
      ...config,
      name: 'Mridanga Seva TEST',
      scheme: 'mridangasevatest',
      icon: './assets/images/facetest/icon.png',
      android: {
        ...android,
        package: 'org.mridangaseva.app.test',
        adaptiveIcon: {
          ...android.adaptiveIcon,
          foregroundImage: './assets/images/facetest/android-icon-foreground.png',
          monochromeImage: './assets/images/facetest/android-icon-monochrome.png',
        },
      },
    };
  },
};

module.exports = ({ config }) => {
  const variant = process.env.APP_VARIANT;
  if (!variant) return config;
  if (!Object.hasOwn(VARIANTS, variant)) {
    throw new Error(`APP_VARIANT "${variant}" is not a variant of this app (app.config.js knows: ${Object.keys(VARIANTS).join(', ')}).`);
  }
  return VARIANTS[variant](config);
};
