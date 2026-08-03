import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

let SvgModule = null;
let CircleModule = null;

try {
  const svgPkg = require('react-native-svg');
  SvgModule = svgPkg.default || svgPkg.Svg;
  CircleModule = svgPkg.Circle;
} catch (e) {
  console.warn('react-native-svg native module missing. Using React Native Ring fallback.');
}

export default function CircularGauge({ percentage = 0, size = 68, strokeWidth = 7 }) {
  const pct = Math.min(100, Math.max(0, percentage));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  let color = '#00BCD4'; // cyan
  if (pct > 85) {
    color = '#EF4444'; // red
  } else if (pct > 70) {
    color = '#F59E0B'; // yellow
  }

  // Fallback: Pure React Native Ring (works cleanly in Expo Go without native C++ module crashes)
  if (!SvgModule || !CircleModule) {
    return (
      <View style={[{ width: size, height: size }, styles.container]}>
        <View style={[{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: 'rgba(255, 255, 255, 0.1)',
          alignItems: 'center',
          justify: 'center'
        }, styles.container]}>
          <View style={{
            position: 'absolute',
            inset: 0,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
            borderColor: color,
            borderTopColor: pct > 25 ? color : 'transparent',
            borderRightColor: pct > 50 ? color : 'transparent',
            borderBottomColor: pct > 75 ? color : 'transparent',
            borderLeftColor: color,
            opacity: 0.9
          }} />
          <Text style={[styles.text, { color }]}>{Math.round(pct)}%</Text>
        </View>
      </View>
    );
  }

  try {
    const Svg = SvgModule;
    const Circle = CircleModule;
    return (
      <View style={[{ width: size, height: size }, styles.container]}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.textContainer]}>
          <Text style={[styles.text, { color }]}>{Math.round(pct)}%</Text>
        </View>
      </View>
    );
  } catch (err) {
    return (
      <View style={[{ width: size, height: size, borderRadius: size / 2, borderWidth: strokeWidth, borderColor: color }, styles.container]}>
        <Text style={[styles.text, { color }]}>{Math.round(pct)}%</Text>
      </View>
    );
  }
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
