import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Clipboard,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TunnelPanel({ serverUrl, token, onClose }) {
  const [status, setStatus] = useState('loading'); // 'loading'|'stopped'|'starting'|'running'|'error'
  const [tunnelUrl, setTunnelUrl] = useState(null);
  const [tunnelError, setTunnelError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/tunnel/status`, { headers: authHeaders });
      const data = await res.json();
      setStatus(data.status);
      setTunnelUrl(data.url);
      setTunnelError(data.error || null);
    } catch (err) {
      setStatus('error');
      setTunnelError('Could not reach server');
    }
  };

  useEffect(() => {
    fetchStatus();
    // Poll status every 3 seconds while starting
    const interval = setInterval(() => {
      if (status === 'starting') fetchStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, [status]);

  const handleStart = async () => {
    setActionLoading(true);
    setStatus('starting');
    try {
      const res = await fetch(`${serverUrl}/api/tunnel/start`, {
        method: 'POST',
        headers: authHeaders,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start tunnel');
      setTunnelUrl(data.url);
      setStatus('running');
    } catch (err) {
      setStatus('error');
      setTunnelError(err.message);
      Alert.alert('Tunnel Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    setActionLoading(true);
    try {
      await fetch(`${serverUrl}/api/tunnel/stop`, {
        method: 'POST',
        headers: authHeaders,
      });
      setStatus('stopped');
      setTunnelUrl(null);
    } catch (err) {
      Alert.alert('Error', 'Could not stop tunnel: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyUrl = () => {
    if (tunnelUrl) {
      Clipboard.setString(tunnelUrl);
      Alert.alert('Copied!', 'Tunnel URL copied to clipboard.');
    }
  };

  const handleOpenUrl = () => {
    if (tunnelUrl) {
      Linking.openURL(tunnelUrl).catch(() =>
        Alert.alert('Error', 'Could not open URL in browser.')
      );
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'running': return '#4CAF50';
      case 'starting': return '#FFB300';
      case 'error': return '#e53935';
      default: return '#666';
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'loading': return 'Checking...';
      case 'stopped': return 'Tunnel Inactive';
      case 'starting': return 'Starting Tunnel...';
      case 'running': return 'Tunnel Active';
      case 'error': return 'Error';
      default: return status;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={actionLoading}>
          <Text style={styles.closeBtnText}>✕ Close</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Remote Access Tunnel</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.body}>

        {/* Status Indicator */}
        <View style={styles.statusCard}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
          <View style={styles.statusTextContainer}>
            <Text style={styles.statusLabel}>{getStatusLabel()}</Text>
            <Text style={styles.statusSub}>Cloudflare Quick Tunnel</Text>
          </View>
          {(status === 'loading' || status === 'starting') && (
            <ActivityIndicator color={getStatusColor()} />
          )}
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>🌐 What is this?</Text>
          <Text style={styles.infoText}>
            A Cloudflare Quick Tunnel creates a secure, encrypted HTTPS link to your home NAS from anywhere on the internet — no router configuration or port forwarding needed.{'\n\n'}
            The free *.trycloudflare.com URL expires when the server is restarted.
          </Text>
        </View>

        {/* Active Tunnel URL Display */}
        {status === 'running' && tunnelUrl && (
          <View style={styles.urlCard}>
            <Text style={styles.urlLabel}>Your Public NAS URL</Text>
            <Text style={styles.urlText} numberOfLines={1}>{tunnelUrl}</Text>
            <View style={styles.urlActions}>
              <TouchableOpacity style={styles.urlActionBtn} onPress={handleCopyUrl}>
                <Text style={styles.urlActionText}>📋 Copy URL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.urlActionBtn} onPress={handleOpenUrl}>
                <Text style={styles.urlActionText}>🔗 Open in Browser</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.pairingHint}>
              Use this URL in the mobile app's "Remote Access" tab with your NAS passcode to connect from anywhere.
            </Text>
          </View>
        )}

        {/* Error message */}
        {status === 'error' && tunnelError && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>⚠️ {tunnelError}</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionArea}>
          {status === 'stopped' || status === 'error' ? (
            <TouchableOpacity
              style={styles.startButton}
              onPress={handleStart}
              disabled={actionLoading}
            >
              {actionLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.actionButtonText}>🚀 Activate Tunnel</Text>
              }
            </TouchableOpacity>
          ) : status === 'running' ? (
            <TouchableOpacity
              style={styles.stopButton}
              onPress={handleStop}
              disabled={actionLoading}
            >
              {actionLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.actionButtonText}>⏹ Deactivate Tunnel</Text>
              }
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={styles.refreshBtn} onPress={fetchStatus} disabled={actionLoading}>
            <Text style={styles.refreshBtnText}>↻ Refresh Status</Text>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: '#222',
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
  },
  body: {
    flex: 1,
    padding: 20,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#2d2d2d',
  },
  statusDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 14,
  },
  statusTextContainer: {
    flex: 1,
  },
  statusLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusSub: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  infoCard: {
    backgroundColor: '#1a2332',
    borderRadius: 12,
    padding: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#1e3a5f',
  },
  infoTitle: {
    color: '#64B5F6',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  infoText: {
    color: '#90CAF9',
    fontSize: 13,
    lineHeight: 19,
  },
  urlCard: {
    backgroundColor: '#0a2310',
    borderRadius: 12,
    padding: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#114a1a',
  },
  urlLabel: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  urlText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  urlActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  urlActionBtn: {
    flex: 1,
    backgroundColor: '#1a3a20',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2d6e3a',
  },
  urlActionText: {
    color: '#81C784',
    fontSize: 13,
    fontWeight: 'bold',
  },
  pairingHint: {
    color: '#66BB6A',
    fontSize: 12,
    lineHeight: 17,
  },
  errorCard: {
    backgroundColor: '#2a1010',
    borderRadius: 12,
    padding: 14,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#5a1a1a',
  },
  errorText: {
    color: '#EF9A9A',
    fontSize: 13,
  },
  actionArea: {
    marginTop: 10,
    gap: 12,
  },
  startButton: {
    backgroundColor: '#4285F4',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#4285F4',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  stopButton: {
    backgroundColor: '#e53935',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  refreshBtn: {
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  refreshBtnText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
});
