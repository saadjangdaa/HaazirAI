export const Colors = {
  // Core surfaces — InDrive light style
  background: '#F6F7FB',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',

  // Haazir blue accent — Vibrant Blue #1A6FFF
  primary: '#1A6FFF',
  primaryDark: '#0047CC',
  primaryLight: '#EEF4FF',
  primaryDim: 'rgba(26,111,255,0.12)',

  // Text hierarchy
  textPrimary: '#111111',
  textSecondary: '#444444',
  textMuted: '#999999',
  textInverse: '#FFFFFF',

  // Status
  danger: '#FF3B30',
  dangerDim: 'rgba(255,59,48,0.10)',
  warning: '#FF9500',
  warningDim: 'rgba(255,149,0,0.10)',
  success: '#34C759',
  successDim: 'rgba(52,199,89,0.12)',

  // Borders & dividers
  border: '#EBEBEB',
  borderStrong: '#CCCCCC',

  // Cards & inputs
  cardBg: '#FFFFFF',
  inputBg: '#F6F7FB',
  overlay: 'rgba(0,0,0,0.50)',

  // Worker accent — amber
  workerAccent: '#FF9500',
  workerAccentDim: 'rgba(255,149,0,0.12)',

  urgencyColors: {
    low: '#34C759',
    medium: '#FF9500',
    high: '#FF6B35',
    critical: '#FF3B30',
  },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  xxl: 36,
  full: 9999,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
  xxxl: 34,
} as const;

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
  black: '900' as const,
};

export const Shadow = {
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  primary: {
    shadowColor: '#1A6FFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 14,
    elevation: 8,
  },
  modal: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 16,
  },
} as const;
