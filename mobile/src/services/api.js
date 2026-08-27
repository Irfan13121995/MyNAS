/**
 * Axios Network Service Layer with Cloudflare Tunnel & Offline Resilience
 */
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import { getSetting } from '../database/fileRepository';

const AUTH_TOKEN_KEY = 'nas_jwt_token';
const DEFAULT_SERVER_URL = 'https://mynas-hi.online';

// Create base Axios instance
const apiClient = axios.create({
  baseURL: DEFAULT_SERVER_URL,
  timeout: 30000,
  headers: {
    'Accept': 'application/json',
    'X-Client-Platform': 'Android',
    'X-Client-App': 'Personal-NAS-v2'
  }
});

// Request Interceptor: Attach Bearer Token & Dynamic Base URL
apiClient.interceptors.request.use(async (config) => {
  try {
    const storedUrl = await getSetting('server_url', DEFAULT_SERVER_URL);
    if (storedUrl) {
      config.baseURL = storedUrl.replace(/[/\\]+$/, '');
    }

    const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (e) {
    console.warn('[API] Failed to prepare request interceptor:', e);
  }
  return config;
}, (error) => Promise.reject(error));

// Response Interceptor: Handle Tunnel drops & 401 Unauthorized
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      console.warn('[API] Token expired or unauthorized.');
    }
    return Promise.reject(error);
  }
);

/**
 * Store JWT authentication token securely
 */
export async function setAuthToken(token) {
  if (token) {
    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
  }
}

/**
 * Get stored JWT token
 */
export async function getAuthToken() {
  return await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
}

/**
 * Check backend server and Cloudflare tunnel health
 */
export async function checkServerHealth() {
  try {
    const res = await apiClient.get('/api/system', { timeout: 8000 });
    return { ok: true, data: res.data };
  } catch (err) {
    return { 
      ok: false, 
      error: err.response?.data?.error || err.message || 'Server unreachable' 
    };
  }
}

/**
 * Authenticate user with username and password
 */
export async function loginUser(username, password) {
  try {
    const res = await apiClient.post('/api/auth/login', { username, password });
    if (res.data?.token) {
      await setAuthToken(res.data.token);
      return { success: true, token: res.data.token, user: res.data.user };
    }
    return { success: false, error: res.data?.error || 'Login failed' };
  } catch (err) {
    return { 
      success: false, 
      error: err.response?.data?.error || err.message || 'Connection error' 
    };
  }
}

/**
 * Upload single media file using multipart/form-data with Cloudflare tunnel resilience
 */
export async function uploadFileMultipart(fileRecord, onProgress) {
  const { local_uri, filename, media_type } = fileRecord;
  const baseUrl = await getSetting('server_url', DEFAULT_SERVER_URL);
  const token = await getAuthToken();
  const targetFolder = await getSetting('destination_folder', 'Mobile Backups');

  // Verify local file exists before upload
  const fileInfo = await FileSystem.getInfoAsync(local_uri);
  if (!fileInfo.exists) {
    throw new Error('Local file does not exist on device.');
  }

  const uploadEndpoint = `${baseUrl.replace(/[/\\]+$/, '')}/api/files/upload`;

  // Use Expo FileSystem.uploadAsync for high-performance background streaming
  const uploadTask = FileSystem.createUploadTask(
    uploadEndpoint,
    local_uri,
    {
      fieldName: 'file',
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Accept': 'application/json'
      },
      parameters: {
        destinationDir: targetFolder,
        mediaCategory: media_type === 'video' ? 'videos' : 'photos',
        clientTimestamp: String(fileRecord.creation_time || Date.now())
      }
    },
    (progress) => {
      if (onProgress && progress.totalBytesExpectedToSend > 0) {
        const percent = Math.round((progress.totalBytesSent / progress.totalBytesExpectedToSend) * 100);
        onProgress({
          percent,
          bytesSent: progress.totalBytesSent,
          totalBytes: progress.totalBytesExpectedToSend
        });
      }
    }
  );

  const result = await uploadTask.uploadAsync();

  if (result.status >= 200 && result.status < 300) {
    try {
      const responseData = JSON.parse(result.body);
      return {
        success: true,
        remotePath: responseData.file?.path || `${targetFolder}/${filename}`,
        data: responseData
      };
    } catch (e) {
      return { success: true, remotePath: `${targetFolder}/${filename}` };
    }
  } else {
    let errorMsg = `Upload failed with HTTP ${result.status}`;
    try {
      const parsed = JSON.parse(result.body);
      if (parsed.error) errorMsg = parsed.error;
    } catch (e) {}
    throw new Error(errorMsg);
  }
}

export default apiClient;
