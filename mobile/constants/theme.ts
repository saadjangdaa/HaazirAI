export const Colors = {
  background: '#0A0A0A',
  surface: '#141414',
  surfaceElevated: '#1A1A2E',
  primary: '#00C896',
  primaryDim: '#00C89622',
  secondary: '#1A1A2E',
  textPrimary: '#FFFFFF',
  textSecondary: '#B0B0B0',
  textMuted: '#606060',
  danger: '#FF4444',
  dangerDim: '#FF444422',
  warning: '#FFB800',
  warningDim: '#FFB80022',
  success: '#00C896',
  successDim: '#00C89622',
  border: '#2A2A2A',
  borderLight: '#333333',
  cardBg: '#111111',
  inputBg: '#1C1C1C',
  overlay: 'rgba(0,0,0,0.85)',
  urgencyColors: {
    low: '#00C896',
    medium: '#FFB800',
    high: '#FF8C00',
    critical: '#FF4444',
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
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const Shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  primary: {
    shadowColor: '#00C896',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
} as const;
