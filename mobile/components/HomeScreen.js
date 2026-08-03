import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet, View, Text, TextInput, ScrollView, TouchableOpacity,
  FlatList, ActivityIndicator, RefreshControl, Alert, Platform, StatusBar
} from 'react-native';
import CircularGauge from './CircularGauge';
import FileExplorerModal from './FileExplorerModal';
import { cacheService } from '../services/cacheService';

export default function HomeScreen({ serverUrl, token, onSelectFile, onOpenFileBrowser, onOpenLibrary }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('recent');
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [files, setFiles] = useState([]);
  const [starredFiles, setStarredFiles] = useState([]);
  const [exploreVisible, setExploreVisible] = useState(false);
  const [explorePath, setExplorePath] = useState('');

  const fetchRecentFiles = async (signal) => {
    // Stale-While-Revalidate: Load from local cache instantly first
    const cached = await cacheService.get('home_recent_files');
    if (cached && cached.length > 0) {
      setFiles(cached);
      setLoading(false);
    }

    try {
      const res = await fetch(`${serverUrl}/api/files`, {
        headers: { Authorization: `Bearer ${token}` },
        signal
      });
      if (res.ok) {
        const drives = await res.json();
        if (drives && drives.length > 0) {
          const drivePath = drives[0].path;
          const subRes = await fetch(`${serverUrl}/api/files?path=${encodeURIComponent(drivePath)}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal
          });
          if (subRes.ok) {
            const fileList = await subRes.json();
            setFiles(fileList || []);
            await cacheService.set('home_recent_files', fileList || []);
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Failed to fetch recent files:', err);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchRecentFiles(controller.signal);
    return () => {
      controller.abort();
    };
  }, []);

  // Global Multi-Disk Search Effect
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`${serverUrl}/api/files/search?q=${encodeURIComponent(searchQuery.trim())}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal
        });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data || []);
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('Failed to search across NAS disks:', err);
        }
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, serverUrl, token]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRecentFiles();
  };

  const defaultItems = [
    { name: 'Sales report.docx', ext: '.docx', size: 2450000, modifiedAt: '2026-07-29T08:48:22Z', type: 'doc' },
    { name: 'Pop music.mp3', ext: '.mp3', size: 5400000, modifiedAt: '2026-07-29T07:32:28Z', type: 'audio' },
    { name: 'Video.mp4', ext: '.mp4', size: 48000000, modifiedAt: '2026-07-29T07:32:21Z', type: 'video' },
    { name: 'Design Proposal.pptx', ext: '.pptx', size: 12100000, modifiedAt: '2026-07-29T07:31:26Z', type: 'doc' },
  ];

  const filteredFiles = useMemo(() => {
    let displayFiles = searchResults !== null ? searchResults : (files.length > 0 ? files : defaultItems);

    if (activeSubTab === 'starred') {
      displayFiles = displayFiles.filter(f => starredFiles.includes(f.name));
    } else if (activeSubTab === 'offline') {
      displayFiles = displayFiles.slice(0, 2);
    }

    if (categoryFilter === 'photos') {
      displayFiles = displayFiles.filter(f => (f.ext || f.name || '').match(/\.(jpg|jpeg|png|webp|gif|bmp|heic)$/i));
    } else if (categoryFilter === 'docs') {
      displayFiles = displayFiles.filter(f => (f.ext || f.name || '').match(/\.(doc|docx|pdf|txt|pptx|xlsx|csv|log)$/i) || f.type === 'doc');
    } else if (categoryFilter === 'audio') {
      displayFiles = displayFiles.filter(f => (f.ext || f.name || '').match(/\.(mp3|wav|flac|m4a|ogg|aac)$/i) || f.type === 'audio');
    } else if (categoryFilter === 'video') {
      displayFiles = displayFiles.filter(f => (f.ext || f.name || '').match(/\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v)$/i) || f.type === 'video');
    }

    return displayFiles;
  }, [files, searchResults, activeSubTab, categoryFilter, starredFiles]);

  const toggleStar = (fileName) => {
    if (starredFiles.includes(fileName)) {
      setStarredFiles(starredFiles.filter(name => name !== fileName));
    } else {
      setStarredFiles([...starredFiles, fileName]);
    }
  };

  const handleFileMore = (item) => {
    const isStarred = starredFiles.includes(item.name);
    Alert.alert(
      item.name,
      `Size: ${Math.round((item.size || 0) / 1024)} KB\nModified: ${new Date(item.modifiedAt || Date.now()).toLocaleDateString()}`,
      [
        { text: 'Open / View', onPress: () => onSelectFile && onSelectFile(item) },
        { text: isStarred ? '⭐ Unstar File' : '⭐ Star File', onPress: () => toggleStar(item.name) },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const getFileBadge = (item) => {
    const ext = (item.ext || item.name || '').toLowerCase();
    if (ext.match(/\.(doc|docx|pdf|txt|pptx|xlsx)$/i) || item.type === 'doc') {
      return { icon: '📄', bg: 'rgba(59, 130, 246, 0.18)', color: '#60A5FA' };
    }
    if (ext.match(/\.(mp3|wav|flac|m4a)$/i) || item.type === 'audio') {
      return { icon: '🎵', bg: 'rgba(6, 182, 212, 0.18)', color: '#22D3EE' };
    }
    if (ext.match(/\.(mp4|mkv|mov|avi|webm)$/i) || item.type === 'video') {
      return { icon: '▶', bg: 'rgba(139, 92, 246, 0.18)', color: '#A78BFA' };
    }
    if (item.isDirectory) {
      return { icon: '📁', bg: 'rgba(245, 158, 11, 0.18)', color: '#FBBF24' };
    }
    return { icon: '📄', bg: 'rgba(148, 163, 184, 0.18)', color: '#94A3B8' };
  };

  const handleCategoryPress = (categoryKey) => {
    if (categoryFilter === categoryKey) {
      setCategoryFilter(null);
    } else {
      setCategoryFilter(categoryKey);
      if ((categoryKey === 'photos' || categoryKey === 'video') && onOpenLibrary) {
        onOpenLibrary(categoryKey);
      }
    }
  };

  const categories = [
    { key: 'photos', label: 'Photos', icon: '🖼️', activeGlow: 'rgba(59, 130, 246, 0.25)', activeBorder: '#3B82F6' },
    { key: 'docs', label: 'Documents', icon: '📄', activeGlow: 'rgba(245, 158, 11, 0.25)', activeBorder: '#F59E0B' },
    { key: 'audio', label: 'Audio', icon: '🎵', activeGlow: 'rgba(6, 182, 212, 0.25)', activeBorder: '#00BCD4' },
    { key: 'video', label: 'Videos', icon: '🎬', activeGlow: 'rgba(139, 92, 246, 0.25)', activeBorder: '#8B5CF6' },
  ];

  const subTabs = ['recent', 'starred', 'labeled', 'offline'];

  const statusBarPadding = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 16;

  const renderFileItem = useCallback(({ item }) => {
    const badge = getFileBadge(item);
    const dateStr = item.modifiedAt
      ? new Date(item.modifiedAt).toLocaleString()
      : '05/25/2022, 08:48:22';
    const isStarred = starredFiles.includes(item.name);

    return (
      <TouchableOpacity
        style={styles.fileRow}
        activeOpacity={0.75}
        onPress={() => onSelectFile && onSelectFile(item, filteredFiles)}
      >
        <View style={[styles.fileBadgeBox, { backgroundColor: badge.bg }]}>
          <Text style={[styles.fileBadgeText, { color: badge.color }]}>{badge.icon}</Text>
        </View>

        <View style={styles.fileMetaBox}>
          <Text style={styles.fileName}>
            {isStarred ? '⭐ ' : ''}{item.name}
          </Text>
          <Text style={styles.fileDate}>{dateStr}</Text>
        </View>

        <TouchableOpacity style={styles.moreBtn} onPress={() => handleFileMore(item)}>
          <Text style={styles.moreIcon}>⋮</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }, [starredFiles, filteredFiles, onSelectFile]);

  return (
    <View style={styles.container}>
      {/* ── DARK GLASS SEARCH & TOOLBAR (SAFE FROM STATUS BAR) ────────── */}
      <View style={[styles.header, { paddingTop: statusBarPadding }]}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search your NAS…"
            placeholderTextColor="#64748B"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            onSubmitEditing={() => {
              if (searchQuery && searchQuery.trim().length >= 1) {
                setIsSearching(true);
                fetch(`${serverUrl}/api/files/search?q=${encodeURIComponent(searchQuery.trim())}`, {
                  headers: { Authorization: `Bearer ${token}` }
                })
                .then(res => res.json())
                .then(data => setSearchResults(data || []))
                .catch(err => console.warn('Search error:', err))
                .finally(() => setIsSearching(false));
              }
            }}
          />
          <TouchableOpacity
            style={styles.searchSubmitBtn}
            activeOpacity={0.8}
            onPress={() => {
              if (searchQuery && searchQuery.trim().length >= 1) {
                setIsSearching(true);
                fetch(`${serverUrl}/api/files/search?q=${encodeURIComponent(searchQuery.trim())}`, {
                  headers: { Authorization: `Bearer ${token}` }
                })
                .then(res => res.json())
                .then(data => setSearchResults(data || []))
                .catch(err => console.warn('Search error:', err))
                .finally(() => setIsSearching(false));
              }
            }}
          >
            {isSearching ? (
              <ActivityIndicator size="small" color="#0F172A" />
            ) : (
              <Text style={styles.searchSubmitBtnText}>Search</Text>
            )}
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.headerBtn} onPress={() => Alert.alert('Activity Log', 'NAS File synchronization active.')}>
          <Text style={styles.headerBtnIcon}>📋</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerBtn} onPress={() => Alert.alert('Notifications', 'No new system alerts.')}>
          <Text style={styles.headerBtnIcon}>🔔</Text>
        </TouchableOpacity>
      </View>

      {/* ── CATEGORY CIRCLES ─────────────────────────────────────────── */}
      <View style={styles.categoryRow}>
        {categories.map(cat => {
          const isActive = categoryFilter === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              style={styles.categoryItem}
              activeOpacity={0.7}
              onPress={() => handleCategoryPress(cat.key)}
            >
              <View style={[
                styles.circle,
                isActive && {
                  backgroundColor: cat.activeGlow,
                  borderColor: cat.activeBorder,
                  shadowColor: cat.activeBorder,
                  shadowOpacity: 0.5,
                  shadowRadius: 8,
                  elevation: 6,
                  transform: [{ scale: 1.06 }]
                }
              ]}>
                <Text style={styles.circleIcon}>{cat.icon}</Text>
              </View>
              <Text style={[styles.categoryLabel, isActive && styles.categoryLabelActive]}>{cat.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── SUB-TABS ────────────────────────────────────────────────── */}
      <View style={styles.subTabRow}>
        {subTabs.map((tabKey) => {
          const isActive = activeSubTab === tabKey;
          return (
            <TouchableOpacity
              key={tabKey}
              style={styles.subTabBtn}
              onPress={() => setActiveSubTab(tabKey)}
              activeOpacity={0.7}
            >
              <Text style={[styles.subTabText, isActive && styles.subTabTextActive]}>
                {tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}
              </Text>
              {isActive && <View style={styles.subTabIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── FILE LIST ──────────────────────────────────────────────── */}
      <FlatList
        style={styles.fileList}
        contentContainerStyle={{ paddingBottom: 110 }}
        data={filteredFiles}
        keyExtractor={(item, index) => item.path || index.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00BCD4" />}
        ListHeaderComponent={
          <View>
            <TouchableOpacity 
              style={styles.storageCard} 
              activeOpacity={0.8}
              onPress={() => {
                setExplorePath('C:\\');
                setExploreVisible(true);
              }}
            >
              <View style={styles.storageCardInfo}>
                <Text style={styles.storageCardTitle}>Main Storage</Text>
                <Text style={styles.storageCardDesc}>1.2 TB / 2.0 TB Used</Text>
                <Text style={styles.storageCardTap}>Tap to explore disk</Text>
              </View>
              <CircularGauge percentage={60} size={50} strokeWidth={5} />
            </TouchableOpacity>

            <View style={styles.listHeaderRow}>
              <Text style={styles.dateHeader}>
                {categoryFilter ? `Filtered: ${categoryFilter.toUpperCase()}` : 'Files'}
              </Text>
              {categoryFilter && (
                <TouchableOpacity onPress={() => setCategoryFilter(null)}>
                  <Text style={styles.clearFilterText}>Show All ✕</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#00BCD4" />
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyText}>
                No {categoryFilter || 'files'} found.
              </Text>
            </View>
          )
        }
        renderItem={renderFileItem}
      />

      {/* ── FAB BUTTON ────────────────────────────────────────────── */}
      <TouchableOpacity style={styles.fab} activeOpacity={0.8} onPress={() => {
        if (onOpenFileBrowser) onOpenFileBrowser();
        else {
          setExplorePath('C:\\');
          setExploreVisible(true);
        }
      }}>
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
      
      <FileExplorerModal
        visible={exploreVisible}
        initialPath={explorePath}
        serverUrl={serverUrl}
        token={token}
        onClose={() => setExploreVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F17',
  },

  /* ── Dark Glass Header ─── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.75)',
    borderRadius: 24,
    paddingHorizontal: 16,
    height: 46,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 10,
    opacity: 0.6,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#F8FAFC',
    fontWeight: '500',
  },
  searchSubmitBtn: {
    backgroundColor: '#00BCD4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: 6,
  },
  searchSubmitBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerBtn: {
    padding: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(30, 41, 59, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerBtnIcon: {
    fontSize: 17,
  },

  /* ── Category Circles ─── */
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  categoryItem: {
    alignItems: 'center',
  },
  circle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.65)',
    marginBottom: 7,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  circleIcon: {
    fontSize: 25,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 0.2,
  },
  categoryLabelActive: {
    color: '#F8FAFC',
    fontWeight: '800',
  },

  /* ── Sub-Tabs ─── */
  subTabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
  },
  subTabBtn: {
    paddingVertical: 13,
    marginRight: 24,
    position: 'relative',
  },
  subTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  subTabTextActive: {
    color: '#F8FAFC',
    fontWeight: '800',
  },
  subTabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#00BCD4',
    borderRadius: 2,
    shadowColor: '#00BCD4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 3,
  },

  /* ── File List & Storage Card ─── */
  storageCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.65)',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  storageCardInfo: {
    flex: 1,
  },
  storageCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  storageCardDesc: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 6,
  },
  storageCardTap: {
    fontSize: 12,
    color: '#00BCD4',
    fontWeight: '600',
  },
  fileList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 12,
  },
  dateHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.2,
  },
  clearFilterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#00BCD4',
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
    padding: 30,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
    padding: 36,
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    elevation: 2,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '600',
  },

  /* ── File Row Card ─── */
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 8,
    backgroundColor: 'rgba(30, 41, 59, 0.65)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  fileBadgeBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  fileBadgeText: {
    fontSize: 19,
    fontWeight: '700',
  },
  fileMetaBox: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 3,
    letterSpacing: -0.2,
  },
  fileDate: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  moreBtn: {
    padding: 8,
  },
  moreIcon: {
    fontSize: 20,
    color: '#64748B',
    fontWeight: '700',
  },

  /* ── FAB ─── */
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#00BCD4',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    shadowColor: '#00BCD4',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    zIndex: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  fabIcon: {
    fontSize: 30,
    color: '#0F172A',
    fontWeight: '700',
    marginTop: -2,
  },
});
