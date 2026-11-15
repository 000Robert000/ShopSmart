// ShopSmart smoke test. Uses only built-in fetch, so it runs anywhere Node 20+ runs.
//
//   node backend/scripts/smoke.js [apiUrl] [frontendOrigin] [--place-order]
//   node backend/scripts/smoke.js https://shop.example.com/api https://shop.example.com --place-order
//
// Read-only by default. --place-order creates two fictional example.com accounts and ONE simulated order,
// then checks guest, owner and other-customer access to that order.

const args = process.argv.slice(2);
const placeOrder = args.includes('--place-order');
const [apiUrl = 'http://localhost:3000/api', frontendOrigin] = args.filter((arg) => !arg.startsWith('--'));
const results = [];

// A tiny client that remembers its own session cookie, like one browser.
function client() {
  let cookie = '';
  return async function call(path, { method = 'GET', body, headers = {} } = {}) {
    const response = await fetch(`${apiUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const data = await response.json().catch(() => null);
    return { status: response.status, data, headers: response.headers, setCookie };
  };
}

async function check(name, run) {
  try {
    results.push({ name, pass: true, observed: await run() });
  } catch (error) {
    results.push({ name, pass: false, observed: error.message });
  }
}

function expect(condition, observed) {
  if (!condition) throw new Error(observed);
  return observed;
}

const guest = client();
let products = [];

await check('GET /health returns ok', async () => {
  const { status, data } = await guest('/health');
  return expect(status === 200 && data?.status === 'ok', `${status} ${JSON.stringify(data)}`);
});

await check('GET /health/ready reaches the database', async () => {
  const { status, data } = await guest('/health/ready');
  return expect(status === 200 && data?.database === 'ok', `${status} ${JSON.stringify(data)}`);
});

await check('GET /products lists products', async () => {
  const { status, data } = await guest('/products');
  products = data?.products ?? [];
  return expect(status === 200 && products.length > 0, `${status}, ${products.length} product(s)`);
});

await check('search "keyboard" finds a keyboard', async () => {
  const { status, data } = await guest('/products?search=keyboard');
  const names = (data?.products ?? []).map((product) => product.name);
  return expect(status === 200 && names.some((name) => /keyboard/i.test(name)), `${status} ${JSON.stringify(names)}`);
});

await check('search with no match returns an empty list', async () => {
  const { status, data } = await guest('/products?search=zzz-no-such-product');
  return expect(status === 200 && data?.products?.length === 0, `${status}, ${data?.products?.length} product(s)`);
});

await check('guest cannot list orders', async () => {
  const { status, data } = await guest('/orders');
  return expect(status === 401 && data?.error?.code === 'SIGN_IN_REQUIRED', `${status} ${data?.error?.code}`);
});

await check('guest cannot place an order', async () => {
  const { status, data } = await guest('/orders', { method: 'POST', body: { customerName: 'Guest', address: '123 Fictional Street, Test City', items: [{ productId: products[0]?.id ?? 1, quantity: 1 }] } });
  return expect(status === 401, `${status} ${data?.error?.code}`);
});

await check('wrong password is refused', async () => {
  const { status, data } = await client()('/auth/login', { method: 'POST', body: { email: 'nobody@example.com', password: 'wrong-password' } });
  return expect(status === 401 && data?.error?.code === 'INVALID_CREDENTIALS', `${status} ${data?.error?.code}`);
});

await check('assistant rejects a too-short question with a readable message', async () => {
  const { status, data } = await guest('/assistant/questions', { method: 'POST', body: { question: 'ab' } });
  return expect(status === 422 && typeof data?.error?.message === 'string', `${status} ${data?.error?.message}`);
});

await check('assistant answers a supported catalog question with sources', async () => {
  const { status, data } = await guest('/assistant/questions', { method: 'POST', body: { question: 'Which keyboard is below ₱2,000?' } });
  const names = (data?.sources ?? []).map((product) => product.name);
  return expect(status === 200 && names.some((name) => /keyboard/i.test(name)), `${status} mode=${data?.mode}${data?.fallbackReason ? `(${data.fallbackReason})` : ''} sources=${JSON.stringify(names)}`);
});

await check('assistant is honest when nothing matches', async () => {
  const { status, data } = await guest('/assistant/questions', { method: 'POST', body: { question: 'Do you have a tablet with a stylus?' } });
  return expect(status === 200 && data?.sources?.length === 0, `${status} mode=${data?.mode} "${data?.answer}"`);
});

if (frontendOrigin) {
  await check('CORS allows the frontend origin', async () => {
    const { headers } = await guest('/health', { headers: { Origin: frontendOrigin } });
    const allowed = headers.get('access-control-allow-origin');
    return expect(allowed === frontendOrigin, `access-control-allow-origin: ${allowed}`);
  });
}

if (placeOrder) {
  const stamp = Date.now();
  const ana = client();
  const ben = client();
  let orderId;
  let product;

  await check('fictional customer A can register (session cookie set)', async () => {
    const { status, data, setCookie } = await ana('/auth/register', { method: 'POST', body: { name: 'Ana Reyes', email: `ana.${stamp}@example.com`, password: 'Demo-pass-123' } });
    const flags = setCookie ? setCookie.split(';').slice(1).map((part) => part.trim()).filter((part) => !part.startsWith('Max-Age')).join('; ') : 'none';
    return expect(status === 201 && data?.customer?.id && !('passwordHash' in data.customer) && /HttpOnly/i.test(setCookie || ''), `${status} customer #${data?.customer?.id}; cookie flags: ${flags}`);
  });

  await check('fictional customer B can register', async () => {
    const { status, data } = await ben('/auth/register', { method: 'POST', body: { name: 'Ben Cruz', email: `ben.${stamp}@example.com`, password: 'Demo-pass-456' } });
    return expect(status === 201, `${status} customer #${data?.customer?.id}`);
  });

  await check('quantity above stock is refused without creating an order', async () => {
    const target = products.find((item) => item.stock > 0 && item.stock < 20);
    if (!target) return 'skipped: no product with stock below 20';
    const { status, data } = await ana('/orders', { method: 'POST', body: { customerName: 'Ana Reyes', address: 'Angeles City, Pampanga', items: [{ productId: target.id, quantity: target.stock + 1 }] } });
    const after = await guest(`/products/${target.id}`);
    return expect(status === 409 && after.data?.stock === target.stock, `${status} ${data?.error?.message}; stock still ${after.data?.stock}`);
  });

  await check('invalid checkout details are refused', async () => {
    const { status, data } = await ana('/orders', { method: 'POST', body: { customerName: 'A', address: 'short', items: [] } });
    return expect(status === 422 && data?.error?.code === 'INVALID_ORDER', `${status} ${data?.error?.code}`);
  });

  await check('signed-in customer A places one simulated order and stock drops', async () => {
    product = products.find((item) => item.stock > 0);
    const { status, data } = await ana('/orders', { method: 'POST', body: { customerName: 'Ana Reyes', address: 'Angeles City, Pampanga', items: [{ productId: product.id, quantity: 1 }] } });
    orderId = data?.id;
    const after = await guest(`/products/${product.id}`);
    return expect(status === 201 && data?.total === product.price && after.data?.stock === product.stock - 1,
      `${status} order #${orderId} total=${data?.total}; ${product.name} stock ${product.stock} -> ${after.data?.stock}`);
  });

  await check('owner A can read the order', async () => {
    const { status, data } = await ana(`/orders/${orderId}`);
    return expect(status === 200 && data?.id === orderId, `${status} order #${data?.id}`);
  });

  await check('owner A sees it in "my orders"', async () => {
    const { status, data } = await ana('/orders');
    return expect(status === 200 && data?.orders?.some((order) => order.id === orderId), `${status}, ${data?.orders?.length} order(s)`);
  });

  await check('guest is refused the order by direct API request', async () => {
    const { status, data } = await guest(`/orders/${orderId}`);
    return expect(status === 401, `${status} ${data?.error?.code}`);
  });

  await check('another customer B is denied the order by direct API request', async () => {
    const { status, data } = await ben(`/orders/${orderId}`);
    return expect(status === 403 && data?.error?.code === 'ORDER_FORBIDDEN', `${status} ${data?.error?.code}`);
  });

  await check('customer B does not see A\'s order in their list', async () => {
    const { status, data } = await ben('/orders');
    return expect(status === 200 && !data?.orders?.some((order) => order.id === orderId), `${status}, ${data?.orders?.length} order(s)`);
  });

  await check('after sign-out the session no longer works', async () => {
    await ana('/auth/logout', { method: 'POST' });
    const { status } = await ana('/auth/me');
    return expect(status === 401, `GET /auth/me after logout -> ${status}`);
  });
}

console.log(`ShopSmart smoke test  ${new Date().toISOString()}  API ${apiUrl}`);
for (const result of results) console.log(`${result.pass ? 'PASS' : 'FAIL'}  ${result.name}  — ${result.observed}`);
const failed = results.filter((result) => !result.pass).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
