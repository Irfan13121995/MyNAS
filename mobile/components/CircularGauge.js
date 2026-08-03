import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function CircularGauge({ percentage = 0, size = 68, strokeWidth = 7 }) {
  const pct = Math.min(100, Math.max(0, percentage));

  let color = '#00BCD4'; // cyan
  if (pct > 85) {
    color = '#EF4444'; // red
  } else if (pct > 70) {
    color = '#F59E0B'; // yellow
  }

  // Pure React Native Ring — 100% Native compatibility, 0 external SVG dependencies!
  const topColor = color;
  const rightColor = pct >= 25 ? color : 'transparent';
  const bottomColor = pct >= 50 ? color : 'transparent';
  const leftColor = pct >= 75 ? color : 'transparent';

  return (
    <View style={[{ width: size, height: size }, styles.container]}>
      {/* Background Track Circle */}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: 'rgba(255, 255, 255, 0.08)',
          position: 'absolute',
        }}
      />
      {/* Active Arc Highlight Ring */}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: 'transparent',
          borderTopColor: topColor,
          borderRightColor: rightColor,
          borderBottomColor: bottomColor,
          borderLeftColor: leftColor,
          transform: [{ rotate: '-45deg' }],
          position: 'absolute',
        }}
      />
      {/* Center Percentage Label */}
      <View style={[StyleSheet.absoluteFill, styles.textContainer]}>
        <Text style={[styles.text, { color }]}>{Math.round(pct)}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 13,
    fontWeight: '800',
  },
});
