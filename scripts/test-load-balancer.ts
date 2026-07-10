import { spawn, fork, ChildProcess } from 'child_process';
import * as path from 'path';
import axios from 'axios';
import * as http from 'http';
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
  console.log('🚀 GateForge v0.5.0 Phase 5 Load Balancer & Registry');
  console.log('====================================================\n');

  const rootDir = path.resolve(__dirname, '..');
  const userServicePath = path.join(rootDir, 'services', 'user-service', 'dist', 'main.js');
  const gatewayPath = path.join(rootDir, 'gateway', 'dist', 'main.js');

  console.log('Starting User Service Instance 1 (:3001)...');
  const userProc1: ChildProcess = fork(userServicePath, [], {
    cwd: path.join(rootDir, 'services', 'user-service'),
    env: { ...process.env, PORT: '3001' },
    stdio: 'inherit',
  });

  console.log('Starting User Service Instance 2 (:3002)...');
  const userProc2: ChildProcess = fork(userServicePath, [], {
    cwd: path.join(rootDir, 'services', 'user-service'),
    env: { ...process.env, PORT: '3002' },
    stdio: 'inherit',
  });

  console.log('Starting User Service Instance 3 (:3003)...');
  const userProc3: ChildProcess = fork(userServicePath, [], {
    cwd: path.join(rootDir, 'services', 'user-service'),
    env: { ...process.env, PORT: '3003' },
    stdio: 'inherit',
  });

  console.log('Starting GateForge API Gateway (:3000)...');
  const gatewayProc: ChildProcess = fork(gatewayPath, [], {
    cwd: path.join(rootDir, 'gateway'),
    env: { ...process.env, PORT: '3000' },
    stdio: 'inherit',
  });

  let userProc4: ChildProcess | null = null;

  const cleanup = () => {
    try { userProc1.kill('SIGTERM'); } catch (e) {}
    try { userProc2.kill('SIGTERM'); } catch (e) {}
    try { userProc3.kill('SIGTERM'); } catch (e) {}
    if (userProc4) {
      try { userProc4.kill('SIGTERM'); } catch (e) {}
    }
    try { gatewayProc.kill('SIGTERM'); } catch (e) {}
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);

  try {
    const ready1 = await waitForServer('http://localhost:3001/users');
    const ready2 = await waitForServer('http://localhost:3002/users');
    const ready3 = await waitForServer('http://localhost:3003/users');
    const readyGw = await waitForServer('http://localhost:3000/health');

    if (!ready1 || !ready2 || !ready3 || !readyGw) {
      throw new Error('Failed to start all server instances inside timeout.');
    }

    console.log('✅ All initial server instances online.\n');

    // --- Setup: Generate API Key for authentication ---
    console.log('--- Setup: Generating API Key (`gf_live_...`) for authenticated downstream routing ---');
    const keyRes = await makeRequest('POST', 'http://localhost:3000/gateway/api-keys', {}, {
      name: 'LB-Test-Key',
      prefixType: 'gf_live',
    });
    const apiKey = keyRes.data?.key;
    if (!apiKey) {
      throw new Error(`Failed to generate API Key: ${JSON.stringify(keyRes.data)}`);
    }
    const authHeaders = { 'x-api-key': apiKey };
    console.log(`✅ API Key generated (${apiKey.substring(0, 15)}...)\n`);

    // --- Setup: Register Service and 3 Instances ---
    console.log('--- Setup: Registering UserService-LB (`/users`) with ROUND_ROBIN ---');
    await makeRequest('POST', 'http://localhost:3000/gateway/services', {}, {
      name: 'UserService-LB',
      basePath: '/users',
      strategy: 'ROUND_ROBIN',
      enabled: true,
    });

    await makeRequest('POST', 'http://localhost:3000/gateway/services/UserService-LB/instances', {}, { host: 'localhost', port: 3001, weight: 1, healthy: true });
    await makeRequest('POST', 'http://localhost:3000/gateway/services/UserService-LB/instances', {}, { host: 'localhost', port: 3002, weight: 1, healthy: true });
    await makeRequest('POST', 'http://localhost:3000/gateway/services/UserService-LB/instances', {}, { host: 'localhost', port: 3003, weight: 1, healthy: true });

    // --- Scenario 1: Round Robin Verification ---
    console.log('\n====================================================');
    console.log('🧪 Scenario 1: Round Robin Strategy Verification');
    console.log('====================================================');

    const rrPorts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await makeRequest('GET', 'http://localhost:3000/users/me', authHeaders);
      const port = String(res.headers['x-served-by-port'] || 'unknown');
      rrPorts.push(port);
    }
    console.log(`Round Robin sequence visited ports: ${rrPorts.join(' -> ')}`);
    const rrUnique = new Set(rrPorts);
    if (rrUnique.size !== 3 || !rrPorts.includes('3001') || !rrPorts.includes('3002') || !rrPorts.includes('3003')) {
      throw new Error(`Round Robin did not cycle through all 3 ports cleanly: ${rrPorts.join(', ')}`);
    }
    console.log('✅ PASS: Round Robin cycled evenly across 3001, 3002, 3003.');

    // --- Scenario 2: Weighted Round Robin (`WEIGHTED_ROUND_ROBIN`) ---
    console.log('\n====================================================');
    console.log('🧪 Scenario 2: Weighted Round Robin Strategy Verification (5 : 2 : 1)');
    console.log('====================================================');

    await makeRequest('POST', 'http://localhost:3000/gateway/services', {}, {
      name: 'UserService-LB',
      basePath: '/users',
      strategy: 'WEIGHTED_ROUND_ROBIN',
    });

    await makeRequest('POST', 'http://localhost:3000/gateway/services/UserService-LB/instances', {}, { host: 'localhost', port: 3001, weight: 5, healthy: true });
    await makeRequest('POST', 'http://localhost:3000/gateway/services/UserService-LB/instances', {}, { host: 'localhost', port: 3002, weight: 2, healthy: true });
    await makeRequest('POST', 'http://localhost:3000/gateway/services/UserService-LB/instances', {}, { host: 'localhost', port: 3003, weight: 1, healthy: true });

    const wrrCounts: Record<string, number> = { '3001': 0, '3002': 0, '3003': 0 };
    for (let i = 0; i < 16; i++) {
      const res = await makeRequest('GET', 'http://localhost:3000/users/me', authHeaders);
      const port = String(res.headers['x-served-by-port'] || 'unknown');
      if (wrrCounts[port] !== undefined) wrrCounts[port]++;
    }
    console.log(`Weighted Round Robin distribution over 16 calls -> 3001: ${wrrCounts['3001']}, 3002: ${wrrCounts['3002']}, 3003: ${wrrCounts['3003']}`);
    if (wrrCounts['3001'] !== 10 || wrrCounts['3002'] !== 4 || wrrCounts['3003'] !== 2) {
      throw new Error(`Weighted Round Robin distribution did not match exact 10:4:2 expectation! Got -> ${JSON.stringify(wrrCounts)}`);
    }
    console.log('✅ PASS: Weighted Round Robin produced exact 5:2:1 weight ratio distribution.');

    // --- Scenario 3: Least Connections (`LEAST_CONNECTIONS`) ---
    console.log('\n====================================================');
    console.log('🧪 Scenario 3: Least Connections Strategy Verification');
    console.log('====================================================');

    await makeRequest('POST', 'http://localhost:3000/gateway/services', {}, {
      name: 'UserService-LB',
      basePath: '/users',
      strategy: 'LEAST_CONNECTIONS',
    });

    // Reset weights back to 1
    await makeRequest('POST', 'http://localhost:3000/gateway/services/UserService-LB/instances', {}, { host: 'localhost', port: 3001, weight: 1, healthy: true });
    await makeRequest('POST', 'http://localhost:3000/gateway/services/UserService-LB/instances', {}, { host: 'localhost', port: 3002, weight: 1, healthy: true });
    await makeRequest('POST', 'http://localhost:3000/gateway/services/UserService-LB/instances', {}, { host: 'localhost', port: 3003, weight: 1, healthy: true });

    const lcPorts: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await makeRequest('GET', 'http://localhost:3000/users/me', authHeaders);
      lcPorts.push(String(res.headers['x-served-by-port']));
    }
    console.log(`Least Connections (idle tie-breaking) visited: ${lcPorts.join(' -> ')}`);
    if (new Set(lcPorts).size !== 3) {
      throw new Error(`Least connections tie breaking did not cycle through all candidates: ${lcPorts.join(', ')}`);
    }
    console.log('✅ PASS: Least Connections strategy successfully selected minimum load instances.');

    // --- Scenario 4: Instance Failure & Health Awareness ---
    console.log('\n====================================================');
    console.log('🧪 Scenario 4: Health Awareness & Instance Failure Handling');
    console.log('====================================================');

    // Find instance id of 3002
    const svcRes = await makeRequest('GET', 'http://localhost:3000/gateway/services/UserService-LB');
    const instances: any[] = svcRes.data?.instances || [];
    const inst3002 = instances.find((i: any) => i.port === 3002);
    if (!inst3002) throw new Error('Could not find instance with port 3002');

    console.log(`Injecting artificial 4000ms delay into instance :3002 to trigger HealthMonitor UNHEALTHY...`);
    await axios.post('http://localhost:3002/health/delay', { delay: 4000 });
    
    console.log(`Waiting 16 seconds for HealthMonitor to detect 3 consecutive failures...`);
    await new Promise((resolve) => setTimeout(resolve, 16000));

    const failPorts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await makeRequest('GET', 'http://localhost:3000/users/me', authHeaders);
      failPorts.push(String(res.headers['x-served-by-port']));
    }
    console.log(`After marking :3002 unhealthy, visited ports: ${failPorts.join(' -> ')}`);
    if (failPorts.includes('3002')) {
      throw new Error(`Gateway routed to unhealthy instance :3002! Visited: ${failPorts.join(', ')}`);
    }
    if (!failPorts.includes('3001') || !failPorts.includes('3003')) {
      throw new Error(`Gateway did not route across remaining healthy instances :3001 and :3003.`);
    }
    console.log('✅ PASS: Gateway ignored healthy: false instance (:3002) and distributed to :3001 & :3003.');

    // Restore health of 3002
    console.log(`Removing delay from instance :3002...`);
    await axios.post('http://localhost:3002/health/delay', { delay: 0 });
    console.log(`Waiting 16 seconds for HealthMonitor to detect 3 consecutive successes and restore instance...`);
    await new Promise((resolve) => setTimeout(resolve, 16000));

    // --- Scenario 5: Dynamic Registration (:3004) ---
    console.log('\n====================================================');
    console.log('🧪 Scenario 5: Dynamic Registration & Discovery (:3004)');
    console.log('====================================================');

    console.log('Spawning User Service Instance 4 on PORT=3004...');
    userProc4 = fork(userServicePath, [], {
      cwd: path.join(rootDir, 'services', 'user-service'),
      env: { ...process.env, PORT: '3004' },
      stdio: 'inherit',
    });

    const ready4 = await waitForServer('http://localhost:3004/users');
    if (!ready4) throw new Error('Instance 4 (:3004) failed to start inside timeout.');

    console.log('Dynamically registering :3004 under UserService-LB...');
    await makeRequest('POST', 'http://localhost:3000/gateway/services/UserService-LB/instances', {}, { host: 'localhost', port: 3004, weight: 1, healthy: true });

    const dynPorts: string[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await makeRequest('GET', 'http://localhost:3000/users/me', authHeaders);
      dynPorts.push(String(res.headers['x-served-by-port']));
    }
    console.log(`After dynamic registration without gateway restart, visited ports: ${dynPorts.join(' -> ')}`);
    if (!dynPorts.includes('3004')) {
      throw new Error(`Gateway failed to dynamically discover and route to new instance :3004!`);
    }
    console.log('✅ PASS: Gateway dynamically discovered and routed traffic to new instance :3004 without restarting.');

    console.log('\n====================================================');
    console.log('🎉 All Phase 5 E2E Load Balancer Scenarios PASSED!');
    console.log('====================================================\n');
  } catch (err: any) {
    console.error('❌ E2E Load Balancer Verification Failed:', err.message || err);
    cleanup();
    process.exit(1);
  } finally {
    cleanup();
  }
}

runTests();
