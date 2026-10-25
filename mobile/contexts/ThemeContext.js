import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { getSavedTheme, saveThemePreference, THEME_MODES } from '../services/themeService';

const darkColors = {
  background: '#0B0E14',
  surface: 'rgba(255, 255, 255, 0.05)',
  surfaceElevated: 'rgba(255, 255, 255, 0.09)',
  surfaceSolid: '#161B26',
  card: 'rgba(255, 255, 255, 0.06)',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  accent: '#0A84FF',
  accentLight: '#64D2FF',
  accentBg: 'rgba(10, 132, 255, 0.16)',
  accentBorder: 'rgba(10, 132, 255, 0.35)',
  border: 'rgba(255, 255, 255, 0.08)',
  borderLight: 'rgba(255, 255, 255, 0.14)',
  hairline: 'rgba(255, 255, 255, 0.12)',
  overlay: 'rgba(7, 10, 15, 0.78)',
  statusBar: 'light-content',
  topbar: 'rgba(11, 14, 20, 0.88)',
  tabBg: 'rgba(22, 27, 38, 0.88)',
  inputBg: 'rgba(255, 255, 255, 0.07)',
  shadow: '#000000',
  danger: '#FF453A',
  success: '#32D74B',
  warning: '#FF9F0A',
  purple: '#BF5AF2',
};

const lightColors = {
  background: '#F5F5F7',
  surface: 'rgba(255, 255, 255, 0.85)',
  surfaceElevated: 'rgba(255, 255, 255, 0.95)',
  surfaceSolid: '#FFFFFF',
  card: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  accent: '#007AFF',
  accentLight: '#0A84FF',
  accentBg: 'rgba(0, 122, 255, 0.12)',
  accentBorder: 'rgba(0, 122, 255, 0.3)',
  border: 'rgba(0, 0, 0, 0.08)',
  borderLight: 'rgba(0, 0, 0, 0.12)',
  hairline: 'rgba(0, 0, 0, 0.06)',
  overlay: 'rgba(15, 23, 42, 0.4)',
  statusBar: 'dark-content',
  topbar: 'rgba(245, 245, 247, 0.92)',
  tabBg: 'rgba(255, 255, 255, 0.9)',
  inputBg: 'rgba(0, 0, 0, 0.05)',
  shadow: 'rgba(15, 23, 42, 0.1)',
  danger: '#FF3B30',
  success: '#34C759',
  warning: '#FF9500',
  purple: '#AF52DE',
};

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState(THEME_MODES.SYSTEM);

  useEffect(() => {
    getSavedTheme().then(setThemeModeState);
  }, []);

  const setThemeMode = async (mode) => {
    setThemeModeState(mode);
    await saveThemePreference(mode);
  };

  const isDarkMode = 
    themeMode === THEME_MODES.DARK || 
    (themeMode === THEME_MODES.SYSTEM && systemColorScheme === 'dark');

  const theme = isDarkMode ? 'dark' : 'light';
  const colors = isDarkMode ? darkColors : lightColors;

  const contextValue = useMemo(() => ({
    theme,
    themeMode,
    setThemeMode,
    colors
  }), [theme, themeMode, colors]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
