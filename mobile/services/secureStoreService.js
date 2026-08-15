import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function setSecureItem(key, value) {
  try {
    if (value === null || value === undefined) {
      await deleteSecureItem(key);
      return;
    }
    const stringValue = String(value);
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(key, stringValue);
    } else {
      try {
        await SecureStore.setItemAsync(key, stringValue, {
          keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
        });
      } catch (e1) {
        await SecureStore.setItemAsync(key, stringValue);
      }
    }
  } catch (err) {
    console.warn(`SecureStore write error for key ${key}:`, err.message);
    if (value != null) {
      await AsyncStorage.setItem(key, String(value));
    }
  }
}

export async function getSecureItem(key) {
  try {
    if (Platform.OS === 'web') {
      return await AsyncStorage.getItem(key);
    } else {
      let item = null;
      try {
        item = await SecureStore.getItemAsync(key);
      } catch (e1) {}

      if (!item) {
        // Fallback check AsyncStorage
        item = await AsyncStorage.getItem(key);
      }
      return item;
    }
  } catch (err) {
    console.warn(`SecureStore read error for key ${key}:`, err.message);
    return await AsyncStorage.getItem(key);
  }
}

export async function deleteSecureItem(key) {
  try {
    if (Platform.OS !== 'web') {
      try {
        await SecureStore.deleteItemAsync(key);
      } catch (e1) {}
    }
    await AsyncStorage.removeItem(key);
  } catch (err) {
    console.warn(`SecureStore delete error for key ${key}:`, err.message);
  }
}
