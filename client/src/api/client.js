const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:4000/api');

function authHeader(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function api(path, options = {}) {
  const headers = {
    ...authHeader(options.token),
    ...(options.headers || {})
  };

  const init = {
    method: options.method || 'GET',
    headers
  };

  if (options.body instanceof FormData) {
    init.body = options.body;
  } else if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_URL}${path}`, init);
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(data?.message || data || 'Request failed');
  }

  return data;
}

export async function uploadEncryptedAttachment(conversationId, blob, token) {
  const formData = new FormData();
  formData.append('file', blob, 'attachment.cipher');
  const data = await api(`/conversations/${conversationId}/attachments`, {
    method: 'POST',
    body: formData,
    token
  });

  return data.attachment;
}

export async function uploadAvatar(file, token) {
  const formData = new FormData();
  formData.append('avatar', file, file.name);
  const data = await api('/users/me/avatar', {
    method: 'POST',
    body: formData,
    token
  });

  return data.user;
}

export async function downloadEncryptedAttachment(attachmentId, token) {
  const response = await fetch(`${API_URL}/attachments/${attachmentId}`, {
    headers: authHeader(token)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Could not download attachment');
  }

  return response.arrayBuffer();
}

export function socketUrl() {
  if (import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL;
  }

  if (API_URL.startsWith('/')) {
    return window.location.origin;
  }

  return API_URL.replace(/\/api\/?$/, '');
}
