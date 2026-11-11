// ShopSmart API smoke test. Uses only built-in fetch, so it runs anywhere Node 20+ runs.
//
//   node backend/scripts/smoke.js [apiUrl] [frontendOrigin] [--place-order]
//   node backend/scripts/smoke.js http://localhost:3000/api http://localhost:5173 --place-order
//
// Read-only by default. --place-order creates ONE simulated order for a fictional customer.

const args = process.argv.slice(2);
const placeOrder = args.includes('--place-order');
const [apiUrl = 'http://localhost:3000/api', frontendOrigin] = args.filter((arg) => !arg.startsWith('--'));
const results = [];

async function call(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data, headers: response.headers };
}

async function check(name, run) {
  try {
    const observed = await run();
    results.push({ name, pass: true, observed });
  } catch (error) {
    results.push({ name, pass: false, observed: error.message });
  }
}

function expect(condition, observed) {
  if (!condition) throw new Error(observed);
  return observed;
}

let products = [];

await check('GET /health returns ok', async () => {
  const { status, data } = await call('/health');
  return expect(status === 200 && data?.status === 'ok', `${status} ${JSON.stringify(data)}`);
});

await check('GET /products lists products', async () => {
  const { status, data } = await call('/products');
  products = data?.products ?? [];
  return expect(status === 200 && products.length > 0, `${status}, ${products.length} product(s)`);
});

await check('search "keyboard" finds a keyboard', async () => {
  const { status, data } = await call('/products?search=keyboard');
  const names = (data?.products ?? []).map((product) => product.name);
  return expect(status === 200 && names.some((name) => /keyboard/i.test(name)), `${status} ${JSON.stringify(names)}`);
});

await check('search with no match returns an empty list', async () => {
  const { status, data } = await call('/products?search=zzz-no-such-product');
  return expect(status === 200 && data?.products?.length === 0, `${status}, ${data?.products?.length} product(s)`);
});

await check('invalid product id is refused', async () => {
  const { status, data } = await call('/products/abc');
  return expect(status === 400, `${status} ${data?.error?.code}`);
});

await check('invalid checkout details are refused', async () => {
  const { status, data } = await call('/orders', { method: 'POST', body: { customerName: 'A', email: 'not-an-email', address: 'short', items: [] } });
  return expect(status === 422 && data?.error?.code === 'INVALID_ORDER', `${status} ${data?.error?.code}`);
});

await check('quantity above stock is refused without creating an order', async () => {
  const product = products.find((item) => item.stock < 20);
  if (!product) return 'skipped: no product with stock below 20';
  const { status, data } = await call('/orders', {
    method: 'POST',
    body: { customerName: 'Smoke Test', email: 'smoke@example.com', address: '123 Fictional Street, Test City', items: [{ productId: product.id, quantity: product.stock + 1 }] }
  });
  const after = await call(`/products/${product.id}`);
  return expect(status === 409 && after.data?.stock === product.stock, `${status} ${data?.error?.message}; stock still ${after.data?.stock}`);
});

await check('assistant rejects a too-short question with a readable message', async () => {
  const { status, data } = await call('/assistant/questions', { method: 'POST', body: { question: 'ab' } });
  return expect(status === 422 && typeof data?.error?.message === 'string', `${status} ${data?.error?.message}`);
});

await check('assistant answers a supported catalog question with sources', async () => {
  const { status, data } = await call('/assistant/questions', { method: 'POST', body: { question: 'Which keyboard is below ₱2,000?' } });
  const names = (data?.sources ?? []).map((product) => product.name);
  return expect(status === 200 && names.some((name) => /keyboard/i.test(name)), `${status} mode=${data?.mode} sources=${JSON.stringify(names)}`);
});

await check('assistant is honest when nothing matches', async () => {
  const { status, data } = await call('/assistant/questions', { method: 'POST', body: { question: 'Do you have a tablet with a stylus?' } });
  return expect(status === 200 && data?.sources?.length === 0, `${status} "${data?.answer}"`);
});

if (frontendOrigin) {
  await check('CORS allows the frontend origin', async () => {
    const { headers } = await call('/health', { headers: { Origin: frontendOrigin } });
    const allowed = headers.get('access-control-allow-origin');
    return expect(allowed === frontendOrigin, `access-control-allow-origin: ${allowed}`);
  });
}

if (placeOrder) {
  await check('valid fictional checkout creates one order and reduces stock', async () => {
    const product = products.find((item) => item.stock > 0);
    const { status, data } = await call('/orders', {
      method: 'POST',
      body: { customerName: 'Ana Reyes', email: 'ana@example.com', address: 'Angeles City, Pampanga', items: [{ productId: product.id, quantity: 1 }] }
    });
    const after = await call(`/products/${product.id}`);
    return expect(
      status === 201 && data?.total === product.price && after.data?.stock === product.stock - 1,
      `${status} order #${data?.id} total=${data?.total}; ${product.name} stock ${product.stock} -> ${after.data?.stock}`
    );
  });
}

console.log(`ShopSmart smoke test  ${new Date().toISOString()}  API ${apiUrl}`);
for (const result of results) console.log(`${result.pass ? 'PASS' : 'FAIL'}  ${result.name}  — ${result.observed}`);
const failed = results.filter((result) => !result.pass).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
