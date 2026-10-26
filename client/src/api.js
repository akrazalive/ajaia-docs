// Thin fetch wrapper: JSON in/out, cookie session, consistent errors.
export class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request(method, url, body) {
  const isForm = body instanceof FormData;
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Can’t reach the server. Check your connection and try again.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status}).`, data);
  return data;
}

const upload = (url, file) => {
  const form = new FormData();
  form.append('file', file);
  return request('POST', url, form);
};

export const api = {
  me: () => request('GET', '/api/auth/me'),
  login: (email, password) => request('POST', '/api/auth/login', { email, password }),
  logout: () => request('POST', '/api/auth/logout'),
  users: () => request('GET', '/api/users'),

  listDocuments: () => request('GET', '/api/documents'),
  createDocument: (data = {}) => request('POST', '/api/documents', data),
  importDocument: (file) => upload('/api/documents/import', file),
  convertFile: (file) => upload('/api/files/convert', file),
  getDocument: (id) => request('GET', `/api/documents/${id}`),
  updateDocument: (id, data) => request('PATCH', `/api/documents/${id}`, data),
  deleteDocument: (id) => request('DELETE', `/api/documents/${id}`),

  listShares: (id) => request('GET', `/api/documents/${id}/shares`),
  share: (id, email, role) => request('POST', `/api/documents/${id}/shares`, { email, role }),
  unshare: (id, userId) => request('DELETE', `/api/documents/${id}/shares/${userId}`),
};

export const SUPPORTED_UPLOADS = '.txt,.md,.markdown,.docx';
export const UPLOAD_HINT = '.txt, .md or .docx · up to 5 MB';
