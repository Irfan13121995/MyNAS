import React, { useState, useMemo } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, Modal, ScrollView, StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTheme } from '../contexts/ThemeContext';

export default function ConnectionScreen({ onConnect }) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'

  // Server location
  const [ipAddress, setIpAddress] = useState('https://mynas-hi.online');
  const [port, setPort] = useState('3000');

  // Credentials
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [isScanningNetwork, setIsScanningNetwork] = useState(false);

  // QR Modal & Camera state
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [scannedUrl, setScannedUrl] = useState('');
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const handleScanNetwork = async () => {
    setIsScanningNetwork(true);
    const candidateHosts = [
      'http://10.31.30.50:3000',
      'http://192.168.1.100:3000',
      'http://192.168.1.50:3000',
      'http://192.168.1.2:3000',
      'http://192.168.0.100:3000',
      'http://192.168.0.10:3000',
      'https://mynas-hi.eu.org'
    ];

    let foundUrl = null;
    for (const host of candidateHosts) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);
        const res = await fetch(`${host}/api/tunnel/status`, { signal: controller.signal }).catch(() => null);
        clearTimeout(timeoutId);
        if (res && res.status < 500) {
          foundUrl = host;
          break;
        }
      } catch (e) {}
    }

    setIsScanningNetwork(false);
    if (foundUrl) {
      setIpAddress(foundUrl);
      Alert.alert('NAS Found!', `Discovered active NAS server at:\n${foundUrl}`);
    } else {
      Alert.alert('Scan Complete', 'No NAS server found on standard local Wi-Fi addresses. Please check host IP or scan QR code.');
    }
  };

  const getCleanUrl = (rawUrl = null) => {
    let cleanUrl = (rawUrl || ipAddress).trim();

    // Remove trailing slash if present
    cleanUrl = cleanUrl.replace(/\/+$/, '');

    // Domain names (Cloudflare tunnels, custom domains) default to HTTPS
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
    if (!cleanUrl.includes(':') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `${cleanUrl}:${port || '3000'}`;
    }
    return cleanUrl;
  };

  const openQrScanner = async () => {
    setScanned(false);
    setQrModalVisible(true);
    if (!permission?.granted) {
      await requestPermission();
    }
  };

  const parseQrPayload = (rawData) => {
    if (!rawData) return { url: '', token: null, passcode: null, username: null };
    let trimmed = rawData.trim();
    let url = trimmed;
    let token = null;
    let passcodeVal = null;
    let usernameVal = null;

    try {
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('%7B') && trimmed.endsWith('%7D'))) {
        const decoded = trimmed.startsWith('%7B') ? decodeURIComponent(trimmed) : trimmed;
        const parsed = JSON.parse(decoded);
        if (parsed.url) url = parsed.url;
        if (parsed.token) token = parsed.token;
        if (parsed.passcode) passcodeVal = parsed.passcode;
        if (parsed.username || parsed.user?.username) usernameVal = parsed.username || parsed.user?.username;
      }
    } catch (e) {}

    return { url, token, passcode: passcodeVal, username: usernameVal };
  };

  const safeJsonParse = async (res) => {
    try {
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await res.json();
      }
      const text = await res.text();
      return { error: text || `HTTP ${res.status}` };
    } catch (e) {
      return { error: `HTTP ${res.status}` };
    }
  };

  const handleBarCodeScanned = ({ data }) => {
    if (scanned || !data) return;
    setScanned(true);

    const { url, token: targetToken, passcode: targetPasscode, username: targetUser } = parseQrPayload(data);

    const cleanUrl = getCleanUrl(url);
    setScannedUrl(cleanUrl);
    setIpAddress(cleanUrl);
    setQrModalVisible(false);

    if (targetToken) {
      // Seamless auto-login with session token embedded in QR code!
      onConnect(cleanUrl, targetToken, targetUser);
    } else {
      Alert.alert(
        'QR Code Scanned 📷',
        `Server URL updated to:\n${cleanUrl}\n\nPlease enter your account credentials to connect.`,
        [{ text: 'OK' }]
      );
    }
  };

  const handleUserLogin = async (customUrl = null) => {
    if (!username.trim() || !password) {
      Alert.alert('Error', 'Please enter your username and password');
      return;
    }

    setLoading(true);
    const cleanUrl = getCleanUrl(customUrl);

    // Candidates to try if initial cleanUrl times out or fails network check
    const candidateUrls = [
      cleanUrl,
      'http://10.31.30.50:3000',
      'https://mynas-hi.online',
      'https://mynas-hi.eu.org'
    ].filter((u, index, self) => u && self.indexOf(u) === index);

    let lastError = null;
    let successfulRes = null;
    let successfulUrl = null;

    for (const targetUrl of candidateUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);

        const res = await fetch(`${targetUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), password }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res) {
          successfulRes = res;
          successfulUrl = targetUrl;
          break;
        }
      } catch (err) {
        lastError = err;
        // If it's a 401 / 400 credentials error response, stop trying other servers
        if (err.name === 'AbortError') {
          console.warn(`Connection timeout to ${targetUrl}`);
        }
      }
    }

    try {
      if (!successfulRes) {
        throw lastError || new Error('Could not connect to NAS server. Please check host IP or scan QR code.');
      }

      const data = await safeJsonParse(successfulRes);
      if (!successfulRes.ok) {
        if (data.requireEmailVerification) {
          Alert.alert(
            'Email Verification Needed',
            data.error || 'Please verify your email before logging in.'
          );
          return;
        }
        throw new Error(data.error || 'Invalid username or password');
      }

      setIpAddress(successfulUrl);
      onConnect(successfulUrl, data.token, data.username || data.user?.username);
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('App Transport Security') || msg.includes('secure connection') || msg.includes('CLEARTEXT') || msg.includes('cleartext') || msg.includes('UnknownServiceException')) {
        Alert.alert(
          'HTTP Blocked by Mobile OS Policy',
          `Mobile OS network security policy blocked unencrypted HTTP connection to:\n"${cleanUrl}"\n\n👉 Solution:\n1. Tap "📷 QR Scan" to auto-connect via secure HTTPS.\n2. Or switch to the Cloudflare HTTPS Tunnel: https://mynas-hi.online`,
          [
            {
              text: 'Use Secure HTTPS Tunnel',
              onPress: () => {
                const tunnelUrl = 'https://mynas-hi.online';
                setIpAddress(tunnelUrl);
                handleUserLogin(tunnelUrl);
              }
            },
            { text: 'OK' }
          ]
        );
      } else {
        Alert.alert('Login Failed', err.message || 'Unable to log in. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!username.trim() || username.trim().length < 3) {
      Alert.alert('Validation Error', 'Username must be at least 3 characters');
      return;
    }
    if (email && (!email.includes('@') || !email.includes('.'))) {
      Alert.alert('Validation Error', 'Please enter a valid email address');
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert('Validation Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    const cleanUrl = getCleanUrl();

    try {
      const res = await fetch(`${cleanUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          password
        })
      });

      const data = await safeJsonParse(res);
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      if (data.requireEmailVerification) {
        Alert.alert(
          'Account Created! ✉️',
          data.message + (data.devLink ? `\n\n[Dev Link]: ${data.devLink}` : ''),
          [{ text: 'OK', onPress: () => setAuthMode('login') }]
        );
      } else {
        Alert.alert('Success 🎉', 'Account created successfully! Logging you in...');
        onConnect(cleanUrl, data.token, username.trim());
      }
    } catch (err) {
      Alert.alert('Registration Failed', err.message || 'Could not create account');
    } finally {
      setLoading(false);
    }
  };

  const handleQrPairSubmit = () => {
    if (!scannedUrl) {
      Alert.alert('QR Scanner', 'Please paste or scan a valid Tunnel URL');
      return;
    }
    const { url, token: targetToken, username: targetUser } = parseQrPayload(scannedUrl);
    const clean = getCleanUrl(url);
    setIpAddress(clean);
    setQrModalVisible(false);

    if (targetToken) {
      onConnect(clean, targetToken, targetUser);
    } else {
      Alert.alert(
        'Server URL Set 🌐',
        `Target address set to:\n${clean}\n\nPlease enter your account credentials to connect.`,
        [{ text: 'OK' }]
      );
    }
  };

  const statusBarPadding = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 16;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.inner}>
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: statusBarPadding }]} showsVerticalScrollIndicator={false}>
          {/* Logo / Header */}
          <View style={styles.logoBox}>
            <Text style={styles.logoIcon}>🗄️</Text>
            <Text style={styles.title}>Personal NAS</Text>
            <Text style={styles.subtitle}>Connect your Android device to your Windows NAS</Text>
          </View>

          {/* Card Form */}
          <View style={styles.card}>
            {/* Quick Actions Row */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              <TouchableOpacity
                style={[styles.qrScanBtn, { flex: 1, marginBottom: 0 }]}
                onPress={openQrScanner}
                activeOpacity={0.85}
              >
                <Text style={styles.qrScanBtnText}>📷 QR Scan</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.qrScanBtn, { flex: 1, marginBottom: 0, backgroundColor: colors.accentBg, borderColor: colors.accent }]}
                onPress={handleScanNetwork}
                disabled={isScanningNetwork}
                activeOpacity={0.85}
              >
                {isScanningNetwork ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Text style={[styles.qrScanBtnText, { color: colors.accentLight }]}>🔍 Scan Wi-Fi</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Auth Mode Tabs */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tabBtn, authMode === 'login' && styles.tabBtnActive]}
                onPress={() => setAuthMode('login')}
              >
                <Text style={[styles.tabText, authMode === 'login' && styles.tabTextActive]}>User Login</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, authMode === 'register' && styles.tabBtnActive]}
                onPress={() => setAuthMode('register')}
              >
                <Text style={[styles.tabText, authMode === 'register' && styles.tabTextActive]}>Register</Text>
              </TouchableOpacity>
            </View>

            {/* USER LOGIN MODE */}
            {authMode === 'login' && (
              <>
                <Text style={styles.label}>Username or Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Username or email"
                  placeholderTextColor="#64748B"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                />

                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor="#64748B"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />

                <TouchableOpacity style={styles.connectBtn} onPress={handleUserLogin} disabled={loading} activeOpacity={0.85}>
                  {loading ? <ActivityIndicator color={colors.background} /> : <Text style={styles.connectBtnText}>Sign In</Text>}
                </TouchableOpacity>
              </>
            )}

            {/* REGISTER MODE */}
            {authMode === 'register' && (
              <>
                <Text style={styles.label}>Choose Username</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Username"
                  placeholderTextColor="#64748B"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                />

                <Text style={styles.label}>Email Address (For Verification)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="name@example.com"
                  placeholderTextColor="#64748B"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />

                <Text style={styles.label}>Password (Min 6 chars)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor="#64748B"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />

                <TouchableOpacity style={styles.connectBtn} onPress={handleRegister} disabled={loading} activeOpacity={0.85}>
                  {loading ? <ActivityIndicator color={colors.background} /> : <Text style={styles.connectBtnText}>Create Account</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* QR Code Scanner / Pairing Modal */}
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
                    <Text style={styles.cameraHint}>Point camera at web dashboard QR code</Text>
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
                <View style={styles.permissionBox}>
                  <Text style={styles.permissionTitle}>Camera Permission Required</Text>
                  <Text style={styles.permissionSub}>We need camera access to scan the pairing QR code on your NAS Web Dashboard.</Text>
                  <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
                    <Text style={styles.permissionBtnText}>Enable Camera</Text>
                  </TouchableOpacity>
                </View>
              )}

              <Text style={[styles.label, { marginTop: 16 }]}>Or Paste QR Link Manually</Text>
              <TextInput
                style={styles.input}
                placeholder="https://...trycloudflare.com"
                placeholderTextColor="#64748B"
                value={scannedUrl}
                onChangeText={setScannedUrl}
                autoCapitalize="none"
              />

              <TouchableOpacity style={styles.qrPairBtn} onPress={handleQrPairSubmit} activeOpacity={0.85}>
                <Text style={styles.qrPairBtnText}>⚡ Pair & Login Now</Text>
              </TouchableOpacity>
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
    paddingHorizontal: 24,
    paddingBottom: 40,
    justifyContent: 'center',
    minHeight: '100%',
  },
  logoBox: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoIcon: {
    fontSize: 52,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.borderLight,
    elevation: 6,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  qrScanBtn: {
    backgroundColor: colors.accentBg,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 18,
  },
  qrScanBtnText: {
    color: colors.accentLight,
    fontSize: 14,
    fontWeight: '800',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.tabBg,
    borderRadius: 14,
    padding: 4,
    marginBottom: 18,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabBtnActive: {
    backgroundColor: colors.accent,
    elevation: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.background,
    fontWeight: '800',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
  },
  connectBtn: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    elevation: 4,
  },
  connectBtnText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '800',
  },

  // Modal
  modalBg: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalCloseText: {
    fontSize: 18,
    color: colors.textSecondary,
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  qrPairBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  qrPairBtnText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '800',
  },
  cameraContainer: {
    height: 240,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000000',
    marginBottom: 8,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanTarget: {
    width: 160,
    height: 160,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  cameraHint: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  permissionBox: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 8,
  },
  permissionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  permissionSub: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 18,
  },
  permissionBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  permissionBtnText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '800',
  },
  scanAgainBtn: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  scanAgainText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
