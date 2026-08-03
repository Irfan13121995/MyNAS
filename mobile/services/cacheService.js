import AsyncStorage from '@react-native-async-storage/async-storage';

const memoryCache = new Map();
const CACHE_PREFIX = 'nas_cache_v1_';
const MAX_CACHE_SIZE = 50;

/**
 * High-performance Stale-While-Revalidate caching service for React Native.
 */
export const cacheService = {
  /**
   * Retrieves item instantly from in-memory Map cache, falling back to AsyncStorage.
   */
  async get(key, maxAgeMs = 300000) {
    const fullKey = CACHE_PREFIX + key;
    const now = Date.now();

    if (memoryCache.has(fullKey)) {
      const cached = memoryCache.get(fullKey);
      if (now - cached.timestamp > maxAgeMs) return null;
      return cached.data;
    }
    try {
      const raw = await AsyncStorage.getItem(fullKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        memoryCache.set(fullKey, parsed);
        if (now - parsed.timestamp > maxAgeMs) return null;
        return parsed.data;
      }
    } catch (err) {
      console.warn('[CacheService] Error reading key:', key, err);
      // Delete corrupted key
      await this.remove(key);
    }
    return null;
  },

  /**
   * Saves item to both memory Map and AsyncStorage asynchronously.
   */
  async set(key, value) {
    const fullKey = CACHE_PREFIX + key;
    const cacheEntry = { data: value, timestamp: Date.now() };

    if (!memoryCache.has(fullKey) && memoryCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = memoryCache.keys().next().value;
      memoryCache.delete(oldestKey);
    }

    memoryCache.set(fullKey, cacheEntry);
    try {
      await AsyncStorage.setItem(fullKey, JSON.stringify(cacheEntry));
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
