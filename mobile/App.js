import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator, StatusBar, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ConnectionScreen from './components/ConnectionScreen';
import BrowserScreen from './components/BrowserScreen';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [serverUrl, setServerUrl] = useState(null);
  const [token, setToken] = useState(null);

  // Load pairing details from secure storage on startup
  useEffect(() => {
    const bootstrapAsync = async () => {
      try {
        const storedUrl = await AsyncStorage.getItem('nas_server_url');
        const storedToken = await AsyncStorage.getItem('nas_jwt_token');
        const storedRemoteUrl = await AsyncStorage.getItem('nas_remote_url');

        if (storedUrl && storedToken) {
          // Try the primary (local) URL first with a short timeout
          const localOk = await verifyConnection(storedUrl, storedToken, 3000);
          
          if (localOk) {
            setServerUrl(storedUrl);
            setToken(storedToken);
          } else if (storedRemoteUrl) {
            // Fallback: try the remote/tunnel URL
            const remoteOk = await verifyConnection(storedRemoteUrl, storedToken, 8000);
            if (remoteOk) {
              setServerUrl(storedRemoteUrl);
              setToken(storedToken);
            } else {
              await handleLogout();
            }
          } else {
            await handleLogout();
          }
        }
      } catch (e) {
        console.warn('Failed to load login credentials', e);
      } finally {
        setLoading(false);
      }
    };

    bootstrapAsync();
  }, []);

  /**
   * Verifies a connection to a server URL with a timeout.
   * Returns true if the token is still valid.
   */
  const verifyConnection = async (url, jwtToken, timeoutMs = 5000) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const response = await fetch(`${url}/api/auth/verify`, {
        headers: { 'Authorization': `Bearer ${jwtToken}` },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch (e) {
      return false;
    }
  };

  const handleConnect = async (url, jwtToken) => {
    try {
      // Determine if the URL is local or remote and save accordingly
      const isLocal = /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|localhost)/i.test(url);
      
      if (isLocal) {
        await AsyncStorage.setItem('nas_server_url', url);
      } else {
        // Save as both the primary and the remote URL for fallback logic
        await AsyncStorage.setItem('nas_remote_url', url);
        // If we don't have a local URL, set this as primary too
        const existingLocal = await AsyncStorage.getItem('nas_server_url');
        if (!existingLocal) {
          await AsyncStorage.setItem('nas_server_url', url);
        }
      }
      
      await AsyncStorage.setItem('nas_jwt_token', jwtToken);
      setServerUrl(url);
      setToken(jwtToken);
    } catch (e) {
      console.error('Failed to save pairing data', e);
    }
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('nas_server_url');
      await AsyncStorage.removeItem('nas_jwt_token');
      await AsyncStorage.removeItem('nas_remote_url');
      setServerUrl(null);
      setToken(null);
    } catch (e) {
      console.error('Failed to clear pairing data', e);
    }
  };

  const handleRemoteUrl = async (url) => {
    try {
      if (url) {
        await AsyncStorage.setItem('nas_remote_url', url);
      } else {
        await AsyncStorage.removeItem('nas_remote_url');
      }
    } catch (e) {
      console.error('Failed to save remote NAS URL', e);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#4285F4" />
        <Text style={styles.loadingText}>Connecting to Personal NAS...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      {token && serverUrl ? (
        <BrowserScreen
          serverUrl={serverUrl}
          token={token}
          onLogout={handleLogout}
          onRemoteUrl={handleRemoteUrl}
        />
      ) : (
        <ConnectionScreen onConnect={handleConnect} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 10,
  }
});
