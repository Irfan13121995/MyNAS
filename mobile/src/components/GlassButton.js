/**
 * Glassmorphic Button with Gradient & Glow Effect
 */
import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

export default function GlassButton({
  title,
  onPress,
  variant = 'primary', // 'primary', 'secondary', 'danger', 'ghost'
  loading = false,
  icon = null,
  style,
  textStyle,
  disabled = false,
  ...props
}) {
  const { theme } = useTheme();

  let bg = theme.accent;
  let textCol = '#FFFFFF';
  let borderCol = 'transparent';

  if (variant === 'secondary') {
    bg = theme.glassCard;
    textCol = theme.textPrimary;
    borderCol = theme.glassBorder;
  } else if (variant === 'danger') {
    bg = theme.danger;
    textCol = '#FFFFFF';
  } else if (variant === 'ghost') {
    bg = 'transparent';
    textCol = theme.accent;
    borderCol = theme.glassBorder;
  }

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.btn,
        {
          backgroundColor: bg,
          borderColor: borderCol,
          opacity: disabled ? 0.45 : 1,
        },
        style
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={textCol} size="small" />
      ) : (
        <>
          {icon}
          <Text style={[styles.text, { color: textCol }, textStyle]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  text: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  }
});
