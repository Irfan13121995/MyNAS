/**
 * Frosted Glass Bottom Navigation Bar
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';

export default function GlassTabBar({ activeTab, onTabChange }) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '⚡' },
    { id: 'queue', label: 'Queue', icon: '📥' },
    { id: 'settings', label: 'Settings', icon: '⚙️' }
  ];

  return (
    <View
      style={[
        styles.tabBar,
        {
          backgroundColor: theme.tabBarBg,
          borderTopColor: theme.glassBorder,
          paddingBottom: Math.max(insets.bottom, 10),
        }
      ]}
    >
      {tabs.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            activeOpacity={0.7}
            onPress={() => onTabChange(tab.id)}
            style={styles.tabBtn}
          >
            <Text style={{ fontSize: 20 }}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, { color: isActive ? theme.accent : theme.textMuted, fontWeight: isActive ? '800' : '500' }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 8,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabLabel: {
    fontSize: 11,
  }
});
