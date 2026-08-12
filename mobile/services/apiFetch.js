export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function apiFetch(url, options = {}, token = null) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  const headers = {
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (response.status === 401) {
      throw new AuthError(`Authentication failed with status ${response.status}`);
    }

    // Only try to parse JSON if we have content
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}
