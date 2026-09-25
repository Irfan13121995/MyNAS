import React, { useState, useMemo } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, Modal, ScrollView, StatusBar, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTheme } from '../contexts/ThemeContext';

export default function ConnectionScreen({ onConnect }) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [loading, setLoading] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  // QR Modal & Camera state
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const getCleanUrl = (rawUrl) => {
    let cleanUrl = (rawUrl || '').trim().replace(/\/+$/, '');
    const isDomain = cleanUrl.includes('.online') || cleanUrl.includes('.org') || cleanUrl.includes('.com') || cleanUrl.includes('.net') || cleanUrl.includes('trycloudflare') || cleanUrl.includes('mynas-hi');
    if (isDomain) {
      if (!cleanUrl.startsWith('https://') && !cleanUrl.startsWith('http://')) {
        cleanUrl = `https://${cleanUrl}`;
      }
      return cleanUrl;
    }
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `http://${cleanUrl}`;
    }
    if (!cleanUrl.includes(':', 6) && !cleanUrl.startsWith('https://')) {
      cleanUrl = `${cleanUrl}:3000`;
    }
    return cleanUrl;
  };

  const parseQrPayload = (rawData) => {
    if (!rawData) return { url: '', token: null, username: null };
    let trimmed = rawData.trim();
    let url = trimmed;
    let token = null;
    let usernameVal = null;

    try {
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('%7B') && trimmed.endsWith('%7D'))) {
        const decoded = trimmed.startsWith('%7B') ? decodeURIComponent(trimmed) : trimmed;
        const parsed = JSON.parse(decoded);
        if (parsed.url) url = parsed.url;
        if (parsed.token) token = parsed.token;
        if (parsed.username || parsed.user?.username) usernameVal = parsed.username || parsed.user?.username;
      }
    } catch (e) {}

    return { url, token, username: usernameVal };
  };

  const openQrScanner = async () => {
    setScanned(false);
    setQrModalVisible(true);
    if (!permission?.granted) {
      await requestPermission();
    }
  };

  const handleBarCodeScanned = ({ data }) => {
    if (scanned || !data) return;
    setScanned(true);

    const { url, token: targetToken, username: targetUser } = parseQrPayload(data);
    const cleanUrl = getCleanUrl(url);
    setQrModalVisible(false);

    if (targetToken) {
      onConnect(cleanUrl, targetToken, targetUser || 'NAS User');
    } else if (cleanUrl) {
      Alert.alert(
        'QR Code Detected',
        `Discovered server at:\n${cleanUrl}\n\nPlease generate a Mobile Pairing QR code from the "Remote Access" section in your myNAS web dashboard to auto-pair.`,
        [{ text: 'OK' }]
      );
    } else {
      Alert.alert('Invalid QR Code', 'The scanned QR code is not a valid myNAS pairing code.');
    }
  };

  const handleManualPairSubmit = () => {
    if (!manualCode.trim()) {
      Alert.alert('Pairing Code Required', 'Please paste the pairing code or URL from your myNAS web dashboard.');
      return;
    }

    const { url, token: targetToken, username: targetUser } = parseQrPayload(manualCode.trim());
    const cleanUrl = getCleanUrl(url);

    if (targetToken) {
      onConnect(cleanUrl, targetToken, targetUser || 'NAS User');
    } else {
      Alert.alert(
        'Pairing Info',
        `Server address set to:\n${cleanUrl}\n\nPlease ensure your pairing code includes the authorization token generated in the Remote Access tab.`,
        [{ text: 'OK' }]
      );
    }
  };

  const statusBarPadding = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 16;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.inner}>
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: statusBarPadding }]} showsVerticalScrollIndicator={false}>
          {/* Logo & Header */}
          <View style={styles.logoBox}>
            <Image
              source={require('../assets/logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.title}>myNAS Mobile Pairing</Text>
            <Text style={styles.subtitle}>
              Connect your phone to your Personal NAS in seconds using your camera.
            </Text>
          </View>

          {/* Main Action Card */}
          <View style={styles.card}>
            {/* Big Primary Scan Button */}
            <TouchableOpacity
              style={styles.bigScanBtn}
              onPress={openQrScanner}
              activeOpacity={0.85}
            >
              <View style={styles.scanIconBox}>
                <Text style={styles.scanEmoji}>📷</Text>
              </View>
              <Text style={styles.bigScanTitle}>Scan Pairing QR Code</Text>
              <Text style={styles.bigScanSub}>Point camera at your computer screen</Text>
            </TouchableOpacity>

            {/* How to Pair Instructions */}
            <View style={styles.instructionsBox}>
              <Text style={styles.instructionHeader}>📱 How to connect:</Text>
              
              <View style={styles.stepRow}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>1</Text></View>
                <Text style={styles.stepText}>Open <Text style={styles.boldText}>myNAS</Text> in your computer's browser.</Text>
              </View>

              <View style={styles.stepRow}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>2</Text></View>
                <Text style={styles.stepText}>Click <Text style={styles.boldText}>Remote</Text> (or Remote Access) in the sidebar.</Text>
              </View>

              <View style={styles.stepRow}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>3</Text></View>
                <Text style={styles.stepText}>Tap <Text style={styles.boldText}>Scan Pairing QR Code</Text> above and scan the QR code.</Text>
              </View>
            </View>

            {/* Manual Pairing Fallback Toggle */}
            <TouchableOpacity
              style={styles.manualToggleBtn}
              onPress={() => setShowManualInput(!showManualInput)}
              activeOpacity={0.8}
            >
              <Text style={styles.manualToggleText}>
                {showManualInput ? '▲ Hide manual pairing code' : '▼ Or enter pairing code / URL manually'}
              </Text>
            </TouchableOpacity>

            {showManualInput && (
              <View style={styles.manualBox}>
                <Text style={styles.label}>Paste Pairing Code or Tunnel URL</Text>
                <TextInput
                  style={styles.input}
                  placeholder='e.g. {"url":"https://mynas-hi.online","token":"..."}'
                  placeholderTextColor="#64748B"
                  value={manualCode}
                  onChangeText={setManualCode}
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                  numberOfLines={2}
                />
                <TouchableOpacity
                  style={styles.manualSubmitBtn}
                  onPress={handleManualPairSubmit}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <Text style={styles.manualSubmitBtnText}>⚡ Pair Device Now</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Fullscreen Camera QR Scanner Modal */}
      <Modal visible={qrModalVisible} animationType="slide" transparent={true} onRequestClose={() => setQrModalVisible(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📷 Scan Pairing QR Code</Text>
              <TouchableOpacity onPress={() => setQrModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {permission?.granted ? (
                <View style={styles.cameraContainer}>
                  <CameraView
                    style={styles.camera}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                  />
                  <View style={styles.cameraOverlay} pointerEvents="none">
                    <View style={styles.scanTarget} />
                    <Text style={styles.cameraHint}>Point camera at the QR code on your PC screen</Text>
                  </View>
                  {scanned && (
                    <TouchableOpacity
                      style={styles.scanAgainBtn}
                      onPress={() => setScanned(false)}
                    >
                      <Text style={styles.scanAgainText}>🔄 Scan Again</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View style={styles.noPermissionBox}>
                  <Text style={styles.noPermTitle}>Camera Permission Required</Text>
                  <Text style={styles.noPermSub}>Please allow camera access to scan the pairing QR code.</Text>
                  <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
                    <Text style={styles.permBtnText}>Grant Camera Permission</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inner: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    justifyContent: 'center',
    minHeight: '100%',
  },
  logoBox: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoImage: {
    width: 84,
    height: 84,
    marginBottom: 10,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 12,
    lineHeight: 18,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
    elevation: 6,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  bigScanBtn: {
    backgroundColor: colors.accent,
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 20,
    elevation: 4,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  scanIconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(15, 23, 42, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  scanEmoji: {
    fontSize: 28,
  },
  bigScanTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  bigScanSub: {
    color: '#1E293B',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 3,
  },
  instructionsBox: {
    backgroundColor: colors.surfaceHighlight || 'rgba(255, 255, 255, 0.04)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: 16,
  },
  instructionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accentBg || 'rgba(0, 188, 212, 0.2)',
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.accent,
  },
  stepText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  boldText: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  manualToggleBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  manualToggleText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
  },
  manualBox: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: colors.inputBg || colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    color: colors.textPrimary,
    fontSize: 13,
    marginBottom: 12,
  },
  manualSubmitBtn: {
    backgroundColor: colors.accentBg,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  manualSubmitBtnText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '800',
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
    height: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.topbar,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  modalCloseText: {
    fontSize: 20,
    color: colors.textSecondary,
    padding: 4,
  },
  modalBody: {
    flex: 1,
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanTarget: {
    width: 230,
    height: 230,
    borderWidth: 2.5,
    borderColor: '#00E5FF',
    borderRadius: 24,
    backgroundColor: 'transparent',
  },
  cameraHint: {
    marginTop: 20,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  scanAgainBtn: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  scanAgainText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 13,
  },
  noPermissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  noPermTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  noPermSub: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  permBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  permBtnText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 14,
  },
});
