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
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';

const { width, height } = Dimensions.get('window');

export default function FileViewer({ file, serverUrl, token, onClose }) {
  const [loading, setLoading] = useState(true);
  const [textContent, setTextContent] = useState('');
  
  const ext = (file.ext || '').toLowerCase();
  const streamUrl = `${serverUrl}/api/stream?path=${encodeURIComponent(file.path)}&token=${token}`;

  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv'];
  const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac'];
  const textExtensions = ['.txt', '.json', '.log', '.html', '.css', '.js', '.md', '.ini', '.csv'];

  const isImage = imageExtensions.includes(ext);
  const isVideo = videoExtensions.includes(ext);
  const isAudio = audioExtensions.includes(ext);
  const isText = textExtensions.includes(ext);

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
      if (!response.ok) {
        throw new Error('Failed to retrieve file contents');
      }
      const text = await response.text();
      setTextContent(text);
    } catch (err) {
      Alert.alert('Error', 'Could not load text file content: ' + err.message);
      setTextContent('Error loading content.');
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4285F4" />
          <Text style={styles.loadingText}>Buffering...</Text>
        </View>
      );
    }

    if (isImage) {
      return (
        <View style={styles.mediaContainer}>
          <Image
            source={{ uri: streamUrl }}
            style={styles.image}
            resizeMode="contain"
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
          />
        </View>
      );
    }

    if (isVideo) {
      return (
        <View style={styles.mediaContainer}>
          <Video
            source={{ uri: streamUrl }}
            rate={1.0}
            volume={1.0}
            isMuted={false}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={true}
            useNativeControls
            style={styles.video}
            onError={(err) => Alert.alert('Playback Error', 'Failed to play video: ' + err)}
          />
        </View>
      );
    }

    if (isAudio) {
      return (
        <View style={styles.audioContainer}>
          <Text style={styles.audioIcon}>🎵</Text>
          <Text style={styles.audioName}>{file.name}</Text>
          <Video
            source={{ uri: streamUrl }}
            rate={1.0}
            volume={1.0}
            isMuted={false}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={true}
            useNativeControls
            audioOnly
            style={styles.audioPlayer}
            onError={(err) => Alert.alert('Playback Error', 'Failed to play audio: ' + err)}
          />
        </View>
      );
    }

    if (isText) {
      return (
        <ScrollView style={styles.textContainer} contentContainerStyle={styles.textScrollContent}>
          <Text style={styles.textContent}>{textContent}</Text>
        </ScrollView>
      );
    }

    // Fallback for unsupported formats
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.unsupportedIcon}>❓</Text>
        <Text style={styles.unsupportedText}>Preview not supported for this file format.</Text>
        <Text style={styles.fileName}>{file.name}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Immersive Top Bar */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>✕ Close</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {file.name}
        </Text>
        <View style={{ width: 60 }} /> {/* Spacer to center title */}
      </View>

      {/* Main View Area */}
      <View style={styles.body}>{renderContent()}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000', // Immersive pure black background
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: '#111',
    backgroundColor: '#0a0a0a',
  },
  closeBtn: {
    backgroundColor: '#222',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  closeBtnText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: 'bold',
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
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
    padding: 30,
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
    marginTop: 10,
  },
  mediaContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: width,
    height: height - 120,
  },
  video: {
    width: width,
    height: 300,
    backgroundColor: '#050505',
  },
  audioContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  audioIcon: {
    fontSize: 80,
    marginBottom: 20,
  },
  audioName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
  },
  audioPlayer: {
    width: width - 40,
    height: 45,
    backgroundColor: '#0a0a0a',
  },
  textContainer: {
    flex: 1,
    backgroundColor: '#050505',
    padding: 15,
  },
  textScrollContent: {
    paddingBottom: 40,
  },
  textContent: {
    color: '#00FF00', // Classic terminal green on dark green background
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 13,
    lineHeight: 18,
  },
  unsupportedIcon: {
    fontSize: 64,
    marginBottom: 15,
  },
  unsupportedText: {
    color: '#aaa',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  fileName: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
  }
});
