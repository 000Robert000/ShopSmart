const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
export const REQUEST_TIMEOUT_MS = 15000;
// Must stay longer than the server's AI_TIMEOUT_MS so the server's fallback answer arrives first.
export const ASSISTANT_TIMEOUT_MS = 30000;

export function getErrorMessage(data, status) {
  if (typeof data?.error === 'string') return data.error;
  return data?.error?.message || `Request failed with status ${status}.`;
}

export async function request(path, options = {}, { timeoutMs = REQUEST_TIMEOUT_MS, fetchImpl = globalThis.fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${API_URL}${path}`, {
      ...options,
      // Sends and receives the httpOnly session cookie (also across :5173 -> :3000 in development).
      credentials: 'include',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers }
    });
  } catch (caught) {
    // fetch rejects on network failure or abort; the raw "Failed to fetch" message is not useful to a shopper.
    const timedOut = caught?.name === 'AbortError';
    const error = new Error(timedOut
      ? 'The ShopSmart server took too long to respond. Please try again.'
      : 'Cannot reach the ShopSmart server. Check your connection or try again shortly.');
    error.code = timedOut ? 'TIMEOUT' : 'NETWORK_ERROR';
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => null);
  if (response.status === 204) return null;
  if (!response.ok) {
    const error = new Error(getErrorMessage(data, response.status));
    error.status = response.status;
    error.code = data?.error?.code;
    throw error;
  }
  return data;
}

export const api = {
  getProducts: (query = '') => request(`/products${query ? `?search=${encodeURIComponent(query)}` : ''}`),
  getProduct: (id) => request(`/products/${id}`),
  createOrder: (order) => request('/orders', { method: 'POST', body: JSON.stringify(order) }),
  register: (account) => request('/auth/register', { method: 'POST', body: JSON.stringify(account) }),
  login: (credentials) => request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  getMyOrders: () => request('/orders'),
  getOrder: (id) => request(`/orders/${id}`),
  askAssistant: (question) => request('/assistant/questions', {
    method: 'POST', body: JSON.stringify({ question })
  }, { timeoutMs: ASSISTANT_TIMEOUT_MS })
};
