import React, { useMemo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';

export default function BottomNav({ activeTab, onTabChange }) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const tabs = [
    { key: 'home', label: 'Home', icon: '🏠' },
    { key: 'storage', label: 'Storage', icon: '💾' },
    { key: 'library', label: 'Library', icon: '🖼️' },
    { key: 'control', label: 'Control', icon: '⚙️' },
  ];

  const handlePress = (key) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
    onTabChange(key);
  };

  return (
    <View style={styles.floatingWrapper} pointerEvents="box-none">
      <View style={styles.glassDock}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
              activeOpacity={0.65}
              onPress={() => handlePress(tab.key)}
            >
              {isActive && <View style={styles.activeGlow} />}
              <Text style={[styles.tabIcon, isActive && styles.tabIconActive]}>
                {tab.icon}
              </Text>
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
              {isActive && <View style={styles.activeDot} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const getStyles = (colors) => StyleSheet.create({
  floatingWrapper: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 26 : 18,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
  },
  glassDock: {
    flexDirection: 'row',
    width: '88%',
    height: 68,
    backgroundColor: colors.topbar,
    borderRadius: 34,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: colors.borderLight,
    elevation: 20,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
  },
  tabItem: {
    flex: 1,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    position: 'relative',
    marginHorizontal: 3,
  },
  tabItemActive: {
    backgroundColor: colors.accentBg,
  },
  activeGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 26,
    backgroundColor: colors.accentBg,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  tabIcon: {
    fontSize: 20,
    marginBottom: 2,
    opacity: 0.45,
  },
  tabIconActive: {
    opacity: 1,
    transform: [{ scale: 1.15 }],
  },
  tabLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: colors.accent,
    fontWeight: '800',
  },
  activeDot: {
    position: 'absolute',
    top: 2,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accent,
    elevation: 2,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 3,
  },
});
