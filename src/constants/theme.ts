// SeedMind Theme - Warm, nurturing coffee-inspired palette

// Light Mode Colors
export const LightColors = {
  // Primary palette - warm coffee tones
  espresso: '#2C1810',
  darkRoast: '#3D2317',
  mocha: '#5C3D2E',
  latte: '#C4A484',
  cream: '#F5E6D3',
  milk: '#FAF7F2',
  
  // Accent colors
  gold: '#D4A574',
  warmGold: '#E8C49A',
  copper: '#B87333',
  sage: '#9CAF88',
  softSage: '#C5D4B8',
  
  // Semantic colors
  primary: '#5C3D2E',
  secondary: '#D4A574',
  background: '#FAF7F2',
  surface: '#FFFFFF',
  surfaceElevated: '#FFF9F3',
  
  // Text colors
  textPrimary: '#2C1810',
  textSecondary: '#5C3D2E',
  textMuted: '#8B7355',
  textLight: '#C4A484',
  textOnDark: '#FAF7F2',
  
  // UI colors
  border: '#E8DED4',
  borderLight: '#F0EAE2',
  divider: '#E8DED4',
  
  // Chat colors
  userBubble: '#5C3D2E',
  aiBubble: '#F5E6D3',
  
  // Meditation card gradients
  meditationStart: '#5C3D2E',
  meditationEnd: '#8B6B4D',
};

// Dark Mode Colors - warm espresso tones (not harsh black)
export const DarkColors = {
  // Primary palette - deep warm tones
  espresso: '#F5EDE4',
  darkRoast: '#E8DED4',
  mocha: '#C4A484',
  latte: '#5C3D2E',
  cream: '#2A211A',
  milk: '#1C1410',
  
  // Accent colors (slightly brighter for dark mode)
  gold: '#E8B888',
  warmGold: '#F0D4A8',
  copper: '#D4894A',
  sage: '#A8BC9A',
  softSage: '#7A9568',
  
  // Semantic colors
  primary: '#D4A574',
  secondary: '#E8B888',
  background: '#1C1410',
  surface: '#2A211A',
  surfaceElevated: '#3D2D22',
  
  // Text colors
  textPrimary: '#F5EDE4',
  textSecondary: '#D4C4B0',
  textMuted: '#9C8B78',
  textLight: '#6B5C4D',
  textOnDark: '#F5EDE4',
  
  // UI colors
  border: '#3D2D22',
  borderLight: '#4A3A2E',
  divider: '#3D2D22',
  
  // Chat colors
  userBubble: '#D4A574',
  aiBubble: '#3D2D22',
  
  // Meditation card gradients
  meditationStart: '#3D2D22',
  meditationEnd: '#5C4535',
};

// Default export for backwards compatibility
export const Colors = LightColors;

export const Typography = {
  // Font families
  fontFamilyHeading: 'CormorantGaramond_600SemiBold',
  fontFamilyHeadingItalic: 'CormorantGaramond_600SemiBold_Italic',
  fontFamilyBody: 'Inter_400Regular',
  fontFamilyBodyMedium: 'Inter_500Medium',
  fontFamilyBodySemiBold: 'Inter_600SemiBold',
  fontFamilyBodyBold: 'Inter_700Bold',
  
  // Font sizes
  fontSizeXS: 12,
  fontSizeSM: 14,
  fontSizeMD: 16,
  fontSizeLG: 18,
  fontSizeXL: 22,
  fontSize2XL: 28,
  fontSize3XL: 36,
  fontSize4XL: 48,
  
  // Line heights
  lineHeightTight: 1.2,
  lineHeightNormal: 1.5,
  lineHeightRelaxed: 1.7,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const Shadows = {
  sm: {
    shadowColor: '#2C1810',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#2C1810',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#2C1810',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
};

