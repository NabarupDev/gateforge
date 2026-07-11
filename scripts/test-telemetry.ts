const GATEWAY_URL = 'http://localhost:3000';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTelemetryTests() {
  console.log('--- Phase 10 Telemetry Verification ---\n');

  // 1. Get token
  console.log('[Setup] Fetching JWT token...');
  const tokenRes = await fetch(`${GATEWAY_URL}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: '1', email: 'test@gateforge.com', role: 'user' })
  });
  const tokenData = await tokenRes.json();
  const token = tokenData.access_token || tokenData.accessToken || tokenData.token;
  const authHeaders = { 'Authorization': `Bearer ${token}` };

  // 2. Fire some requests to generate traces and metrics
  console.log('Firing test requests...');
  for (let i = 0; i < 5; i++) {
    await fetch(`${GATEWAY_URL}/users/1`, { headers: authHeaders });
    await sleep(100);
  }

  // Generate a rate limit or a 404
  for (let i = 0; i < 3; i++) {
    await fetch(`${GATEWAY_URL}/unknown-route`);
  }

  // 3. Fetch metrics
  console.log('\n--- Fetching Prometheus Metrics ---');
  const metricsRes = await fetch(`${GATEWAY_URL}/metrics`);
  const metricsTxt = await metricsRes.text();
  
  const relevantMetrics = metricsTxt.split('\n').filter(line => 
    line.startsWith('gateforge_') && !line.includes('bucket')
  ).join('\n');
  
  console.log(relevantMetrics);
  
  if (metricsTxt.includes('gateforge_requests_total')) {
    console.log('✅ Prometheus metrics successfully exposed!');
  } else {
    console.error('❌ Missing gateforge_requests_total metric');
  }
}

runTelemetryTests().catch(console.error);
