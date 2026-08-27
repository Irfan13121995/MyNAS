/**
 * Glassmorphism Authentication & Connection Screen
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Image, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import GlassCard from '../components/GlassCard';
import GlassButton from '../components/GlassButton';

export default function ConnectionScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { login, serverUrl, updateServerUrl } = useAuth();

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [customUrl, setCustomUrl] = useState(serverUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!password) {
      setError('Please enter your password');
      return;
    }
    setError('');
    setLoading(true);

    try {
      if (customUrl !== serverUrl) {
        await updateServerUrl(customUrl);
      }
      const res = await login(username, password);
      if (!res.success) {
        setError(res.error || 'Authentication failed');
      }
    } catch (e) {
      setError(e.message || 'Connection error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={{ fontSize: 44, marginBottom: 8 }}>🛡️</Text>
          <Text style={[styles.brand, { color: theme.textPrimary }]}>Personal NAS</Text>
          <Text style={[styles.tagline, { color: theme.textSecondary }]}>Private Cloud Storage & Auto-Backup</Text>
        </View>

        <GlassCard style={styles.card}>
          <Text style={[styles.formTitle, { color: theme.textPrimary }]}>Connect to Server</Text>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: theme.dangerBg }]}>
              <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
            </View>
          ) : null}

          <Text style={[styles.label, { color: theme.textSecondary }]}>Server / Tunnel URL</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.glassInput, borderColor: theme.glassBorder, color: theme.textPrimary }]}
            value={customUrl}
            onChangeText={setCustomUrl}
            placeholder="https://mynas-hi.online"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
          />

          <Text style={[styles.label, { color: theme.textSecondary, marginTop: 12 }]}>Username</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.glassInput, borderColor: theme.glassBorder, color: theme.textPrimary }]}
            value={username}
            onChangeText={setUsername}
            placeholder="admin"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
          />

          <Text style={[styles.label, { color: theme.textSecondary, marginTop: 12 }]}>Password</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.glassInput, borderColor: theme.glassBorder, color: theme.textPrimary }]}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter password"
            placeholderTextColor={theme.textMuted}
            secureTextEntry
          />

          <GlassButton
            title="Sign In & Connect"
            variant="primary"
            loading={loading}
            onPress={handleLogin}
            style={{ marginTop: 20 }}
          />
        </GlassCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    padding: 24,
    justifyContent: 'center',
    minHeight: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  brand: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 13,
    marginTop: 4,
  },
  card: {
    padding: 20,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 16,
    textAlign: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  errorBox: {
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
  }
});
