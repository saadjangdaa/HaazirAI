export const Colors = {
  background: '#F0FDF9',      // very light mint-white
  surface: '#FFFFFF',
  surfaceElevated: '#E6FAF5',
  primary: '#00A37A',         // Pakistani green (darker for light bg)
  primaryDim: '#00A37A18',
  secondary: '#E6FAF5',
  textPrimary: '#0F2027',     // deep dark for readability
  textSecondary: '#3D5A52',
  textMuted: '#7A9E94',
  danger: '#DC2626',
  dangerDim: '#DC262618',
  warning: '#D97706',
  warningDim: '#D9770618',
  success: '#00A37A',
  successDim: '#00A37A18',
  border: '#C9EBE2',
  borderLight: '#DDFAF3',
  cardBg: '#FFFFFF',
  inputBg: '#F0FDF9',
  overlay: 'rgba(0,0,0,0.45)',
  urgencyColors: {
    low: '#00A37A',
    medium: '#D97706',
    high: '#EA580C',
    critical: '#DC2626',
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
    shadowColor: '#00A37A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 3,
  },
  primary: {
    shadowColor: '#00A37A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;
