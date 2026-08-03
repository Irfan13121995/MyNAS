import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity,
  ScrollView, ActivityIndicator, Dimensions, SafeAreaView,
  Alert, Linking, Platform, Modal, StatusBar, Share,
  TouchableWithoutFeedback, FlatList
} from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';

const { width, height } = Dimensions.get('window');

function normalizeExt(file) {
  if (!file) return '';
  let ext = file.ext || '';
  if (!ext && file.name) {
    const parts = file.name.split('.');
    ext = parts.length > 1 ? parts.pop() : '';
  }
  ext = ext.toLowerCase().replace(/^\.*/, '');
  return ext ? '.' + ext : '';
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.tiff', '.svg']);
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp', '.ts']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']);
const TEXT_EXTS  = new Set(['.txt', '.json', '.log', '.html', '.css', '.js', '.md', '.ini', '.csv']);

function NativeVideoPlayer({ streamUrl }) {
  const player = useVideoPlayer(streamUrl, player => {
    player.loop = false;
    player.play();
  });

  return (
    <View style={styles.videoWrapper}>
      <VideoView
        style={styles.videoView}
        player={player}
        allowsFullscreen
        allowsPictureInPicture
        startsPictureInPictureAutomatically={false}
      />
    </View>
  );
}

export default function FileViewerModal({ file, mediaList = [], serverUrl, token, onClose }) {
  const [loading, setLoading] = useState(true);
  const [textContent, setTextContent] = useState('');
  const [imageError, setImageError] = useState(false);
  const [isStarred, setIsStarred] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showEditor, setShowEditor] = useState(false);

  // Active item list & index
  const items = (mediaList && mediaList.length > 0) ? mediaList : (file ? [file] : []);
  const initialIndex = items.findIndex(m => m.path === file?.path);
  const [currentIndex, setCurrentIndex] = useState(initialIndex >= 0 ? initialIndex : 0);

  const flatListRef = useRef(null);

  // Pinch-to-zoom & Double-tap Zoom State
  const [zoomScale, setZoomScale] = useState(1);
  const lastTapRef = useRef(0);

  // Photo Editor State
  const [rotation, setRotation] = useState(0);
  const [filter, setFilter] = useState('none');
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [brightness, setBrightness] = useState(1);

  const currentFile = items[currentIndex] || file;

  if (!currentFile) return null;

  const ext = normalizeExt(currentFile);
  const streamUrl = `${serverUrl}/api/stream?path=${encodeURIComponent(currentFile.path)}&token=${token}`;

  const isImage = IMAGE_EXTS.has(ext) || currentFile.isImage;
  const isVideo = VIDEO_EXTS.has(ext) || currentFile.isVideo;
  const isAudio = AUDIO_EXTS.has(ext);
  const isText  = TEXT_EXTS.has(ext);

  useEffect(() => {
    setImageError(false);
    setZoomScale(1);
    setRotation(0);
    setFilter('none');
    setFlipH(false);
    setFlipV(false);
    setBrightness(1);

    if (isText) {
      fetchText();
    } else {
      setLoading(false);
    }
  }, [currentIndex, file]);

  useEffect(() => {
    // Prefetch adjacent images for smooth swiping
    if (items && items.length > 1) {
      [currentIndex - 1, currentIndex + 1, currentIndex + 2].forEach(idx => {
        if (idx >= 0 && idx < items.length) {
          const item = items[idx];
          const uri = `${serverUrl}/api/stream?path=${encodeURIComponent(item.path)}&token=${token}`;
          if (uri) Image.prefetch(uri);
        }
      });
    }
  }, [currentIndex, items, serverUrl, token]);

  const fetchText = async () => {
    try {
      const response = await fetch(streamUrl);
      if (!response.ok) throw new Error('Failed to retrieve file contents');
      const text = await response.text();
      setTextContent(text);
    } catch (err) {
      setTextContent('Error loading content: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDoubleTap = () => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      setZoomScale(prev => (prev > 1 ? 1 : 2.5));
    }
    lastTapRef.current = now;
  };

  const zoomIn = () => setZoomScale(prev => Math.min(5, parseFloat((prev + 0.5).toFixed(1))));
  const zoomOut = () => setZoomScale(prev => Math.max(1, parseFloat((prev - 0.5).toFixed(1))));
  const resetZoom = () => setZoomScale(1);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Sharing ${currentFile.name} from Personal NAS:\n${streamUrl}`,
        url: streamUrl,
        title: currentFile.name,
      });
    } catch (error) {
      Alert.alert('Share Failed', error.message);
    }
  };

  const openInExternalPlayer = () => {
    Linking.openURL(streamUrl).catch(() =>
      Alert.alert('Cannot Open', 'No external app available to handle this file on your device.')
    );
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return 'Unknown size';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getImageTransformStyle = React.useCallback(() => {
    const transforms = [];
    if (zoomScale !== 1) transforms.push({ scale: zoomScale });
    if (rotation !== 0) transforms.push({ rotate: `${rotation}deg` });
    if (flipH) transforms.push({ scaleX: -1 });
    if (flipV) transforms.push({ scaleY: -1 });

    return {
      transform: transforms,
      opacity: brightness,
    };
  }, [zoomScale, rotation, flipH, flipV, brightness]);

  const statusBarPadding = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 16;

  const onScrollEnd = (e) => {
    const contentOffsetX = e.nativeEvent.contentOffset.x;
    const newIdx = Math.round(contentOffsetX / width);
    if (newIdx >= 0 && newIdx < items.length && newIdx !== currentIndex) {
      setCurrentIndex(newIdx);
    }
  };

  const renderSingleMediaItem = React.useCallback(({ item }) => {
    const itemExt = normalizeExt(item);
    const itemStreamUrl = `${serverUrl}/api/stream?path=${encodeURIComponent(item.path)}&token=${token}`;
    const itemIsImage = IMAGE_EXTS.has(itemExt) || item.isImage;
    const itemIsVideo = VIDEO_EXTS.has(itemExt) || item.isVideo;

    if (itemIsImage) {
      return (
        <View style={styles.imageCanvas}>
          <ScrollView
            style={styles.zoomScrollView}
            contentContainerStyle={styles.zoomContentContainer}
            minimumZoomScale={1}
            maximumZoomScale={5}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            centerContent={true}
            bouncesZoom={true}
            pinchGestureEnabled={true}
          >
            <TouchableWithoutFeedback onPress={handleDoubleTap}>
              <Image
                source={{ uri: itemStreamUrl }}
                style={[styles.fullImage, getImageTransformStyle()]}
                contentFit="contain"
                transition={150}
                cachePolicy="disk"
                onError={() => setImageError(true)}
              />
            </TouchableWithoutFeedback>
          </ScrollView>
        </View>
      );
    }

    if (itemIsVideo) {
      return <NativeVideoPlayer streamUrl={itemStreamUrl} />;
    }

    return (
      <View style={styles.centerBox}>
        <Text style={{ fontSize: 56, marginBottom: 12 }}>📄</Text>
        <Text style={styles.mediaTitle}>{item.name}</Text>
        <Text style={styles.mediaSub}>{itemExt.toUpperCase()} Document</Text>
      </View>
    );
  }, [serverUrl, token, getImageTransformStyle]);

  return (
    <Modal
      visible={!!file}
      animationType="fade"
      transparent={false}
      statusBarTranslucent={true}
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      hardwareAccelerated={true}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0B0F17" />

      <View style={styles.container}>
        {/* ── DARK GLASS TOP TOOLBAR ─────────────────────────────────── */}
        <View style={[styles.topBar, { paddingTop: statusBarPadding }]}>
          <TouchableOpacity style={styles.topBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.topBtnIcon}>←</Text>
          </TouchableOpacity>

          <View style={styles.topTitleBox}>
            <Text style={styles.topTitle} numberOfLines={1}>{currentFile.name}</Text>
            <Text style={styles.topSubTitle}>
              {items.length > 1 ? `${currentIndex + 1} of ${items.length} • ` : ''}
              {currentFile.modifiedAt ? new Date(currentFile.modifiedAt).toLocaleDateString() : 'Personal NAS Media'}
            </Text>
          </View>

          <View style={styles.topRightActions}>
            <TouchableOpacity
              style={styles.topBtn}
              onPress={() => setIsStarred(!isStarred)}
              activeOpacity={0.7}
            >
              <Text style={styles.topBtnIcon}>{isStarred ? '⭐' : '☆'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.topBtn}
              onPress={() => setShowInfo(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.topBtnIcon}>ℹ️</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.topBtn}
              onPress={handleShare}
              activeOpacity={0.7}
            >
              <Text style={styles.topBtnIcon}>📤</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── MAIN MEDIA CANVAS / HORIZONTAL SWIPE FLATLIST ───────────────────────────── */}
        <View style={styles.body}>
          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color="#00BCD4" />
              <Text style={styles.loadingText}>Opening media…</Text>
            </View>
          ) : isImage && zoomScale === 1 && items.length > 1 ? (
            <>
              {/* Floating Zoom Control Pill */}
              <View style={styles.zoomControlBar}>
                <TouchableOpacity style={styles.zoomBtn} onPress={zoomOut} activeOpacity={0.7}>
                  <Text style={styles.zoomBtnText}>−</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.zoomBtnLabel} onPress={resetZoom} activeOpacity={0.7}>
                  <Text style={styles.zoomScaleText}>{zoomScale}x</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.zoomBtn} onPress={zoomIn} activeOpacity={0.7}>
                  <Text style={styles.zoomBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              <FlatList
                ref={flatListRef}
                data={items}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item, index) => item.path || index.toString()}
                initialScrollIndex={initialIndex >= 0 ? initialIndex : 0}
                getItemLayout={(data, index) => ({ length: width, offset: width * index, index })}
                onMomentumScrollEnd={onScrollEnd}
                renderItem={renderSingleMediaItem}
                windowSize={3}
                removeClippedSubviews={true}
                maxToRenderPerBatch={3}
                initialNumToRender={1}
              />
            </>
          ) : isImage ? (
            <View style={styles.imageCanvas}>
              {/* Floating Zoom Control Pill */}
              <View style={styles.zoomControlBar}>
                <TouchableOpacity style={styles.zoomBtn} onPress={zoomOut} activeOpacity={0.7}>
                  <Text style={styles.zoomBtnText}>−</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.zoomBtnLabel} onPress={resetZoom} activeOpacity={0.7}>
                  <Text style={styles.zoomScaleText}>{zoomScale}x</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.zoomBtn} onPress={zoomIn} activeOpacity={0.7}>
                  <Text style={styles.zoomBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.zoomScrollView}
                contentContainerStyle={styles.zoomContentContainer}
                minimumZoomScale={1}
                maximumZoomScale={5}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                centerContent={true}
                bouncesZoom={true}
                pinchGestureEnabled={true}
              >
                <TouchableWithoutFeedback onPress={handleDoubleTap}>
                  <Image
                    source={{ uri: streamUrl }}
                    style={[styles.fullImage, getImageTransformStyle()]}
                    contentFit="contain"
                    transition={150}
                    cachePolicy="disk"
                    onError={() => setImageError(true)}
                  />
                </TouchableWithoutFeedback>
              </ScrollView>
            </View>
          ) : isVideo ? (
            <NativeVideoPlayer streamUrl={streamUrl} />
          ) : isAudio ? (
            <View style={styles.centerBox}>
              <View style={styles.audioDisk}>
                <Text style={{ fontSize: 48 }}>🎵</Text>
              </View>
              <Text style={styles.mediaTitle}>{currentFile.name}</Text>
              <Text style={styles.mediaSub}>Inbuilt Audio Player</Text>
              <NativeVideoPlayer streamUrl={streamUrl} />
            </View>
          ) : isText ? (
            <ScrollView style={styles.textBox}>
              <Text style={styles.textContent}>{textContent}</Text>
            </ScrollView>
          ) : (
            <View style={styles.centerBox}>
              <Text style={{ fontSize: 56, marginBottom: 12 }}>📄</Text>
              <Text style={styles.mediaTitle}>{currentFile.name}</Text>
              <Text style={styles.mediaSub}>{ext.toUpperCase()} Document</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={openInExternalPlayer}>
                <Text style={styles.primaryBtnText}>Open with External App</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── FLOATING GLASS BOTTOM ACTION DOCK ───────────────────────────────── */}
        <View style={styles.bottomDockWrapper} pointerEvents="box-none">
          <View style={styles.glassDock}>
            <TouchableOpacity style={styles.dockItem} onPress={handleShare} activeOpacity={0.65}>
              <Text style={styles.dockIcon}>📤</Text>
              <Text style={styles.dockLabel}>Share</Text>
            </TouchableOpacity>

            {isImage && (
              <TouchableOpacity
                style={styles.dockItem}
                onPress={() => setShowEditor(true)}
                activeOpacity={0.65}
              >
                <Text style={styles.dockIcon}>✏️</Text>
                <Text style={styles.dockLabel}>Edit</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.dockItem}
              onPress={() => setShowInfo(true)}
              activeOpacity={0.65}
            >
              <Text style={styles.dockIcon}>ℹ️</Text>
              <Text style={styles.dockLabel}>Details</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.dockItem} onPress={openInExternalPlayer} activeOpacity={0.65}>
              <Text style={styles.dockIcon}>🔗</Text>
              <Text style={styles.dockLabel}>Open In…</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── MEDIA DETAILS SHEET ─────────────────────────── */}
        {showInfo && (
          <Modal visible={showInfo} animationType="slide" transparent={true} onRequestClose={() => setShowInfo(false)}>
            <View style={styles.modalBg}>
              <View style={styles.infoSheet}>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>Media Details</Text>
                  <TouchableOpacity onPress={() => setShowInfo(false)}>
                    <Text style={styles.sheetClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>File Name</Text>
                  <Text style={styles.infoValue}>{currentFile.name}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>File Format</Text>
                  <Text style={styles.infoValue}>{ext.toUpperCase() || 'UNKNOWN'}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Size</Text>
                  <Text style={styles.infoValue}>{formatFileSize(currentFile.size)}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>NAS Path</Text>
                  <Text style={styles.infoCode}>{currentFile.path}</Text>
                </View>

                {currentFile.modifiedAt && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Modified Date</Text>
                    <Text style={styles.infoValue}>{new Date(currentFile.modifiedAt).toLocaleString()}</Text>
                  </View>
                )}

                <TouchableOpacity style={styles.sheetDoneBtn} onPress={() => setShowInfo(false)}>
                  <Text style={styles.sheetDoneText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}

        {/* ── PHOTO EDITOR (MODAL) ────────────────────── */}
        {showEditor && (
          <Modal visible={showEditor} animationType="slide" transparent={true} onRequestClose={() => setShowEditor(false)}>
            <View style={styles.editorContainer}>
              <View style={[styles.editorHeader, { paddingTop: statusBarPadding }]}>
                <TouchableOpacity onPress={() => setShowEditor(false)}>
                  <Text style={styles.editorCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.editorTitle}>Photo Editor</Text>
                <TouchableOpacity onPress={() => {
                  Alert.alert('Photo Saved', 'Edits applied to photo preview!');
                  setShowEditor(false);
                }}>
                  <Text style={styles.editorSave}>Save</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.editorCanvas}>
                <Image
                  source={{ uri: streamUrl }}
                  style={[styles.fullImage, getImageTransformStyle()]}
                  contentFit="contain"
                  transition={150}
                  cachePolicy="disk"
                />
              </View>

              <View style={styles.editorControls}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.editorToolRow}>
                  <TouchableOpacity
                    style={styles.toolChip}
                    onPress={() => setRotation((prev) => (prev + 90) % 360)}
                  >
                    <Text style={styles.chipIcon}>🔄</Text>
                    <Text style={styles.chipLabel}>Rotate ({rotation}°)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.toolChip, flipH && styles.toolChipActive]}
                    onPress={() => setFlipH(!flipH)}
                  >
                    <Text style={styles.chipIcon}>↔️</Text>
                    <Text style={styles.chipLabel}>Flip H</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.toolChip, flipV && styles.toolChipActive]}
                    onPress={() => setFlipV(!flipV)}
                  >
                    <Text style={styles.chipIcon}>↕️</Text>
                    <Text style={styles.chipLabel}>Flip V</Text>
                  </TouchableOpacity>

                  {[
                    { id: 'none', label: 'Original' },
                    { id: 'vivid', label: 'Vivid 🌸' },
                    { id: 'warm', label: 'Warm ☀️' },
                    { id: 'cool', label: 'Cool ❄️' },
                    { id: 'bw', label: 'B&W 🖤' },
                    { id: 'sepia', label: 'Sepia 📜' },
                  ].map(f => (
                    <TouchableOpacity
                      key={f.id}
                      style={[styles.toolChip, filter === f.id && styles.toolChipActive]}
                      onPress={() => setFilter(f.id)}
                    >
                      <Text style={styles.chipLabel}>{f.label}</Text>
                    </TouchableOpacity>
                  ))}

                  <TouchableOpacity
                    style={styles.toolChip}
                    onPress={() => {
                      setRotation(0);
                      setFilter('none');
                      setFlipH(false);
                      setFlipV(false);
                      setBrightness(1);
                    }}
                  >
                    <Text style={styles.chipIcon}>↩️</Text>
                    <Text style={styles.chipLabel}>Reset</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F17',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    zIndex: 10,
  },
  topBtn: {
    padding: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(30, 41, 59, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  topBtnIcon: {
    color: '#F8FAFC',
    fontSize: 18,
  },
  topTitleBox: {
    flex: 1,
    marginHorizontal: 12,
  },
  topTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  topSubTitle: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 1,
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  body: {
    flex: 1,
    backgroundColor: '#0B0F17',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerBox: {
    flex: 1,
    width: width,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
  },
  imageCanvas: {
    width: width,
    height: height - 140,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0B0F17',
    position: 'relative',
  },
  zoomScrollView: {
    width: width,
    height: height - 140,
  },
  zoomContentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: width,
    height: height - 160,
  },
  zoomControlBar: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    zIndex: 20,
    elevation: 6,
  },
  zoomBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
  },
  zoomBtnLabel: {
    paddingHorizontal: 12,
  },
  zoomScaleText: {
    color: '#00BCD4',
    fontSize: 12,
    fontWeight: '800',
  },
  videoWrapper: {
    flex: 1,
    width: width,
    height: height - 140,
    backgroundColor: '#0B0F17',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoView: {
    width: width,
    height: height * 0.75,
  },
  audioDisk: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  mediaTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  mediaSub: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: '#00BCD4',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 16,
    marginTop: 10,
  },
  primaryBtnText: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 14,
  },
  textBox: {
    flex: 1,
    padding: 20,
    backgroundColor: '#0F172A',
    width: width,
  },
  textContent: {
    color: '#38BDF8',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
  bottomDockWrapper: {
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
  dockItem: {
    flex: 1,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    position: 'relative',
    marginHorizontal: 3,
  },
  dockIcon: {
    fontSize: 20,
    marginBottom: 2,
    opacity: 0.85,
  },
  dockLabel: {
    color: 'rgba(148, 163, 184, 0.9)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  infoSheet: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    paddingBottom: 12,
  },
  sheetTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
  },
  sheetClose: {
    color: '#94A3B8',
    fontSize: 18,
  },
  infoRow: {
    marginBottom: 12,
  },
  infoLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
  infoCode: {
    color: '#00BCD4',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  sheetDoneBtn: {
    backgroundColor: '#00BCD4',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  sheetDoneText: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 14,
  },
  editorContainer: {
    flex: 1,
    backgroundColor: '#0B0F17',
  },
  editorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  editorCancel: {
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: '600',
  },
  editorTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
  },
  editorSave: {
    color: '#00BCD4',
    fontSize: 15,
    fontWeight: '800',
  },
  editorCanvas: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0B0F17',
  },
  editorControls: {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  editorToolRow: {
    paddingHorizontal: 16,
    gap: 10,
  },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    gap: 6,
  },
  toolChipActive: {
    backgroundColor: 'rgba(0, 188, 212, 0.25)',
    borderColor: '#00BCD4',
  },
  chipIcon: {
    fontSize: 16,
  },
  chipLabel: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
});
