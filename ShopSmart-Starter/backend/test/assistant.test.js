import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AssistantUnavailableError, buildAssistantResponse, buildPrompt, selectEligibleProducts, validateAiReply, getAssistantAnswer, parseBudget, rankProducts
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

const reply = (answer, productIds) => JSON.stringify({ answer, productIds });

test('AI answers cite only the selected records, with prices from the database', async () => {
  const res = await getAssistantAnswer('keyboard', { ...rulesOnly, apiKey: 'test-key', models: ['m'], generate: async () => reply('Yes, try the Keyboard for ₱1,800.', [1]) });
  assert.equal(res.mode, 'ai');
  assert.deepEqual(ids(res.sources), [1]);
  assert.equal(res.sources[0].price, 1800);
});

test('an AI reply citing a product outside the selection is rejected (trust boundary)', async () => {
  const res = await getAssistantAnswer('keyboard', { ...rulesOnly, apiKey: 'test-key', models: ['m'], generate: async () => reply('Try the Ultra Tablet.', [99]) });
  assert.equal(res.mode, 'fallback');
  assert.equal(res.fallbackReason, 'invalid_response');
  assert.deepEqual(ids(res.sources), [1]);
});

test('an AI reply quoting a wrong price is rejected', async () => {
  const res = await getAssistantAnswer('keyboard', { ...rulesOnly, apiKey: 'test-key', models: ['m'], generate: async () => reply('The Keyboard costs ₱999.', [1]) });
  assert.equal(res.mode, 'fallback');
  assert.equal(res.fallbackReason, 'invalid_response');
});

test('a malformed AI reply is rejected', async () => {
  const res = await getAssistantAnswer('keyboard', { ...rulesOnly, apiKey: 'test-key', models: ['m'], generate: async () => 'Sure! The Keyboard is great.' });
  assert.equal(res.mode, 'fallback');
  assert.equal(res.fallbackReason, 'invalid_response');
});

test('a rate-limited provider is reported as rate_limited', async () => {
  const res = await getAssistantAnswer('keyboard', { ...rulesOnly, apiKey: 'test-key', models: ['m'], generate: async () => { throw new Error('[429 Too Many Requests] quota exceeded'); } });
  assert.equal(res.fallbackReason, 'rate_limited');
});

test('validateAiReply accepts fenced JSON and a budget echo', () => {
  const out = validateAiReply('```json\n{"answer":"Yes, below ₱2,000 try the Keyboard at ₱1,800.","productIds":[1]}\n```', products);
  assert.deepEqual(out.cited.map((p) => p.id), [1]);
});

test('the provider only receives public product fields of the selected records', () => {
  const selected = selectEligibleProducts(products, 'keyboard');
  const prompt = buildPrompt(selected, 'keyboard');
  assert.deepEqual(ids(selected), [1]);
  assert.doesNotMatch(prompt, /Mouse|Desk Pad|email|address|password|customer"/i);
  assert.match(prompt, /"id":1,"name":"Keyboard"/);
});

test('the mock provider is labelled and answers from the selected records', async () => {
  const res = await getAssistantAnswer('keyboard', { ...rulesOnly, provider: 'mock' });
  assert.equal(res.mode, 'mock');
  assert.match(res.answer, /^Simulated AI \(mock\)/);
  assert.deepEqual(ids(res.sources), [1]);
});

test('mock-down simulates a provider outage and ends in the fallback', async () => {
  const res = await getAssistantAnswer('keyboard', { ...rulesOnly, provider: 'mock-down' });
  assert.equal(res.mode, 'fallback');
  assert.equal(res.fallbackReason, 'provider_error');
});

test('a missing AI model is skipped and the next model answers', async () => {
  const tried = [];
  const generate = async (_prompt, { model }) => {
    tried.push(model);
    if (model === 'retired-model') throw new Error('[404 Not Found] model is no longer available');
    return reply('We have the Keyboard.', [1]);
  };
  const res = await getAssistantAnswer('keyboard', { ...rulesOnly, apiKey: 'test-key', models: ['retired-model', 'working-model'], generate });
  assert.deepEqual(tried, ['retired-model', 'working-model']);
  assert.equal(res.mode, 'ai');
  assert.equal(res.model, 'working-model');
  assert.deepEqual(ids(res.sources), [1]);
});

test('all AI models failing still gives the labelled rules fallback', async () => {
  const res = await getAssistantAnswer('keyboard', { ...rulesOnly, apiKey: 'test-key', models: ['a', 'b'], generate: async () => { throw new Error('503 overloaded'); } });
  assert.equal(res.mode, 'fallback');
  assert.deepEqual(ids(res.recommendedProducts), [1]);
});

test('the AI prompt carries the selected matches and the plural rule (defect D7)', async () => {
  let sent = '';
  await getAssistantAnswer('do you have keyboards', { ...rulesOnly, apiKey: 'test-key', models: ['m'], generate: async (prompt) => { sent = prompt; return reply('Yes, the Keyboard.', [1]); } });
  assert.match(sent, /Catalog records: \[\{"id":1,"name":"Keyboard"/);
  assert.match(sent, /Never say ShopSmart lacks something and then recommend/);
});
