import { Platform } from 'react-native';
import { StudentStatus } from '../types/database';

export const BrandColors = {
  primary: '#D95F02',       // Warm Indian saffron / terracotta
  primaryLight: '#FFF5EB',  // Soft saffron tint
  primaryDark: '#A33E00',
  secondary: '#1E293B',     // Deep slate navy
  accent: '#B45309',        // Rich bronze/ochre
  cardBg: '#FFFFFF',
  border: '#E2E8F0',
  inputBg: '#F8FAFC',
};

export const StatusColors: Record<StudentStatus, { bg: string; text: string; label: string }> = {
  active: {
    bg: '#DCFCE7',
    text: '#15803D',
    label: 'Active',
  },
  new: {
    bg: '#E0F2FE',
    text: '#0369A1',
    label: 'New',
  },
  irregular: {
    bg: '#FEF3C7',
    text: '#B45309',
    label: 'Irregular',
  },
  inactive: {
    bg: '#FEE2E2',
    text: '#B91C1C',
    label: 'Inactive',
  },
  paused: {
    bg: '#EDE9FE',
    text: '#6D28D9',
    label: 'Paused',
  },
  left: {
    bg: '#F3F4F6',
    text: '#4B5563',
    label: 'Left',
  },
};

export const Colors = {
  light: {
    text: '#0F172A',
    background: '#F8FAFC',
    backgroundElement: '#F1F5F9',
    backgroundSelected: '#E2E8F0',
    textSecondary: '#64748B',
    primary: BrandColors.primary,
    border: BrandColors.border,
  },
  dark: {
    text: '#F8FAFC',
    background: '#0F172A',
    backgroundElement: '#1E293B',
    backgroundSelected: '#334155',
    textSecondary: '#94A3B8',
    primary: BrandColors.primary,
    border: '#334155',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
