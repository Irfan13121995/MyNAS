import AsyncStorage from '@react-native-async-storage/async-storage';

const memoryCache = new Map();
const CACHE_PREFIX = 'nas_cache_v1_';

/**
 * High-performance Stale-While-Revalidate caching service for React Native.
 */
export const cacheService = {
  /**
   * Retrieves item instantly from in-memory Map cache, falling back to AsyncStorage.
   */
  async get(key) {
    const fullKey = CACHE_PREFIX + key;
    if (memoryCache.has(fullKey)) {
      return memoryCache.get(fullKey);
    }
    try {
      const raw = await AsyncStorage.getItem(fullKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        memoryCache.set(fullKey, parsed);
        return parsed;
      }
    } catch (err) {
      console.warn('[CacheService] Error reading key:', key, err);
    }
    return null;
  },

  /**
   * Saves item to both memory Map and AsyncStorage asynchronously.
   */
  async set(key, value) {
    const fullKey = CACHE_PREFIX + key;
    memoryCache.set(fullKey, value);
    try {
      await AsyncStorage.setItem(fullKey, JSON.stringify(value));
    } catch (err) {
      console.warn('[CacheService] Error setting key:', key, err);
    }
  },

  /**
   * Removes cached item.
   */
  async remove(key) {
    const fullKey = CACHE_PREFIX + key;
    memoryCache.delete(fullKey);
    try {
      await AsyncStorage.removeItem(fullKey);
    } catch (err) {}
  }
};
