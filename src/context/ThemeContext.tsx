import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LightColors, DarkColors } from '../constants/theme';

// Theme mode options
export type ThemeMode = 'auto' | 'light' | 'dark';

// Theme context type
interface ThemeContextType {
  mode: ThemeMode;
  isDark: boolean;
  colors: typeof LightColors;
  setMode: (mode: ThemeMode) => void;
}

// Storage key
const THEME_STORAGE_KEY = '@seedmind_theme_mode';

// Create context with default values
const ThemeContext = createContext<ThemeContextType>({
  mode: 'auto',
  isDark: false,
  colors: LightColors,
  setMode: () => {},
});

// Theme Provider Component
export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const systemColorScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('auto');
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved theme preference on mount
  useEffect(() => {
    const loadThemePreference = async () => {
      try {
        const savedMode = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedMode && ['auto', 'light', 'dark'].includes(savedMode)) {
          setModeState(savedMode as ThemeMode);
        }
      } catch (error) {
        console.error('Error loading theme preference:', error);
      } finally {
        setIsLoaded(true);
      }
    };
    loadThemePreference();
  }, []);

  // Save theme preference when it changes
  const setMode = async (newMode: ThemeMode) => {
    setModeState(newMode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newMode);
    } catch (error) {
      console.error('Error saving theme preference:', error);
    }
  };

  // Determine if we should use dark mode
  const isDark = 
    mode === 'dark' || 
    (mode === 'auto' && systemColorScheme === 'dark');

  // Select the appropriate color palette
  const colors = isDark ? DarkColors : LightColors;

  // Don't render until theme preference is loaded
  if (!isLoaded) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ mode, isDark, colors, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

// Custom hook to use theme
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// Export theme mode options for Settings screen
export const themeModeOptions: { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'auto', label: 'Auto', icon: '🔄' },
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'dark', label: 'Dark', icon: '🌙' },
];


