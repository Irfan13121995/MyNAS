import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet, View, Text, TextInput, ScrollView, TouchableOpacity,
  FlatList, ActivityIndicator, RefreshControl, Alert, Platform, StatusBar
} from 'react-native';
import CircularGauge from './CircularGauge';
import FileExplorerModal from './FileExplorerModal';
import { cacheService } from '../services/cacheService';
import { useTheme } from '../contexts/ThemeContext';

export default function HomeScreen({ serverUrl, token, onSelectFile, onOpenFileBrowser, onOpenLibrary }) {
  const { themeMode, setThemeMode, colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
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

  useEffect(() => {
    // Theme is now loaded in ThemeContext
  }, []);

  const cycleTheme = async () => {
    const nextTheme = themeMode === 'dark' ? 'light' : themeMode === 'light' ? 'system' : 'dark';
    setThemeMode(nextTheme);
    Alert.alert('App Theme Mode', `Theme preference set to ${nextTheme.toUpperCase()}`);
  };

  const getThemeIcon = () => {
    if (themeMode === 'light') return '☀️';
    if (themeMode === 'dark') return '🌙';
    return '🌓';
  };

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
      return { icon: '📄', bg: colors.accentBg, color: colors.accent };
    }
    if (ext.match(/\.(mp3|wav|flac|m4a)$/i) || item.type === 'audio') {
      return { icon: '🎵', bg: colors.accentBg, color: colors.accentLight };
    }
    if (ext.match(/\.(mp4|mkv|mov|avi|webm)$/i) || item.type === 'video') {
      return { icon: '▶', bg: colors.accentBg, color: colors.accent };
    }
    if (item.isDirectory) {
      return { icon: '📁', bg: colors.accentBg, color: colors.warning };
    }
    return { icon: '📄', bg: colors.accentBg, color: colors.textSecondary };
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
    { key: 'photos', label: 'Photos', icon: '🖼️', activeGlow: colors.accentBorder, activeBorder: colors.accent },
    { key: 'docs', label: 'Documents', icon: '📄', activeGlow: colors.accentBorder, activeBorder: colors.warning },
    { key: 'audio', label: 'Audio', icon: '🎵', activeGlow: colors.accentBorder, activeBorder: colors.accent },
    { key: 'video', label: 'Videos', icon: '🎬', activeGlow: colors.accentBorder, activeBorder: colors.accent },
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
            placeholderTextColor={colors.textMuted}
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
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Text style={styles.searchSubmitBtnText}>Search</Text>
              )}
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.headerBtn} onPress={() => Alert.alert('Activity Log', 'NAS File synchronization active.')}>
          <Text style={styles.headerBtnIcon}>📋</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerBtn} onPress={cycleTheme}>
          <Text style={styles.headerBtnIcon}>{getThemeIcon()}</Text>
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
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
              <ActivityIndicator size="large" color={colors.accent} />
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

const getStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  /* ── Dark Glass Header ─── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 10,
    backgroundColor: colors.topbar,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    elevation: 4,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 24,
    paddingHorizontal: 16,
    height: 46,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 10,
    opacity: 0.6,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  searchSubmitBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: 6,
  },
  searchSubmitBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.background,
  },
  headerBtn: {
    padding: 10,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderLight,
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
    backgroundColor: colors.topbar,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  categoryItem: {
    alignItems: 'center',
  },
  circle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    marginBottom: 7,
    elevation: 3,
    shadowColor: colors.shadow,
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
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
  categoryLabelActive: {
    color: colors.textPrimary,
    fontWeight: '800',
  },

  /* ── Sub-Tabs ─── */
  subTabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingHorizontal: 16,
    backgroundColor: colors.topbar,
  },
  subTabBtn: {
    paddingVertical: 13,
    marginRight: 24,
    position: 'relative',
  },
  subTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  subTabTextActive: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  subTabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: colors.accent,
    borderRadius: 2,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 3,
  },

  /* ── File List & Storage Card ─── */
  storageCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
  },
  storageCardInfo: {
    flex: 1,
  },
  storageCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  storageCardDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  storageCardTap: {
    fontSize: 12,
    color: colors.accent,
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
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  clearFilterText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
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
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 2,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },

  /* ── File Row Card ─── */
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 8,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 3,
    shadowColor: colors.shadow,
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
    color: colors.textPrimary,
    marginBottom: 3,
    letterSpacing: -0.2,
  },
  fileDate: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
  moreBtn: {
    padding: 8,
  },
  moreIcon: {
    fontSize: 20,
    color: colors.textMuted,
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
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    zIndex: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  fabIcon: {
    fontSize: 30,
    color: colors.background,
    fontWeight: '700',
    marginTop: -2,
  },
});
