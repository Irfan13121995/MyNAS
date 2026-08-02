import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';

export default function BottomNav({ activeTab, onTabChange }) {
  const tabs = [
    { key: 'home', label: 'Home', icon: '🏠' },
    { key: 'storage', label: 'Storage', icon: '💾' },
    { key: 'library', label: 'Library', icon: '🖼️' },
    { key: 'control', label: 'Control', icon: '⚙️' },
  ];

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
              onPress={() => onTabChange(tab.key)}
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

const styles = StyleSheet.create({
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
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderRadius: 34,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    elevation: 20,
    shadowColor: '#000000',
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
    backgroundColor: 'rgba(0, 188, 212, 0.15)',
  },
  activeGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 26,
    backgroundColor: 'rgba(0, 188, 212, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 188, 212, 0.2)',
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
    color: 'rgba(148, 163, 184, 0.7)',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: '#00BCD4',
    fontWeight: '800',
  },
  activeDot: {
    position: 'absolute',
    top: 2,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#00BCD4',
    elevation: 2,
    shadowColor: '#00BCD4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 3,
  },
});
