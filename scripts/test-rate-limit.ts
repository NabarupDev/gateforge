import { fork, ChildProcess } from 'child_process';
import * as path from 'path';
import * as http from 'http';
import Redis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../gateway/.env') });

function makeRequest(
  method: string,
  urlStr: string,
  headers: Record<string, string> = {},
  bodyData?: any,
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
      },
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
  console.log('🚀 GateForge v0.4.0 Phase 4 Distributed Rate Limiting');
  console.log('====================================================\n');

  const rootDir = path.resolve(__dirname, '..');
  const userServicePath = path.join(rootDir, 'services', 'user-service', 'dist', 'main.js');
  const gatewayPath = path.join(rootDir, 'gateway', 'dist', 'main.js');

  // Connect to Redis to clean up test keys before and between scenarios
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 3 });

  console.log('Starting User Service (:3001)...');
  const userServiceProc: ChildProcess = fork(userServicePath, [], {
    cwd: path.join(rootDir, 'services', 'user-service'),
    env: { ...process.env, PORT: '3001' },
    stdio: 'inherit',
  });

  console.log('Starting GateForge API Gateway Instance 1 (:3000)...');
  const gatewayProc1: ChildProcess = fork(gatewayPath, [], {
    cwd: path.join(rootDir, 'gateway'),
    env: { ...process.env, PORT: '3000' },
    stdio: 'inherit',
  });

  console.log('Starting GateForge API Gateway Instance 2 (:3002)...');
  const gatewayProc2: ChildProcess = fork(gatewayPath, [], {
    cwd: path.join(rootDir, 'gateway'),
    env: { ...process.env, PORT: '3002' },
    stdio: 'inherit',
  });

  const cleanup = () => {
    try {
      userServiceProc.kill('SIGTERM');
    } catch (e) {}
    try {
      gatewayProc1.kill('SIGTERM');
    } catch (e) {}
    try {
      gatewayProc2.kill('SIGTERM');
    } catch (e) {}
    try {
      if (redis && redis.status !== 'end') {
        redis.disconnect();
      }
    } catch (e) {}
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);

  try {
    const userReady = await waitForServer('http://localhost:3001/users');
    if (!userReady) throw new Error('User Service failed to start inside timeout.');

    const gatewayReady1 = await waitForServer('http://localhost:3000/health');
    if (!gatewayReady1) throw new Error('Gateway Instance 1 (:3000) failed to start inside timeout.');

    const gatewayReady2 = await waitForServer('http://localhost:3002/health');
    if (!gatewayReady2) throw new Error('Gateway Instance 2 (:3002) failed to start inside timeout.');

    console.log('✅ All servers online. Cleaning test keys from Redis...\n');
    const existingKeys = await redis.keys('rl:*');
    if (existingKeys.length > 0) {
      await redis.del(existingKeys);
    }

    let passedCount = 0;
    const totalCount = 6;

    // Scenario 1: Anonymous Client Quota (20/min) & Response Headers
    console.log('Scenario 1: Anonymous Client Quota (20/min) & Response Headers...');
    await redis.del('rl:ip:127.0.0.1');
    let s1LastHeaders: any = {};
    for (let i = 1; i <= 20; i++) {
      const res = await makeRequest('GET', 'http://localhost:3000/health');
      s1LastHeaders = res.headers;
      if (res.status !== 200) {
        console.error(` -> ❌ FAILED: Request ${i} expected 200, got ${res.status}`);
        break;
      }
    }
    const s1Limit = s1LastHeaders['x-ratelimit-limit'];
    const s1Remaining = s1LastHeaders['x-ratelimit-remaining'];
    console.log(` -> After 20 requests: Limit=${s1Limit}, Remaining=${s1Remaining}`);

    // Request 21 should return 429 Too Many Requests
    const s1Rejection = await makeRequest('GET', 'http://localhost:3000/health');
    if (
      s1Rejection.status === 429 &&
      s1Rejection.headers['retry-after'] &&
      s1Rejection.data?.error?.code === 'RATE_LIMIT_EXCEEDED'
    ) {
      console.log(` -> ✅ PASSED: Request #21 correctly blocked with 429 Too Many Requests (Retry-After: ${s1Rejection.headers['retry-after']}s).\n`);
      passedCount++;
    } else {
      console.error(` -> ❌ FAILED: Expected 429 with error block, got status ${s1Rejection.status} / data ${JSON.stringify(s1Rejection.data)}\n`);
    }

    // Scenario 2: Route Metadata Override (@RateLimit)
    console.log('Scenario 2: Route Metadata Override (@RateLimit)...');
    await redis.del('rl:ip:127.0.0.1:route:/test-rate-limit-override');
    for (let i = 1; i <= 5; i++) {
      await makeRequest('GET', 'http://localhost:3000/test-rate-limit-override');
    }
    const s2Rejection = await makeRequest('GET', 'http://localhost:3000/test-rate-limit-override');
    if (s2Rejection.status === 429 && s2Rejection.headers['x-ratelimit-limit'] === '5') {
      console.log(' -> ✅ PASSED: Endpoint override strictly limited to 5 requests (429 Too Many Requests).\n');
      passedCount++;
    } else {
      console.error(` -> ❌ FAILED: Expected status 429 with limit 5, got ${s2Rejection.status} / limit ${s2Rejection.headers['x-ratelimit-limit']}\n`);
    }

    // Scenario 3: JWT User Quota (100/min)
    console.log('Scenario 3: JWT User Quota (100/min)...');
    await redis.del('rl:ip:127.0.0.1');
    const jwtRes = await makeRequest('POST', 'http://localhost:3000/auth/token', {}, {
      id: '101',
      email: 'user101@gateforge.dev',
      role: 'user',
    });
    const token =
      jwtRes.data?.access_token ||
      jwtRes.data?.data?.access_token ||
      jwtRes.data?.accessToken ||
      jwtRes.data?.data?.accessToken;
    await redis.del('rl:user:101');
    const s3Res = await makeRequest('GET', 'http://localhost:3000/users/me', {
      Authorization: `Bearer ${token}`,
    });
    if (s3Res.status === 200 && s3Res.headers['x-ratelimit-limit'] === '100') {
      console.log(` -> ✅ PASSED: Authenticated JWT user correctly assigned 100/min policy (Remaining: ${s3Res.headers['x-ratelimit-remaining']}).\n`);
      passedCount++;
    } else {
      console.error(` -> ❌ FAILED: Expected limit 100, got ${s3Res.headers['x-ratelimit-limit']} (status ${s3Res.status})\n`);
    }

    // Scenario 4: API Key Quota (500/min)
    console.log('Scenario 4: API Key Quota (500/min)...');
    await redis.del('rl:ip:127.0.0.1');
    const createConsumerRes = await makeRequest('POST', 'http://localhost:3000/gateway/consumers', {}, {
      name: 'Rate Limit Test Consumer',
    });
    const consumerId = createConsumerRes.data.id;
    const activeKeyRes = await makeRequest('POST', 'http://localhost:3000/gateway/api-keys', {}, {
      consumerIdOrName: consumerId,
      name: '500-Limit Key',
    });
    const apiKey = activeKeyRes.data.key;
    const apiKeyId = activeKeyRes.data.id;
    await redis.del(`rl:apikey:${apiKeyId}`);
    await redis.del(`rl:apikey:${consumerId}`);

    const s4Res = await makeRequest('GET', 'http://localhost:3000/consumers/me', {
      'x-api-key': apiKey,
    });
    if (s4Res.status === 200 && s4Res.headers['x-ratelimit-limit'] === '500') {
      console.log(` -> ✅ PASSED: Authenticated API Key consumer assigned 500/min policy (Remaining: ${s4Res.headers['x-ratelimit-remaining']}).\n`);
      passedCount++;
    } else {
      console.error(` -> ❌ FAILED: Expected limit 500, got ${s4Res.headers['x-ratelimit-limit']} (status ${s4Res.status})\n`);
    }

    // Scenario 5: Admin Unlimited Bypass
    console.log('Scenario 5: Admin Unlimited Bypass...');
    await redis.del('rl:ip:127.0.0.1');
    const adminJwtRes = await makeRequest('POST', 'http://localhost:3000/auth/token', {}, {
      id: '999',
      email: 'admin@gateforge.dev',
      role: 'admin',
    });
    const adminToken =
      adminJwtRes.data?.access_token ||
      adminJwtRes.data?.data?.access_token ||
      adminJwtRes.data?.accessToken ||
      adminJwtRes.data?.data?.accessToken;
    let s5AllSuccess = true;
    let s5Headers: any = {};
    for (let i = 1; i <= 25; i++) {
      const res = await makeRequest('GET', 'http://localhost:3000/users/me', {
        Authorization: `Bearer ${adminToken}`,
      });
      s5Headers = res.headers;
      if (res.status !== 200) {
        s5AllSuccess = false;
        break;
      }
    }
    if (s5AllSuccess && s5Headers['x-ratelimit-limit'] === 'Unlimited') {
      console.log(` -> ✅ PASSED: Admin role bypassed rate limiting completely (${s5Headers['x-ratelimit-limit']} across 25 rapid calls).\n`);
      passedCount++;
    } else {
      console.error(` -> ❌ FAILED: Admin got status or header mismatch: ${s5Headers['x-ratelimit-limit']}\n`);
    }

    // Scenario 6: Multi-Instance Distributed Redis State Sharing (Gateway 1 & Gateway 2)
    console.log('Scenario 6: Multi-Instance Distributed Redis State Sharing (:3000 and :3002)...');
    await redis.del('rl:ip:127.0.0.1');

    console.log(' -> Sending 10 requests to Gateway Instance 1 (:3000)...');
    for (let i = 1; i <= 10; i++) {
      await makeRequest('GET', 'http://localhost:3000/health');
    }

    console.log(' -> Sending 10 requests to Gateway Instance 2 (:3002)...');
    for (let i = 1; i <= 10; i++) {
      await makeRequest('GET', 'http://localhost:3002/health');
    }

    // Now total quota for IP 127.0.0.1 is 20 across both instances!
    // Request #21 to Gateway Instance 2 (:3002) MUST be blocked with 429
    const s6RejectInst2 = await makeRequest('GET', 'http://localhost:3002/health');
    // Request #22 to Gateway Instance 1 (:3000) MUST ALSO be blocked with 429
    const s6RejectInst1 = await makeRequest('GET', 'http://localhost:3000/health');

    if (s6RejectInst2.status === 429 && s6RejectInst1.status === 429) {
      console.log(' -> ✅ PASSED: Both Gateway-1 (:3000) and Gateway-2 (:3002) rejected request #21 and #22 via shared Redis atomic sliding window state!\n');
      passedCount++;
    } else {
      console.error(` -> ❌ FAILED: Expected 429 from both instances, got Inst1=${s6RejectInst1.status}, Inst2=${s6RejectInst2.status}\n`);
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
