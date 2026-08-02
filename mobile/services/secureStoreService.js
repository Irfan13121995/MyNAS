import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function setSecureItem(key, value) {
  try {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    }
  } catch (err) {
    console.warn(`SecureStore write error for key ${key}:`, err.message);
    await AsyncStorage.setItem(key, value);
  }
}

export async function getSecureItem(key) {
  try {
    if (Platform.OS === 'web') {
      return await AsyncStorage.getItem(key);
    } else {
      let item = await SecureStore.getItemAsync(key);
      if (!item) {
        // Fallback check legacy AsyncStorage for smooth migration
        item = await AsyncStorage.getItem(key);
        if (item) {
          await setSecureItem(key, item);
          await AsyncStorage.removeItem(key);
        }
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
      await SecureStore.deleteItemAsync(key);
    }
    await AsyncStorage.removeItem(key);
  } catch (err) {
    console.warn(`SecureStore delete error for key ${key}:`, err.message);
  }
}
