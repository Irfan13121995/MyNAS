/**
 * Authentication & Server Tunnel Connection Context
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { getSetting, setSetting } from '../database/fileRepository';
import { loginUser, checkServerHealth, setAuthToken, getAuthToken } from '../services/api';

const AuthContext = createContext({
  isAuthenticated: false,
  user: null,
  serverUrl: 'https://mynas-hi.online',
  isServerHealthy: false,
  login: async () => {},
  logout: async () => {},
  updateServerUrl: async () => {},
  checkConnection: async () => {}
});

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [serverUrl, setServerUrlState] = useState('https://mynas-hi.online');
  const [isServerHealthy, setIsServerHealthy] = useState(false);

  useEffect(() => {
    bootstrapAuth();
  }, []);

  const bootstrapAuth = async () => {
    try {
      const url = await getSetting('server_url', 'https://mynas-hi.online');
      setServerUrlState(url);

      const token = await getAuthToken();
      if (token) {
        setIsAuthenticated(true);
      }

      const health = await checkServerHealth();
      setIsServerHealthy(health.ok);
    } catch (e) {
      console.warn('[AuthContext] Bootstrap failed:', e);
    }
  };

  const login = async (username, password) => {
    const res = await loginUser(username, password);
    if (res.success) {
      setIsAuthenticated(true);
      setUser(res.user);
      setIsServerHealthy(true);
    }
    return res;
  };

  const logout = async () => {
    await setAuthToken(null);
    setIsAuthenticated(false);
    setUser(null);
  };

  const updateServerUrl = async (newUrl) => {
    const cleanUrl = newUrl.trim().replace(/[/\\]+$/, '');
    await setSetting('server_url', cleanUrl);
    setServerUrlState(cleanUrl);
    const health = await checkServerHealth();
    setIsServerHealthy(health.ok);
  };

  const checkConnection = async () => {
    const health = await checkServerHealth();
    setIsServerHealthy(health.ok);
    return health.ok;
  };

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      user,
      serverUrl,
      isServerHealthy,
      login,
      logout,
      updateServerUrl,
      checkConnection
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
