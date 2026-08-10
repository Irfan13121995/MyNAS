import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { getSavedTheme, saveThemePreference, THEME_MODES } from '../services/themeService';

const darkColors = {
  background: '#0B0F17',
  surface: 'rgba(30, 41, 59, 0.65)',
  surfaceSolid: '#1E293B',
  card: 'rgba(30, 41, 59, 0.85)',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  accent: '#00BCD4',
  accentLight: '#22D3EE',
  accentBg: 'rgba(0, 188, 212, 0.18)',
  accentBorder: 'rgba(0, 188, 212, 0.3)',
  border: 'rgba(255, 255, 255, 0.08)',
  borderLight: 'rgba(255, 255, 255, 0.1)',
  overlay: 'rgba(7, 10, 15, 0.75)',
  statusBar: 'light-content',
  topbar: 'rgba(15, 23, 42, 0.92)',
  tabBg: 'rgba(30, 41, 59, 0.7)',
  inputBg: 'rgba(30, 41, 59, 0.85)',
  shadow: '#000000',
  danger: '#EF4444',
  success: '#22C55E',
  warning: '#EAB308',
};

const lightColors = {
  background: '#F1F5F9',
  surface: 'rgba(255, 255, 255, 0.85)',
  surfaceSolid: '#FFFFFF',
  card: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  accent: '#0891B2',
  accentLight: '#06B6D4',
  accentBg: 'rgba(8, 145, 178, 0.12)',
  accentBorder: 'rgba(8, 145, 178, 0.3)',
  border: 'rgba(15, 23, 42, 0.1)',
  borderLight: 'rgba(15, 23, 42, 0.06)',
  overlay: 'rgba(15, 23, 42, 0.4)',
  statusBar: 'dark-content',
  topbar: 'rgba(241, 245, 249, 0.95)',
  tabBg: 'rgba(226, 232, 240, 0.7)',
  inputBg: 'rgba(226, 232, 240, 0.6)',
  shadow: 'rgba(15, 23, 42, 0.1)',
  danger: '#DC2626',
  success: '#16A34A',
  warning: '#CA8A04',
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
