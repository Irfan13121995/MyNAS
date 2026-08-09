import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = 'user_theme_preference';

export const THEME_MODES = {
  SYSTEM: 'system',
  LIGHT: 'light',
  DARK: 'dark'
};

export async function getSavedTheme() {
  try {
    const saved = await AsyncStorage.getItem(THEME_KEY);
    return saved || THEME_MODES.SYSTEM;
  } catch (e) {
    return THEME_MODES.SYSTEM;
  }
}

export async function saveThemePreference(mode) {
  try {
    await AsyncStorage.setItem(THEME_KEY, mode);
  } catch (e) {
    console.warn('Failed to save theme preference:', e);
  }
}
