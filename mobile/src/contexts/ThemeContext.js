/**
 * Glassmorphism Theme Context Provider
 * Dynamic Light / Dark Mode with translucent surfaces and frosted glass styling
 */
import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_STORAGE_KEY = 'nas_app_theme';

export const DARK_GLASS_THEME = {
  mode: 'dark',
  background: '#0B0F19',
  backgroundGradient: ['#0B0F19', '#111827', '#0F172A'],
  glassCard: 'rgba(30, 41, 59, 0.65)',
  glassCardHover: 'rgba(51, 65, 85, 0.75)',
  glassBorder: 'rgba(255, 255, 255, 0.12)',
  glassBorderActive: 'rgba(56, 189, 248, 0.5)',
  glassInput: 'rgba(15, 23, 42, 0.6)',
  
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  
  accent: '#38BDF8',
  accentGradient: ['#38BDF8', '#0284C7'],
  accentGlow: 'rgba(56, 189, 248, 0.3)',
  
  success: '#10B981',
  successBg: 'rgba(16, 185, 129, 0.15)',
  warning: '#F59E0B',
  warningBg: 'rgba(245, 158, 11, 0.15)',
  danger: '#EF4444',
  dangerBg: 'rgba(239, 68, 68, 0.15)',

  tabBarBg: 'rgba(15, 23, 42, 0.85)',
  shadowColor: '#000000',
};

export const LIGHT_GLASS_THEME = {
  mode: 'light',
  background: '#F1F5F9',
  backgroundGradient: ['#F8FAFC', '#E2E8F0', '#F1F5F9'],
  glassCard: 'rgba(255, 255, 255, 0.75)',
  glassCardHover: 'rgba(255, 255, 255, 0.9)',
  glassBorder: 'rgba(255, 255, 255, 0.8)',
  glassBorderActive: 'rgba(2, 132, 199, 0.5)',
  glassInput: 'rgba(255, 255, 255, 0.9)',
  
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  
  accent: '#0284C7',
  accentGradient: ['#0284C7', '#0369A1'],
  accentGlow: 'rgba(2, 132, 199, 0.25)',
  
  success: '#059669',
  successBg: 'rgba(5, 150, 105, 0.12)',
  warning: '#D97706',
  warningBg: 'rgba(217, 119, 6, 0.12)',
  danger: '#DC2626',
  dangerBg: 'rgba(220, 38, 38, 0.12)',

  tabBarBg: 'rgba(255, 255, 255, 0.88)',
  shadowColor: '#64748B',
};

const ThemeContext = createContext({
  theme: DARK_GLASS_THEME,
  isDark: true,
  toggleTheme: () => {},
  setThemeMode: () => {}
});

export const ThemeProvider = ({ children }) => {
  const [themeMode, setThemeModeState] = useState('dark');

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then(saved => {
      if (saved === 'light' || saved === 'dark') {
        setThemeModeState(saved);
      }
    });
  }, []);

  const setThemeMode = async (mode) => {
    setThemeModeState(mode);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
  };

  const toggleTheme = () => {
    setThemeMode(themeMode === 'dark' ? 'light' : 'dark');
  };

  const theme = useMemo(() => (themeMode === 'light' ? LIGHT_GLASS_THEME : DARK_GLASS_THEME), [themeMode]);

  return (
    <ThemeContext.Provider value={{ theme, isDark: themeMode === 'dark', toggleTheme, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
