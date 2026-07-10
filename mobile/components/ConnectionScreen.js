import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';

export default function ConnectionScreen({ onConnect }) {
  const [passcode, setPasscode] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState('');
  const [connecting, setConnecting] = useState(false);

  // Active tab: 'local' | 'remote'
  const [activeTab, setActiveTab] = useState('local');

  // Helper to test if a specific IP hosts our NAS server
  const checkIp = async (ip, port, controller) => {
    try {
      const response = await fetch(`http://${ip}:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: 'test_ping' }),
        signal: controller.signal
      });
      if (response.status === 401 || response.status === 400) {
        return `http://${ip}:${port}`;
      }
    } catch (e) {
      // Fail silently for non-responsive IPs
    }
    return null;
  };

  // Perform parallel scanning of local subnets
  const handleAutoScan = async () => {
    setScanning(true);
    setScanProgress('Starting network scan...');
    
    const subnets = ['192.168.1', '192.168.0', '192.168.68'];
    const port = '3000';
    let foundUrl = null;

    try {
      for (const subnet of subnets) {
        if (foundUrl) break;
        setScanProgress(`Scanning ${subnet}.X subnet...`);
        
        const batchSize = 50;
        for (let base = 1; base <= 255; base += batchSize) {
          if (foundUrl) break;
          
          const controllers = [];
          const promises = [];
          
          const limit = Math.min(base + batchSize - 1, 255);
          for (let i = base; i <= limit; i++) {
            const ip = `${subnet}.${i}`;
            const controller = new AbortController();
            controllers.push(controller);
            
            const timeoutId = setTimeout(() => controller.abort(), 350);
            
            promises.push(
              checkIp(ip, port, controller).then((res) => {
                clearTimeout(timeoutId);
                if (res) foundUrl = res;
              })
            );
          }
          
          await Promise.all(promises);
          controllers.forEach(c => c.abort());
        }
      }

      if (foundUrl) {
        setScanProgress('NAS Server found!');
        setManualUrl(foundUrl);
        Alert.alert('NAS Server Found!', `Located server at ${foundUrl}. Enter your passcode to pair.`);
      } else {
        Alert.alert(
          'No Server Found',
          'Could not find NAS server automatically. Ensure it is running on the same Wi-Fi, or use Remote Access.'
        );
      }
    } catch (error) {
      Alert.alert('Scan Error', 'Something went wrong while scanning the network.');
    } finally {
      setScanning(false);
      setScanProgress('');
    }
  };

  const handleConnect = async () => {
    if (!manualUrl) {
      Alert.alert('Error', 'Please enter the server URL.');
      return;
    }
    if (!passcode) {
      Alert.alert('Error', 'Please enter your passcode.');
      return;
    }

    let formattedUrl = manualUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = (activeTab === 'remote' ? 'https://' : 'http://') + formattedUrl;
    }
    formattedUrl = formattedUrl.replace(/\/$/, '');

    setConnecting(true);
    try {
      const response = await fetch(`${formattedUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to authenticate');
      }

      onConnect(formattedUrl, data.token);
    } catch (err) {
      Alert.alert('Connection Failed', err.message || 'Could not connect to the server.');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.card}>
          <Text style={styles.logo}>🔒</Text>
          <Text style={styles.title}>Personal NAS</Text>
          <Text style={styles.subtitle}>Secure File Access Anywhere</Text>

          {/* Tab Switcher */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'local' && styles.tabActive]}
              onPress={() => { setActiveTab('local'); setManualUrl(''); }}
              disabled={scanning || connecting}
            >
              <Text style={[styles.tabText, activeTab === 'local' && styles.tabTextActive]}>
                📶 Local WiFi
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'remote' && styles.tabActive]}
              onPress={() => { setActiveTab('remote'); setManualUrl(''); }}
              disabled={scanning || connecting}
            >
              <Text style={[styles.tabText, activeTab === 'remote' && styles.tabTextActive]}>
                🌐 Remote Access
              </Text>
            </TouchableOpacity>
          </View>

          {/* Local WiFi Tab */}
          {activeTab === 'local' && (
            <View style={styles.section}>
              <Text style={styles.description}>
                Make sure your computer and phone are connected to the same Wi-Fi network.
              </Text>
              
              {scanning ? (
                <View style={styles.loaderContainer}>
                  <ActivityIndicator size="large" color="#4285F4" />
                  <Text style={styles.loaderText}>{scanProgress}</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.primaryButton} onPress={handleAutoScan}>
                  <Text style={styles.buttonText}>Auto-Scan Network</Text>
                </TouchableOpacity>
              )}

              {/* Show manual input if a server was found, or always show a manual option */}
              {manualUrl ? (
                <View style={styles.manualInputSection}>
                  <Text style={styles.label}>Server Found</Text>
                  <TextInput
                    style={styles.input}
                    value={manualUrl}
                    onChangeText={setManualUrl}
                    autoCapitalize="none"
                    disabled={connecting}
                  />
                  <Text style={styles.label}>Passcode</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter 6-digit passcode"
                    placeholderTextColor="#666"
                    value={passcode}
                    onChangeText={setPasscode}
                    keyboardType="number-pad"
                    secureTextEntry
                    disabled={connecting}
                  />
                  {connecting ? (
                    <ActivityIndicator size="large" color="#4285F4" style={styles.connectingLoader} />
                  ) : (
                    <TouchableOpacity style={styles.primaryButton} onPress={handleConnect}>
                      <Text style={styles.buttonText}>Pair & Connect</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={() => setManualUrl('http://')}
                  disabled={scanning}
                >
                  <Text style={styles.linkText}>Enter IP Manually</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Remote Access Tab */}
          {activeTab === 'remote' && (
            <View style={styles.section}>
              <Text style={styles.description}>
                Connect to your NAS from anywhere on the internet using a Cloudflare Tunnel URL, a custom domain, or a public IP address.
              </Text>

              <View style={styles.remoteHint}>
                <Text style={styles.remoteHintTitle}>💡 How to enable remote access</Text>
                <Text style={styles.remoteHintText}>
                  On your Windows NAS server, open a browser to{'\n'}
                  http://localhost:3000 and activate the{'\n'}
                  Cloudflare Tunnel from the dashboard.{'\n\n'}
                  A free *.trycloudflare.com URL will be{'\n'}
                  generated — paste it below.
                </Text>
              </View>

              <Text style={styles.label}>Remote Server URL</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. https://your-tunnel.trycloudflare.com"
                placeholderTextColor="#666"
                value={manualUrl}
                onChangeText={setManualUrl}
                autoCapitalize="none"
                autoCorrect={false}
                disabled={connecting}
              />

              <Text style={styles.label}>Passcode</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter 6-digit passcode"
                placeholderTextColor="#666"
                value={passcode}
                onChangeText={setPasscode}
                keyboardType="number-pad"
                secureTextEntry
                disabled={connecting}
              />

              {connecting ? (
                <ActivityIndicator size="large" color="#4285F4" style={styles.connectingLoader} />
              ) : (
                <TouchableOpacity style={styles.remoteButton} onPress={handleConnect}>
                  <Text style={styles.buttonText}>Connect Remotely</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#1e1e1e',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  logo: {
    fontSize: 48,
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 20,
  },
  tabBar: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: '#121212',
    borderRadius: 8,
    padding: 4,
    marginBottom: 25,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: '#2d2d2d',
  },
  tabText: {
    color: '#666',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  section: {
    width: '100%',
  },
  description: {
    fontSize: 14,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  manualInputSection: {
    marginTop: 20,
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ccc',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#2d2d2d',
    color: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#3d3d3d',
  },
  primaryButton: {
    backgroundColor: '#4285F4',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#4285F4',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  remoteButton: {
    backgroundColor: '#00C853',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#00C853',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  linkButton: {
    alignItems: 'center',
    marginTop: 20,
    padding: 10,
  },
  linkText: {
    color: '#4285F4',
    fontSize: 14,
    fontWeight: '600',
  },
  loaderContainer: {
    marginVertical: 20,
    alignItems: 'center',
  },
  loaderText: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 10,
  },
  connectingLoader: {
    marginVertical: 20,
  },
  remoteHint: {
    backgroundColor: '#1a2332',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1e3a5f',
  },
  remoteHintTitle: {
    color: '#64B5F6',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  remoteHintText: {
    color: '#90CAF9',
    fontSize: 12,
    lineHeight: 18,
  }
});
