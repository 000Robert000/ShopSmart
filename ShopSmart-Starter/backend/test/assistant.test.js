import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AssistantUnavailableError, buildAssistantResponse, getAssistantAnswer, parseBudget, rankProducts
} from '../src/services/assistant.js';

const products = [
  { id: 1, name: 'Keyboard', category: 'Accessories', description: 'Mechanical keyboard', price: 1800, stock: 2, active: true },
  { id: 2, name: 'Mouse', category: 'Accessories', description: 'Wireless mouse', price: 600, stock: 3, active: true },
  { id: 3, name: 'Desk Pad', category: 'Accessories', description: 'Large mat', price: 400, stock: 0, active: true }
];

const seededCatalog = [
  { id: 1, name: 'Wireless Mouse', description: 'Quiet wireless mouse with adjustable sensitivity and USB receiver.', category: 'Accessories', price: 650, stock: 12, active: true },
  { id: 2, name: 'Compact Mechanical Keyboard', description: 'Hot-swappable compact keyboard with tactile switches.', category: 'Accessories', price: 1850, stock: 8, active: true },
  { id: 3, name: 'USB-C Study Lamp', description: 'Adjustable desk lamp with three brightness levels.', category: 'Study', price: 900, stock: 10, active: true },
  { id: 4, name: '1080p Webcam', description: 'Full HD webcam with privacy cover and built-in microphone.', category: 'Video', price: 1450, stock: 6, active: true },
  { id: 5, name: 'Laptop Stand', description: 'Foldable aluminum stand for laptops up to 16 inches.', category: 'Study', price: 1200, stock: 9, active: true },
  { id: 6, name: 'USB Headset', description: 'Over-ear headset with noise-reducing boom microphone.', category: 'Audio', price: 1350, stock: 7, active: true }
];

const rulesOnly = { loadProducts: async () => products, apiKey: '' };
const ids = (list) => list.map((product) => product.id);

test('parseBudget extracts a peso budget', () => assert.equal(parseBudget('below ₱2,000'), 2000));
test('parseBudget handles larger amounts with several commas', () => assert.equal(parseBudget('under ₱1,250,000'), 1250000));
test('rankProducts respects the budget', () => assert.deepEqual(ids(rankProducts(products, 'mouse below 700')), [2]));
test('assistant response contains traceable sources', () => assert.equal(buildAssistantResponse(products, 'keyboard').sources[0].id, 1));

test('getAssistantAnswer gives honest no match for out of stock items', async () => {
  // The original test called getAssistantAnswer(products, 'desk pad'), which passed the array as the
  // question and returned early, so the stock rule was never exercised.
  const res = await getAssistantAnswer('desk pad', rulesOnly);
  assert.equal(res.recommendedProducts.length, 0);
  assert.equal(res.sources.length, 0);
  assert.match(res.answer, /No products/);
});

test('punctuation does not hide a matching product (defect D1)', () => {
  assert.deepEqual(ids(rankProducts(seededCatalog, 'Do you have a webcam?')), [4]);
});

test('filler words do not recommend unrelated products (defect D1)', () => {
  assert.deepEqual(ids(rankProducts(seededCatalog, 'Do you have a tablet with a stylus?')), []);
  assert.deepEqual(ids(rankProducts(seededCatalog, 'What do you have for gaming?')), []);
});

test('the README keyboard question still finds the keyboard', () => {
  assert.deepEqual(ids(rankProducts(seededCatalog, 'Which keyboard is below ₱2,000?')), [2]);
});

test('a budget-only question lists in-stock products within budget', () => {
  assert.deepEqual(ids(rankProducts(seededCatalog, 'What can I get under ₱1,000?')), [1, 3]);
});

test('inactive products are never recommended', () => {
  const catalog = [...products, { id: 9, name: 'Retired Keyboard', category: 'Accessories', description: 'Old keyboard', price: 500, stock: 5, active: false }];
  assert.deepEqual(ids(rankProducts(catalog, 'keyboard')), [1]);
});

test('a catalog outage is reported as 503, not as "no matching products" (defect D2)', async () => {
  await assert.rejects(
    getAssistantAnswer('keyboard', { apiKey: '', loadProducts: async () => { throw new Error('connect ECONNREFUSED'); } }),
    (error) => error instanceof AssistantUnavailableError && error.status === 503 && error.code === 'ASSISTANT_UNAVAILABLE'
  );
});

test('an AI provider error falls back to catalog rules and says so', async () => {
  const res = await getAssistantAnswer('keyboard', { ...rulesOnly, apiKey: 'test-key', generate: async () => { throw new Error('quota exceeded'); } });
  assert.equal(res.mode, 'fallback');
  assert.deepEqual(ids(res.recommendedProducts), [1]);
});

test('a slow AI provider is cut off so loading ends', async () => {
  const started = Date.now();
  const res = await getAssistantAnswer('keyboard', { ...rulesOnly, apiKey: 'test-key', timeoutMs: 50, generate: () => new Promise(() => {}) });
  assert.equal(res.mode, 'fallback');
  assert.ok(Date.now() - started < 2000);
});

test('AI answers only cite products that exist in the catalog', async () => {
  const res = await getAssistantAnswer('keyboard', { ...rulesOnly, apiKey: 'test-key', generate: async () => 'Try the Keyboard, or the Ultra Tablet.' });
  assert.equal(res.mode, 'ai');
  assert.deepEqual(ids(res.sources), [1]);
});
