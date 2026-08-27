/**
 * Upload Queue Screen
 * Manage pending, syncing, and failed upload tasks with one-tap retry
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useSync } from '../contexts/SyncContext';
import { getFilesByStatus, clearCompletedRecords } from '../database/fileRepository';
import GlassCard from '../components/GlassCard';
import GlassButton from '../components/GlassButton';

export default function QueueScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { isSyncing, syncStats, retryFailed, refreshStats } = useSync();
  const [activeTab, setActiveTab] = useState('pending'); // 'pending', 'failed', 'completed'
  const [items, setItems] = useState([]);

  const loadItems = async () => {
    try {
      const rows = await getFilesByStatus(activeTab, 100);
      setItems(rows);
    } catch (e) {}
  };

  useEffect(() => {
    loadItems();
  }, [activeTab, isSyncing]);

  const handleClearCompleted = async () => {
    await clearCompletedRecords();
    await refreshStats();
    loadItems();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Sync Queue</Text>
        {activeTab === 'failed' && syncStats.failed > 0 && (
          <GlassButton title="Retry All Failed" variant="danger" onPress={retryFailed} style={{ paddingVertical: 8 }} />
        )}
        {activeTab === 'completed' && (
          <GlassButton title="Clear History" variant="ghost" onPress={handleClearCompleted} style={{ paddingVertical: 8 }} />
        )}
      </View>

      {/* Tabs */}
      <View style={[styles.tabBar, { backgroundColor: theme.glassCard, borderColor: theme.glassBorder }]}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'pending' && { backgroundColor: theme.accent }]}
          onPress={() => setActiveTab('pending')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'pending' ? '#fff' : theme.textSecondary }]}>
            Pending ({syncStats.pending})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'failed' && { backgroundColor: theme.danger }]}
          onPress={() => setActiveTab('failed')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'failed' ? '#fff' : theme.textSecondary }]}>
            Failed ({syncStats.failed})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'completed' && { backgroundColor: theme.success }]}
          onPress={() => setActiveTab('completed')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'completed' ? '#fff' : theme.textSecondary }]}>
            Completed ({syncStats.completed})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Queue List */}
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <GlassCard style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, { color: theme.textPrimary }]} numberOfLines={1}>{item.filename}</Text>
                <Text style={{ fontSize: 11, color: theme.textSecondary }}>
                  Type: {item.media_type} • Retries: {item.retry_count}
                </Text>
                {item.error_message && (
                  <Text style={{ fontSize: 11, color: theme.danger, marginTop: 4 }}>Error: {item.error_message}</Text>
                )}
              </View>
            </View>
          </GlassCard>
        )}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <Text style={{ fontSize: 36 }}>✨</Text>
            <Text style={{ color: theme.textMuted, marginTop: 10 }}>No items in this queue.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: { fontSize: 22, fontWeight: '900' },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabText: { fontSize: 12, fontWeight: '700' },
  itemTitle: { fontSize: 13, fontWeight: '700', marginBottom: 2 }
});
