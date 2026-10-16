// app/src/theme/tokens.generated.ts: written by design/build-tokens.mjs from design/tokens.json; do not edit (docs/DECISIONS.md #336).
// Choices (team decision, audit phase 5 question 1): header indigo, primary deep.

/** The team's palette choices this file was made with. */
export const choices = {
  header: 'indigo',
  primary: 'deep'
} as const;

/** Semantic colours per scheme, as hex (or rgba for overlays). */
export const semantic = {
  light: {
    bodyTop: '#FBF5EC',
    bodyBottom: '#FBF5EC',
    background: '#FBF5EC',
    surface: '#FFFDF8',
    surfaceRaised: '#FFFFFF',
    surfaceSunken: '#F4EADD',
    text: '#24170F',
    textMuted: '#64544A',
    border: '#EADCCB',
    cardBorder: '#EADCCB',
    controlBorder: '#8C7B6C',
    primarySoft: '#F8E6CC',
    onPrimarySoft: '#6E2D0B',
    link: '#8A3A0E',
    accent: '#F2A33A',
    onAccent: '#24170F',
    ornament: '#E0B25C',
    focus: '#1D4ED8',
    success: '#067647',
    successSurface: '#ECFDF3',
    warning: '#92400E',
    warningSurface: '#FEF3C7',
    warningBorder: '#B54708',
    danger: '#B42318',
    dangerSurface: '#FEF3F2',
    info: '#262A66',
    infoSurface: '#EEEEF8',
    infoBorder: '#4B4F9A',
    neutral: '#5B4F46',
    neutralSurface: '#F4EADD',
    paused: '#6B21A8',
    pausedSurface: '#F3E8FF',
    disabled: '#64544A',
    disabledSurface: '#F4EADD',
    tabActive: '#6E2D0B',
    tabActiveIndicator: '#F8E6CC',
    tabInactive: '#64544A',
    skeleton: '#F4EADD',
    shadow: 'rgba(60, 30, 10, 0.10)',
    overlay: 'rgba(18, 20, 58, 0.55)',
    pressedOverlay: 'rgba(36, 23, 15, 0.08)',
    bar: '#1B1E4B',
    barLine: 'rgba(224, 178, 92, 0.55)',
    header: '#22307A',
    headerDeep: '#0B0C26',
    onHeader: '#FFF6E8',
    onHeaderMuted: '#E6D6C0',
    headerAccent: '#F2A33A',
    headerGold: '#FFD27A',
    signInGold: '#FFC845',
    headerGlow: '#785ADC',
    focusOnHeader: '#FFD27A',
    primary: '#9A4307',
    primaryPressed: '#742C0B',
    onPrimary: '#FFFFFF'
  },
  dark: {
    bodyTop: '#1A1F55',
    bodyBottom: '#0A0C24',
    background: '#0E1130',
    surface: '#1F2456',
    surfaceRaised: '#262B60',
    surfaceSunken: '#0A0C24',
    text: '#F6EEE4',
    textMuted: '#C3B5A6',
    border: '#2C3170',
    cardBorder: '#2C3170',
    controlBorder: '#8287C4',
    primarySoft: '#4A3618',
    onPrimarySoft: '#F6C27A',
    link: '#F6B860',
    accent: '#F2A33A',
    onAccent: '#24170F',
    ornament: '#E0B25C',
    focus: '#93C5FD',
    success: '#47CD89',
    successSurface: '#10291C',
    warning: '#FBBF24',
    warningSurface: '#3A2A0A',
    warningBorder: '#FBBF24',
    danger: '#F97066',
    dangerSurface: '#3A1A17',
    info: '#A5A9E0',
    infoSurface: '#2C3170',
    infoBorder: '#A5A9E0',
    neutral: '#C8BFB6',
    neutralSurface: '#232858',
    paused: '#D8B4FE',
    pausedSurface: '#2A1A3A',
    disabled: '#A89A8D',
    disabledSurface: '#232858',
    tabActive: '#F6C27A',
    tabActiveIndicator: '#4A3618',
    tabInactive: '#C3B5A6',
    skeleton: '#232858',
    shadow: 'transparent',
    overlay: 'rgba(0, 0, 0, 0.6)',
    pressedOverlay: 'rgba(255, 246, 232, 0.08)',
    bar: '#22307A',
    barLine: 'rgba(224, 178, 92, 0.55)',
    header: '#22307A',
    headerDeep: '#0B0C26',
    onHeader: '#FFF6E8',
    onHeaderMuted: '#E6D6C0',
    headerAccent: '#F2A33A',
    headerGold: '#FFD27A',
    signInGold: '#FFC845',
    headerGlow: '#785ADC',
    focusOnHeader: '#FFD27A',
    primary: '#F2A33A',
    primaryPressed: '#F6B860',
    onPrimary: '#24170F'
  }
} as const;

/** Small status labels: text and background per tone. */
export const chips = {
  light: {
    info: {
      text: '#262A66',
      background: '#EEEEF8'
    },
    success: {
      text: '#067647',
      background: '#ECFDF3'
    },
    warning: {
      text: '#92400E',
      background: '#FEF3C7'
    },
    neutral: {
      text: '#5B4F46',
      background: '#F4EADD'
    },
    paused: {
      text: '#6B21A8',
      background: '#F3E8FF'
    },
    danger: {
      text: '#B42318',
      background: '#FEF3F2'
    },
    level: {
      text: '#6E2D0B',
      background: '#F8E6CC'
    }
  },
  dark: {
    info: {
      text: '#A5A9E0',
      background: '#2C3170'
    },
    success: {
      text: '#47CD89',
      background: '#10291C'
    },
    warning: {
      text: '#FBBF24',
      background: '#3A2A0A'
    },
    neutral: {
      text: '#C8BFB6',
      background: '#232858'
    },
    paused: {
      text: '#D8B4FE',
      background: '#2A1A3A'
    },
    danger: {
      text: '#F97066',
      background: '#3A1A17'
    },
    level: {
      text: '#F6C27A',
      background: '#4A3618'
    }
  }
} as const;

/** The home circles' colours: a pale tint and the icon on it. */
export const modules = {
  light: {
    green: {
      background: '#DCFCE7',
      icon: '#15803D'
    },
    blue: {
      background: '#DBEAFE',
      icon: '#1D4ED8'
    },
    purple: {
      background: '#EDE9FE',
      icon: '#6D28D9'
    },
    orange: {
      background: '#FFEDD5',
      icon: '#C2410C'
    },
    pink: {
      background: '#FCE7F3',
      icon: '#BE185D'
    },
    teal: {
      background: '#CCFBF1',
      icon: '#0F766E'
    },
    indigo: {
      background: '#E0E7FF',
      icon: '#4338CA'
    }
  },
  dark: {
    green: {
      background: '#0F2E1C',
      icon: '#4ADE80'
    },
    blue: {
      background: '#0F2342',
      icon: '#60A5FA'
    },
    purple: {
      background: '#2A1B4A',
      icon: '#C4B5FD'
    },
    orange: {
      background: '#3A1E0A',
      icon: '#FDBA74'
    },
    pink: {
      background: '#3A1226',
      icon: '#F9A8D4'
    },
    teal: {
      background: '#0B2E2A',
      icon: '#5EEAD4'
    },
    indigo: {
      background: '#1E1B4B',
      icon: '#A5B4FC'
    }
  }
} as const;

/** Space between things, in density-independent pixels. */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48
} as const;

/** Corner roundness. */
export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 999
} as const;

/** The heading font's name as expo-font registers it. */
export const serifFont = 'CormorantGaramond-SemiBold';

/** Sizes of the serif headings (English). */
export const serifType = {
  title: {
    fontSize: 28,
    lineHeight: 36
  },
  subtitle: {
    fontSize: 22,
    lineHeight: 30
  }
} as const;
