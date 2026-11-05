import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAssistantResponse, getAssistantAnswer, parseBudget, rankProducts } from '../src/services/assistant.js';

const products = [
  { id: 1, name: 'Keyboard', category: 'Accessories', description: 'Mechanical keyboard', price: 1800, stock: 2, active: true },
  { id: 2, name: 'Mouse', category: 'Accessories', description: 'Wireless mouse', price: 600, stock: 3, active: true },
  { id: 3, name: 'Desk Pad', category: 'Accessories', description: 'Large mat', price: 400, stock: 0, active: true }
];

test('parseBudget extracts a peso budget', () => assert.equal(parseBudget('below ₱2,000'), 2000));
test('rankProducts respects the budget', () => assert.deepEqual(rankProducts(products, 'mouse below 700').map((p) => p.id), [2]));
test('assistant response contains traceable sources', () => assert.equal(buildAssistantResponse(products, 'keyboard').sources[0].id, 1));
test('getAssistantAnswer gives honest no match for out of stock items', async () => {
  const res = await getAssistantAnswer(products, 'desk pad');
  assert.equal(res.recommendedProducts.length, 0);
  assert.equal(res.sources.length, 0);
});