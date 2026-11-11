import { describe, expect, it } from 'vitest';
import { getErrorMessage, request } from './api.js';

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('api request', () => {
  it('returns parsed JSON for a successful response', async () => {
    const data = await request('/health', {}, { fetchImpl: async () => jsonResponse(200, { status: 'ok' }) });
    expect(data.status).toBe('ok');
  });

  it('uses the API error message and code', async () => {
    const fetchImpl = async () => jsonResponse(409, { error: { code: 'INSUFFICIENT_STOCK', message: 'Only 2 unit(s) of Laptop Stand are available.' } });
    await expect(request('/orders', { method: 'POST' }, { fetchImpl })).rejects.toThrow('Only 2 unit(s)');
  });

  it('accepts a plain string error body', () => {
    expect(getErrorMessage({ error: 'Question is required' }, 400)).toBe('Question is required');
  });

  it('turns a network failure into a useful message', async () => {
    const fetchImpl = async () => { throw new TypeError('Failed to fetch'); };
    await expect(request('/products', {}, { fetchImpl })).rejects.toThrow('Cannot reach the ShopSmart server');
  });

  it('times out a request that never answers so loading can end', async () => {
    const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
    await expect(request('/assistant/questions', {}, { fetchImpl, timeoutMs: 20 })).rejects.toThrow('took too long');
  });
});
