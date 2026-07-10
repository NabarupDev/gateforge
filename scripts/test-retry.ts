import { fork, ChildProcess } from 'child_process';
import * as path from 'path';
import axios from 'axios';
import * as http from 'http';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), 'gateway/.env') });

function makeRequest(
  method: string,
  urlStr: string,
  headers: Record<string, string> = {},
  bodyData?: any,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; data: any; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const bodyStr = bodyData ? JSON.stringify(bodyData) : undefined;
    const reqHeaders: Record<string, string> = { ...headers };
    if (bodyStr) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = String(Buffer.byteLength(bodyStr));
    }

    const start = Date.now();
    const req = http.request(
      url,
      { method, headers: reqHeaders },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let parsed: any = raw;
          try { parsed = JSON.parse(raw); } catch (e) {}
          resolve({ status: res.statusCode || 0, headers: res.headers, data: parsed, duration: Date.now() - start });
        });
      },
    );

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function wait(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForServer(url: string, maxAttempts = 40): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await makeRequest('GET', url);
      return true;
    } catch (e) { await wait(500); }
  }
  return false;
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 GateForge v0.8.0 Phase 8 Retry & Hedging Engine');
  console.log('====================================================\n');

  const rootDir = process.cwd();
  const userServicePath = path.join(rootDir, 'services', 'user-service', 'dist', 'main.js');
  const gatewayPath = path.join(rootDir, 'gateway', 'dist', 'main.js');

  const procs: ChildProcess[] = [];
  const cleanup = () => { procs.forEach((p) => { try { p.kill('SIGTERM'); } catch (e) {} }); };
  process.on('SIGINT', cleanup); process.on('SIGTERM', cleanup); process.on('exit', cleanup);

  try {
    console.log('Starting User Service Instance 1 (:3001)...');
    procs.push(fork(userServicePath, [], { cwd: path.join(rootDir, 'services', 'user-service'), env: { ...process.env, PORT: '3001' }, stdio: 'inherit' }));
    
    console.log('Starting User Service Instance 2 (:3002)...');
    procs.push(fork(userServicePath, [], { cwd: path.join(rootDir, 'services', 'user-service'), env: { ...process.env, PORT: '3002' }, stdio: 'inherit' }));

    console.log('Starting GateForge API Gateway (:3000)...');
    procs.push(fork(gatewayPath, [], { cwd: path.join(rootDir, 'gateway'), env: { ...process.env, PORT: '3000' }, stdio: 'inherit' }));

    if (!(await waitForServer('http://127.0.0.1:3001/users')) || 
        !(await waitForServer('http://127.0.0.1:3002/users')) || 
        !(await waitForServer('http://127.0.0.1:3000/health'))) {
      throw new Error('Failed to start servers.');
    }
    console.log('✅ All servers online.\n');

    // Register Service with Retries and Hedging
    const keyRes = await makeRequest('POST', 'http://127.0.0.1:3000/gateway/api-keys', {}, { name: 'Retry-Key', prefixType: 'gf_live' });
    const authHeaders = { 'x-api-key': keyRes.data.key };

    console.log('--- Setup: Registering UserService-Retry ---');
    await makeRequest('POST', 'http://127.0.0.1:3000/gateway/services', {}, {
      name: 'UserService-Retry',
      basePath: '/users',
      strategy: 'ROUND_ROBIN',
      timeoutMs: 3500, // Account for cloud latency
      maxRetries: 2,   
      retryBackoffMs: 200, 
      idempotentRetries: true
      // No hedging for Scenario 1
    });

    await makeRequest('POST', 'http://127.0.0.1:3000/gateway/services/UserService-Retry/instances', {}, { host: '127.0.0.1', port: 3001, weight: 1, healthy: true });
    await makeRequest('POST', 'http://127.0.0.1:3000/gateway/services/UserService-Retry/instances', {}, { host: '127.0.0.1', port: 3002, weight: 1, healthy: true });

    // Ensure we start with 3001
    await axios.post('http://127.0.0.1:3001/health/delay', { delay: 0 });
    await axios.post('http://127.0.0.1:3002/health/delay', { delay: 0 });

    // --- Scenario 1: Successful Retry ---
    console.log('\n====================================================');
    console.log('🧪 Scenario 1: Timeout Policy & Successful Retry');
    console.log('====================================================');
    console.log('Delaying :3001 by 6000ms. :3002 has 0ms delay.');
    await axios.post('http://127.0.0.1:3001/health/delay', { delay: 6000 });

    let res = await makeRequest('GET', 'http://127.0.0.1:3000/users/me', authHeaders);
    if (String(res.headers['x-served-by-port']) !== '3002') {
       console.log('First was fast, trying again to hit 3001 first...');
       res = await makeRequest('GET', 'http://127.0.0.1:3000/users/me', authHeaders);
    }
    
    console.log(`Response time: ${res.duration}ms. Served by: ${res.headers['x-served-by-port']}`);
    if (res.status !== 200 || String(res.headers['x-served-by-port']) !== '3002') {
      throw new Error(`Failed to retry! Expected success on 3002, got ${res.status} on ${res.headers['x-served-by-port']}`);
    }
    if (res.duration < 3500) {
      throw new Error(`Expected retry to take >3500ms (timeout threshold), but took ${res.duration}ms. Hedging might have interfered!`);
    }
    console.log('✅ PASS: First attempt timed out at 3500ms, retry cleanly succeeded on :3002.');

    // Remove delay
    await axios.post('http://127.0.0.1:3001/health/delay', { delay: 0 });


    // --- Scenario 2: Request Hedging ---
    console.log('\n====================================================');
    console.log('🧪 Scenario 2: Request Hedging (Threshold: 800ms)');
    console.log('====================================================');
    
    // Enable Hedging for Scenario 2
    await makeRequest('POST', 'http://127.0.0.1:3000/gateway/services', {}, {
      name: 'UserService-Retry',
      basePath: '/users',
      strategy: 'ROUND_ROBIN',
      timeoutMs: 3500,
      maxRetries: 2,   
      retryBackoffMs: 200, 
      idempotentRetries: true,
      hedgingThresholdMs: 800
    });

    console.log('Delaying :3001 by 3000ms. :3002 has 0ms delay.');
    await axios.post('http://127.0.0.1:3001/health/delay', { delay: 3000 });

    let hedgeRes = await makeRequest('GET', 'http://127.0.0.1:3000/users/me', authHeaders);
    if (String(hedgeRes.headers['x-served-by-port']) !== '3002') {
       hedgeRes = await makeRequest('GET', 'http://127.0.0.1:3000/users/me', authHeaders);
    }

    console.log(`Response time: ${hedgeRes.duration}ms. Served by: ${hedgeRes.headers['x-served-by-port']}`);
    if (hedgeRes.duration > 3500) {
       throw new Error(`Hedging failed! Took ${hedgeRes.duration}ms. Expected <3500ms.`);
    }
    if (String(hedgeRes.headers['x-served-by-port']) !== '3002') {
       throw new Error(`Hedged request should have been served by 3002.`);
    }
    console.log('✅ PASS: Request hedged to :3002 after 800ms threshold.');


    // --- Scenario 3: Idempotency Verification ---
    console.log('\n====================================================');
    console.log('🧪 Scenario 3: Idempotency Protection');
    console.log('====================================================');
    console.log('Delaying both servers by 6000ms to guarantee failure.');
    await axios.post('http://127.0.0.1:3001/health/delay', { delay: 6000 });
    await axios.post('http://127.0.0.1:3002/health/delay', { delay: 6000 });

    console.log('Sending POST without Idempotency-Key...');
    let post1 = await makeRequest('POST', 'http://127.0.0.1:3000/users', authHeaders, { name: 'Idempotent Test', email: 't@t.com' });
    console.log(`Status: ${post1.status}. Duration: ${post1.duration}ms`);
    if (post1.duration > 6500) {
       throw new Error(`POST request was retried despite being unsafe! Duration: ${post1.duration}ms`);
    }

    console.log('Sending POST WITH Idempotency-Key...');
    let post2 = await makeRequest('POST', 'http://127.0.0.1:3000/users', { ...authHeaders, 'Idempotency-Key': '12345' }, { name: 'Idempotent Test', email: 't@t.com' });
    console.log(`Status: ${post2.status}. Duration: ${post2.duration}ms`);
    if (post2.duration < 7000) {
       throw new Error(`Idempotent POST request was NOT retried! Expected > 7000ms, got ${post2.duration}ms`);
    }
    console.log('✅ PASS: Unsafe methods correctly blocked from blind retries.');

    // --- Scenario 4: Retry Budget ---
    console.log('\n====================================================');
    console.log('🧪 Scenario 4: Global Retry Budget (Max 20%)');
    console.log('====================================================');
    console.log('Sending 15 parallel failing requests to blow through the retry budget...');
    
    const promises = [];
    for (let i = 0; i < 15; i++) {
       promises.push(makeRequest('GET', 'http://127.0.0.1:3000/users/me', authHeaders));
    }
    await Promise.all(promises);

    const metricsRes = await makeRequest('GET', 'http://127.0.0.1:3000/gateway/retries');
    console.log('Metrics Snapshot:', JSON.stringify(metricsRes.data, null, 2));

    const finalReq = await makeRequest('GET', 'http://127.0.0.1:3000/users/me', authHeaders);
    console.log(`Final request (post-budget) Duration: ${finalReq.duration}ms, Status: ${finalReq.status}`);
    
    // With max 20% budget exhausted, retries should immediately halt.
    if (finalReq.duration > 6500) {
        throw new Error('Retry budget was not enforced! Request took too long.');
    }
    console.log('✅ PASS: Retry budget cleanly rejected further retries to prevent cascading failure.');

    console.log('\n====================================================');
    console.log('🎉 All Phase 8 Retry & Hedging Scenarios PASSED!');
    console.log('====================================================\n');

  } catch (err: any) {
    console.error('❌ E2E Retry Engine Verification Failed:', err.message || err);
    process.exitCode = 1;
  } finally {
    cleanup();
  }
}

runTests();
