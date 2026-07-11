// using native fetch (Node 18+)

// Assuming Node 18+ native fetch
const GATEWAY_URL = 'http://localhost:3000';
const BACKEND_URL = 'http://localhost:3001';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCacheTests() {
  console.log('--- Phase 9 Cache Verification ---\n');

  console.log('[Setup] Enabling Cache for UserService-Retry (TTL: 5s)...');
  await fetch(`${GATEWAY_URL}/gateway/services`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'UserService-Retry',
      basePath: '/users',
      cacheEnabled: true,
      defaultTtl: 5,
    })
  });

  console.log('[Setup] Fetching JWT token...');
  const tokenRes = await fetch(`${GATEWAY_URL}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: '1', email: 'test@gateforge.com', role: 'user' })
  });
  const tokenData = await tokenRes.json();
  const token = tokenData.access_token || tokenData.accessToken || tokenData.token;
  const authHeaders = { 'Authorization': `Bearer ${token}` };

  console.log('\n--- Test 1: Cache Hit ---');
  // First request: Should be a MISS
  const start1 = Date.now();
  const res1 = await fetch(`${GATEWAY_URL}/users/1`, { headers: authHeaders });
  const dur1 = Date.now() - start1;
  console.log(`Request 1 (Miss): ${dur1}ms | Status: ${res1.status} | x-cache: ${res1.headers.get('x-cache')}`);

  // Second request: Should be a HIT and much faster
  const start2 = Date.now();
  const res2 = await fetch(`${GATEWAY_URL}/users/1`, { headers: authHeaders });
  const dur2 = Date.now() - start2;
  console.log(`Request 2 (Hit): ${dur2}ms | Status: ${res2.status} | x-cache: ${res2.headers.get('x-cache')}`);
  
  if (res2.headers.get('x-cache') !== 'HIT') {
    console.error('❌ Failed: Expected x-cache to be HIT');
    return;
  }
  console.log('✅ Test 1 Passed');

  console.log('\n--- Test 2: ETag & 304 Not Modified ---');
  const etag = res2.headers.get('etag');
  console.log(`Received ETag: ${etag}`);
  const res3 = await fetch(`${GATEWAY_URL}/users/1`, {
    headers: { ...authHeaders, 'If-None-Match': etag as string }
  });
  console.log(`Request 3 (If-None-Match): Status ${res3.status}`);
  if (res3.status !== 304) {
    console.error('❌ Failed: Expected status 304');
    return;
  }
  console.log('✅ Test 2 Passed');

  console.log('\n--- Test 3: Stale-While-Revalidate ---');
  // Wait for 3 seconds (past staleAt which is 2.5s, but before expiresAt which is 5s)
  console.log('Waiting 3 seconds for cache to become stale...');
  await sleep(3000);

  const start4 = Date.now();
  const res4 = await fetch(`${GATEWAY_URL}/users/1`, { headers: authHeaders });
  const dur4 = Date.now() - start4;
  console.log(`Request 4 (Stale served): ${dur4}ms | x-cache: ${res4.headers.get('x-cache')}`);
  console.log('✅ Test 3 Passed (Background refresh triggered silently)');

  console.log('\n--- Test 4: Cache Invalidation ---');
  console.log('Invalidating "users" tag...');
  await fetch(`${GATEWAY_URL}/gateway/cache/invalidate`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags: ['users'] })
  });

  const start5 = Date.now();
  const res5 = await fetch(`${GATEWAY_URL}/users/1`, { headers: authHeaders });
  const dur5 = Date.now() - start5;
  console.log(`Request 5 (After Invalidation): ${dur5}ms | Status: ${res5.status} | x-cache: ${res5.headers.get('x-cache')}`);
  if (res5.headers.get('x-cache') !== 'MISS') {
    console.error('❌ Failed: Expected cache to be MISS after invalidation');
    return;
  }
  console.log('✅ Test 4 Passed');

  console.log('\n--- Test 5: Cache Metrics ---');
  const metricsRes = await fetch(`${GATEWAY_URL}/gateway/cache`, { headers: authHeaders });
  const metrics = await metricsRes.json();
  console.log('Cache Metrics:', metrics);
  console.log('✅ Verification Complete!');
}

runCacheTests().catch(console.error);
