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

  const half = size / 2;
  const theta = (pct / 100) * 360;

  // Right half covers 0 to 180 degrees (0% to 50%)
  const rightAngle = Math.min(180, theta) - 135;

  // Left half covers 180 to 360 degrees (50% to 100%)
  const hasLeftHalf = theta > 180;
  const leftAngle = hasLeftHalf ? (theta - 180) - 135 : -135;

  // Display text: accurate fractional display if 0 < pct < 1
  const displayText = pct === 0 ? '0%' : (pct < 1 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`);

  return (
    <View style={[{ width: size, height: size }, styles.container]}>
      {/* Background Track Circle */}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: half,
          borderWidth: strokeWidth,
          borderColor: 'rgba(255, 255, 255, 0.08)',
          position: 'absolute',
        }}
      />

      {/* Right Half Arc (0% - 50%) */}
      {pct > 0 && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: half,
            width: half,
            height: size,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: size,
              height: size,
              borderRadius: half,
              borderWidth: strokeWidth,
              borderColor: 'transparent',
              borderTopColor: color,
              borderRightColor: color,
              position: 'absolute',
              top: 0,
              left: -half,
              transform: [{ rotate: `${rightAngle}deg` }],
            }}
          />
        </View>
      )}

      {/* Left Half Arc (50% - 100%) */}
      {hasLeftHalf && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: half,
            height: size,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: size,
              height: size,
              borderRadius: half,
              borderWidth: strokeWidth,
              borderColor: 'transparent',
              borderBottomColor: color,
              borderLeftColor: color,
              position: 'absolute',
              top: 0,
              left: 0,
              transform: [{ rotate: `${leftAngle}deg` }],
            }}
          />
        </View>
      )}

      {/* Center Percentage Label */}
      <View style={[StyleSheet.absoluteFill, styles.textContainer]} pointerEvents="none">
        <Text style={[styles.text, { color, fontSize: size < 55 ? 10 : 12 }]}>
          {displayText}
        </Text>
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
    fontWeight: '800',
  },
});
