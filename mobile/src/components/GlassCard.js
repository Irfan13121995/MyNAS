/**
 * Frosted Glass Card Container
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

export default function GlassCard({ children, style, active = false, ...props }) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.glassCard,
          borderColor: active ? theme.glassBorderActive : theme.glassBorder,
          shadowColor: theme.shadowColor,
        },
        style
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1.2,
    padding: 16,
    marginVertical: 6,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 4,
    overflow: 'hidden',
  }
});
