import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  SafeAreaView,
  Alert,
  Platform,
  Linking,
} from 'react-native';

// expo-av is NOT used here — it requires native compilation (dev build only).
// For Expo Go compatibility, videos show a stream link & open in system player via Linking.

const { width, height } = Dimensions.get('window');

export default function FileViewer({ file, serverUrl, token, onClose }) {
  const [loading, setLoading] = useState(true);
  const [textContent, setTextContent] = useState('');

  const ext = (file.ext || '').toLowerCase();
  const streamUrl = `${serverUrl}/api/stream?path=${encodeURIComponent(file.path)}&token=${token}`;

  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'];
  const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];
  const textExtensions = ['.txt', '.json', '.log', '.html', '.css', '.js', '.md', '.ini', '.csv'];

  const isImage = imageExtensions.includes(ext);
  const isVideo = videoExtensions.includes(ext);
  const isAudio = audioExtensions.includes(ext);
  const isText  = textExtensions.includes(ext);

  useEffect(() => {
    if (isText) {
      fetchText();
    } else {
      setLoading(false);
    }
  }, [file]);

  const fetchText = async () => {
    try {
      const response = await fetch(streamUrl);
      if (!response.ok) throw new Error('Failed to retrieve file contents');
      const text = await response.text();
      setTextContent(text);
    } catch (err) {
      Alert.alert('Error', 'Could not load text file: ' + err.message);
      setTextContent('Error loading content.');
    } finally {
      setLoading(false);
    }
  };

  const openInSystemPlayer = () => {
    Linking.openURL(streamUrl).catch(() =>
      Alert.alert('Cannot Open', 'No app available to play this file on your device.')
    );
  };

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4285F4" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      );
    }

    // ── IMAGE ────────────────────────────────────────────────────────────────
    if (isImage) {
      return (
        <View style={styles.mediaContainer}>
          <Image
            source={{ uri: streamUrl }}
            style={styles.image}
            resizeMode="contain"
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              Alert.alert('Image Error', 'Could not load image from NAS.');
            }}
          />
        </View>
      );
    }

    // ── VIDEO (open in system player — no expo-av native module needed) ─────
    if (isVideo) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.mediaTypeIcon}>🎬</Text>
          <Text style={styles.mediaFileName} numberOfLines={2}>{file.name}</Text>
          <Text style={styles.mediaHint}>
            Video playback requires your device's media player.
          </Text>
          <TouchableOpacity style={styles.openBtn} onPress={openInSystemPlayer} activeOpacity={0.85}>
            <Text style={styles.openBtnText}>▶  Play in System Player</Text>
          </TouchableOpacity>
          <Text style={styles.urlHint}>{streamUrl}</Text>
        </View>
      );
    }

    // ── AUDIO (open in system player) ────────────────────────────────────────
    if (isAudio) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.mediaTypeIcon}>🎵</Text>
          <Text style={styles.mediaFileName} numberOfLines={2}>{file.name}</Text>
          <Text style={styles.mediaHint}>
            Tap below to play this audio file on your device.
          </Text>
          <TouchableOpacity style={styles.openBtn} onPress={openInSystemPlayer} activeOpacity={0.85}>
            <Text style={styles.openBtnText}>▶  Open in Music Player</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // ── TEXT FILE VIEWER ──────────────────────────────────────────────────────
    if (isText) {
      return (
        <ScrollView style={styles.textContainer} contentContainerStyle={styles.textScrollContent}>
          <Text style={styles.textContent}>{textContent}</Text>
        </ScrollView>
      );
    }

    // ── UNSUPPORTED FALLBACK ──────────────────────────────────────────────────
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.mediaTypeIcon}>📄</Text>
        <Text style={styles.unsupportedText}>Preview not available for this file type.</Text>
        <Text style={styles.mediaFileName}>{file.name}</Text>
        <TouchableOpacity style={[styles.openBtn, { marginTop: 20 }]} onPress={openInSystemPlayer} activeOpacity={0.85}>
          <Text style={styles.openBtnText}>Open with System App</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>✕ Close</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{file.name}</Text>
        <View style={{ width: 70 }} />
      </View>

      {/* Content */}
      <View style={styles.body}>{renderContent()}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#1a1a1a',
    backgroundColor: '#111111',
  },
  closeBtn: {
    backgroundColor: '#222',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  closeBtnText: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '700',
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginHorizontal: 10,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
    marginTop: 12,
  },
  mediaContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  image: {
    width: width,
    height: height - 120,
  },
  mediaTypeIcon: {
    fontSize: 72,
    marginBottom: 16,
  },
  mediaFileName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  mediaHint: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  openBtn: {
    backgroundColor: '#1A73E8',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginBottom: 16,
  },
  openBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  urlHint: {
    color: '#444',
    fontSize: 10,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  unsupportedText: {
    color: '#aaa',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 8,
  },
  textContainer: {
    flex: 1,
    backgroundColor: '#050505',
    padding: 16,
  },
  textScrollContent: {
    paddingBottom: 40,
  },
  textContent: {
    color: '#00FF88',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
});
