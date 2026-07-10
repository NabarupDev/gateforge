import { fork, ChildProcess } from 'child_process';
import * as path from 'path';
import * as http from 'http';

function makeRequest(
  method: string,
  urlStr: string,
  headers: Record<string, string> = {},
  bodyData?: any
): Promise<{ status: number; headers: http.IncomingHttpHeaders; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const bodyStr = bodyData ? JSON.stringify(bodyData) : undefined;
    const reqHeaders: Record<string, string> = { ...headers };
    if (bodyStr) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = String(Buffer.byteLength(bodyStr));
    }

    const req = http.request(
      url,
      {
        method,
        headers: reqHeaders,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let parsed: any = raw;
          try {
            parsed = JSON.parse(raw);
          } catch (e) {}
          resolve({ status: res.statusCode || 0, headers: res.headers, data: parsed });
        });
      }
    );

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(url: string, maxAttempts = 40): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await makeRequest('GET', url);
      return true;
    } catch (e) {
      await wait(500);
    }
  }
  return false;
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 GateForge v0.3.0 Phase 3 API Key Verification');
  console.log('====================================================\n');

  const rootDir = path.resolve(__dirname, '..');
  const userServicePath = path.join(rootDir, 'services', 'user-service', 'dist', 'main.js');
  const gatewayPath = path.join(rootDir, 'gateway', 'dist', 'main.js');

  console.log('Starting User Service (:3001)...');
  const userServiceProc: ChildProcess = fork(userServicePath, [], {
    cwd: path.join(rootDir, 'services', 'user-service'),
    env: { ...process.env, PORT: '3001' },
    stdio: 'inherit',
  });

  console.log('Starting GateForge API Gateway (:3000)...');
  const gatewayProc: ChildProcess = fork(gatewayPath, [], {
    cwd: path.join(rootDir, 'gateway'),
    env: { ...process.env, PORT: '3000' },
    stdio: 'inherit',
  });

  const cleanup = () => {
    try { userServiceProc.kill('SIGTERM'); } catch (e) {}
    try { gatewayProc.kill('SIGTERM'); } catch (e) {}
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);

  try {
    const userReady = await waitForServer('http://localhost:3001/users');
    if (!userReady) throw new Error('User Service failed to start inside timeout.');

    const gatewayReady = await waitForServer('http://localhost:3000/health');
    if (!gatewayReady) throw new Error('Gateway failed to start inside timeout.');

    console.log('✅ Both servers online. Starting test scenarios...\n');

    let passedCount = 0;
    let totalCount = 6;

    // Step 0: Create Consumer & Issue Keys for Testing
    console.log('[Setup] Creating consumer and issuing test API keys...');
    const createConsumerRes = await makeRequest('POST', 'http://localhost:3000/gateway/consumers', {}, {
      name: 'E2E Test Consumer',
      description: 'Automated test suite consumer',
    });
    const consumer = createConsumerRes.data;
    console.log(` -> Consumer created: ${consumer.name} (${consumer.id})`);

    // Issue active key
    const activeKeyRes = await makeRequest('POST', 'http://localhost:3000/gateway/api-keys', {}, {
      consumerIdOrName: consumer.id,
      name: 'Active Production Key',
      prefixType: 'gf_live',
    });
    const activeKey = activeKeyRes.data;
    console.log(` -> Active API Key issued: ${activeKey.key}`);

    // Issue key to be revoked later
    const revokeKeyRes = await makeRequest('POST', 'http://localhost:3000/gateway/api-keys', {}, {
      consumerIdOrName: consumer.id,
      name: 'Key To Revoke',
      prefixType: 'gf_live',
    });
    const revokeKey = revokeKeyRes.data;

    // Issue expired key
    const expiredDate = new Date(Date.now() - 60 * 1000).toISOString();
    const expiredKeyRes = await makeRequest('POST', 'http://localhost:3000/gateway/api-keys', {}, {
      consumerIdOrName: consumer.id,
      name: 'Already Expired Key',
      prefixType: 'gf_test',
      expiresAt: expiredDate,
    });
    const expiredKey = expiredKeyRes.data;

    // Also get a valid JWT for testing Priority
    const jwtRes = await makeRequest('POST', 'http://localhost:3000/auth/token', {}, {
      id: '1',
      email: 'alice@gateforge.com',
      role: 'admin',
    });
    const jwtToken =
      jwtRes.data?.access_token ||
      jwtRes.data?.data?.access_token ||
      jwtRes.data?.accessToken ||
      jwtRes.data?.data?.accessToken;
    console.log(` -> Test JWT acquired: ${jwtToken ? jwtToken.slice(0, 20) + '...' : 'NONE'}\n`);

    // Scenario 1: API Key Priority Test (Both JWT and API Key provided)
    console.log('Scenario 1: API Key Priority Test (JWT vs API Key)...');
    const s1Res = await makeRequest(
      'GET',
      'http://localhost:3000/users/me',
      {
        Authorization: `Bearer ${jwtToken}`,
        'x-api-key': activeKey.key,
      }
    );
    if (s1Res.status === 200 && s1Res.data?.data?.authType === 'jwt') {
      console.log(' -> ✅ PASSED: JWT took priority (authType: jwt).\n');
      passedCount++;
    } else {
      console.error(` -> ❌ FAILED: Expected status 200 and authType jwt, got ${s1Res.status} / ${JSON.stringify(s1Res.data)}\n`);
    }

    // Scenario 2: API Key Only Authentication
    console.log('Scenario 2: API Key Only Authentication & Identity Propagation...');
    const s2Res = await makeRequest(
      'GET',
      'http://localhost:3000/consumers/me',
      {
        'x-api-key': activeKey.key,
      }
    );
    if (
      s2Res.status === 200 &&
      s2Res.data?.data?.authType === 'api-key' &&
      s2Res.data?.data?.consumerId === consumer.id &&
      s2Res.data?.data?.apiKeyId === activeKey.id
    ) {
      console.log(` -> ✅ PASSED: Authenticated via API key. Consumer ID (${consumer.id}) and Key ID (${activeKey.id}) propagated to downstream service.\n`);
      passedCount++;
    } else {
      console.error(` -> ❌ FAILED: Expected 200 and api-key propagation, got ${s2Res.status} / ${JSON.stringify(s2Res.data)}\n`);
    }

    // Scenario 3: API Key Revocation Test
    console.log('Scenario 3: API Key Revocation Test...');
    await makeRequest('DELETE', `http://localhost:3000/gateway/api-keys/${revokeKey.id}/revoke`);
    const s3Res = await makeRequest(
      'GET',
      'http://localhost:3000/consumers/me',
      {
        'x-api-key': revokeKey.key,
      }
    );
    if (s3Res.status === 401) {
      console.log(' -> ✅ PASSED: Revoked API Key correctly rejected with 401 Unauthorized.\n');
      passedCount++;
    } else {
      console.error(` -> ❌ FAILED: Expected 401 for revoked key, got ${s3Res.status}\n`);
    }

    // Scenario 4: API Key Expiration Test
    console.log('Scenario 4: API Key Expiration Test...');
    const s4Res = await makeRequest(
      'GET',
      'http://localhost:3000/consumers/me',
      {
        'x-api-key': expiredKey.key,
      }
    );
    if (s4Res.status === 401) {
      console.log(' -> ✅ PASSED: Expired API Key correctly rejected with 401 Unauthorized.\n');
      passedCount++;
    } else {
      console.error(` -> ❌ FAILED: Expected 401 for expired key, got ${s4Res.status}\n`);
    }

    // Scenario 5: Usage Tracking & Quota Preparation Test
    console.log('Scenario 5: Usage Tracking & Quota Preparation Test...');
    // We already called activeKey in Scenario 2 (1 use). Let's call twice more.
    await makeRequest('GET', 'http://localhost:3000/consumers/me', { 'x-api-key': activeKey.key });
    await makeRequest('GET', 'http://localhost:3000/consumers/me', { 'x-api-key': activeKey.key });

    const consumersRes = await makeRequest('GET', 'http://localhost:3000/gateway/consumers');
    const testConsumer = (consumersRes.data || []).find((c: any) => c.id === consumer.id);
    const trackedKey = (testConsumer?.apiKeys || []).find((k: any) => k.id === activeKey.id);

    if (trackedKey && trackedKey.usageCount === 3 && trackedKey.lastUsedAt) {
      console.log(` -> ✅ PASSED: usageCount incremented precisely to 3 with lastUsedAt (${trackedKey.lastUsedAt}).\n`);
      passedCount++;
    } else {
      console.error(` -> ❌ FAILED: Expected usageCount 3, got ${trackedKey?.usageCount} / ${JSON.stringify(trackedKey)}\n`);
    }

    // Scenario 6: Missing or Invalid API Key
    console.log('Scenario 6: Missing or Invalid API Key...');
    const s6MissingRes = await makeRequest('GET', 'http://localhost:3000/admin');
    const s6InvalidRes = await makeRequest('GET', 'http://localhost:3000/admin', {
      'x-api-key': 'gf_live_invalidorcorruptedkey999999999',
    });
    if (s6MissingRes.status === 401 && s6InvalidRes.status === 401) {
      console.log(' -> ✅ PASSED: Both missing and invalid API keys correctly return 401 Unauthorized.\n');
      passedCount++;
    } else {
      console.error(` -> ❌ FAILED: Expected 401s, got ${s6MissingRes.status} and ${s6InvalidRes.status}\n`);
    }

    console.log('====================================================');
    console.log(`🏁 Summary: ${passedCount}/${totalCount} Test Scenarios Passed!`);
    console.log('====================================================\n');

    if (passedCount !== totalCount) {
      process.exitCode = 1;
    }
  } finally {
    cleanup();
  }
}

runTests();
