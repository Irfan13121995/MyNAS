import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';

const QUEUE_KEY = 'nas_offline_upload_queue';

export const offlineQueueService = {
  async getQueue() {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn('Failed to read offline queue', e);
      return [];
    }
  },

  async addToQueue(fileItem, destination) {
    try {
      const queue = await this.getQueue();
      const newItem = {
        id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        file: fileItem,
        destination,
        timestamp: Date.now()
      };
      // Prevent duplicates based on filename & uri
      if (!queue.some(q => q.file.uri === fileItem.uri || (q.file.filename && q.file.filename === fileItem.filename))) {
        queue.push(newItem);
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      }
      return newItem;
    } catch (e) {
      console.warn('Failed to add item to offline queue', e);
    }
  },

  async removeFromQueue(id) {
    try {
      const queue = await this.getQueue();
      const filtered = queue.filter(item => item.id !== id);
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
    } catch (e) {
      console.warn('Failed to remove item from offline queue', e);
    }
  },

  async clearQueue() {
    try {
      await AsyncStorage.removeItem(QUEUE_KEY);
    } catch (e) {
      console.warn('Failed to clear offline queue', e);
    }
  },

  async processQueue(uploadFn, onProgress) {
    const netState = await Network.getNetworkStateAsync();
    if (!netState.isConnected || !netState.isInternetReachable) {
      return { processed: 0, failed: 0, remaining: (await this.getQueue()).length };
    }

    const queue = await this.getQueue();
    if (queue.length === 0) return { processed: 0, failed: 0, remaining: 0 };

    let processed = 0;
    let failed = 0;

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      try {
        await uploadFn(item.file, item.destination, (prog) => {
          if (onProgress) {
            onProgress({
              currentIndex: i + 1,
              totalFiles: queue.length,
              currentFileProgress: prog,
              filename: item.file.filename || item.file.name
            });
          }
        });
        await this.removeFromQueue(item.id);
        processed++;
      } catch (err) {
        console.warn(`Failed to process queued file ${item.id}:`, err);
        failed++;
      }
    }

    const remaining = (await this.getQueue()).length;
    return { processed, failed, remaining };
  }
};
