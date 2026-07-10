import axios from 'axios';
import { fork } from 'child_process';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), 'gateway/.env') });

const userServicePath = path.join(process.cwd(), 'services/user-service/dist/main.js');
const gatewayPath = path.join(process.cwd(), 'gateway/dist/main.js');

console.log('[Test] REDIS_URL in process.env:', process.env.REDIS_URL ? 'YES' : 'NO');

async function getHealthDashboard() {
  const response = await axios.get('http://localhost:3000/gateway/health/services');
  return response.data;
}

async function getCircuitDashboard() {
  const response = await axios.get('http://localhost:3000/gateway/circuits');
  return response.data;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('🚀 Starting E2E Circuit Breaker Tests...');

  let userServiceProcess = fork(userServicePath, [], {
    env: { ...process.env, PORT: '3001' },
    stdio: 'pipe',
  });
  userServiceProcess.stdout?.pipe(process.stdout);
  userServiceProcess.stderr?.pipe(process.stderr);
  
  const gatewayProcess = fork(gatewayPath, [], {
    env: { ...process.env, PORT: '3000' },
    stdio: 'pipe',
  });
  gatewayProcess.stdout?.pipe(process.stdout);
  gatewayProcess.stderr?.pipe(process.stderr);

  try {
    console.log('⏳ Waiting 5s for services to boot and register...');
    await sleep(5000);

    // Register User Service
    await axios.post('http://localhost:3000/gateway/services', {
      name: 'UserService-LB',
      basePath: '/users',
      strategy: 'ROUND_ROBIN',
    });
    await axios.post('http://localhost:3000/gateway/services/UserService-LB/instances', {
      host: 'localhost',
      port: 3001,
      weight: 1,
    });

    console.log('⏳ Waiting 6s for first health check to mark instance HEALTHY...');
    await sleep(6000);

    // Create API Key for testing proxy traffic
    const consumerRes = await axios.post('http://localhost:3000/gateway/consumers', { name: 'Test Consumer' });
    const consumerId = consumerRes.data.id;
    const apiKeyRes = await axios.post('http://localhost:3000/gateway/api-keys', { consumerId, name: 'Test Key' });
    const apiKey = apiKeyRes.data.key;
    const axiosConfig = { headers: { 'x-api-key': apiKey } };

    // --- Scenario 1: Healthy ---
    console.log('====================================================');
    console.log('🧪 Scenario 1: Healthy (Circuit stays CLOSED)');
    console.log('====================================================');
    const res = await axios.get('http://localhost:3000/users', axiosConfig);
    if (res.status !== 200) throw new Error('Expected 200 OK');
    
    let cbDashboard = await getCircuitDashboard();
    if (cbDashboard['UserService-LB']?.['3001'] !== 'CLOSED') {
      throw new Error('Expected circuit to be CLOSED');
    }
    console.log('✅ PASS: Circuit is CLOSED and requests succeed.\n');

    // --- Scenario 2: Fail Fast (OPEN) ---
    console.log('====================================================');
    console.log('🧪 Scenario 2: Fail Fast (Circuit OPENS on timeout)');
    console.log('====================================================');
    console.log('Injecting 4000ms delay to force timeouts. Threshold is 5 failures.');
    await axios.post('http://localhost:3001/health/delay', { delay: 4000 });

    for (let i = 0; i < 5; i++) {
      try {
        console.log(`Sending request ${i + 1}/5 (Expecting 502/Timeout)...`);
        await axios.get('http://localhost:3000/users', axiosConfig);
      } catch (error: any) {
        if (error.response?.status !== 502) {
          throw new Error(`Expected 502 from proxy timeout, got ${error.response?.status}`);
        }
      }
    }

    console.log('Testing Circuit Breaker Fail Fast...');
    const startFastFail = Date.now();
    try {
      await axios.get('http://localhost:3000/users', axiosConfig);
      throw new Error('Expected request to fail with 503');
    } catch (error: any) {
      if (error.response?.status !== 503) {
        throw new Error(`Expected 503 Circuit Open, got ${error.response?.status}`);
      }
      const duration = Date.now() - startFastFail;
      console.log(`✅ FAIL FAST: Rejected with 503 in ${duration}ms!`);
      if (duration > 2000) {
        throw new Error(`Fail fast took too long! ${duration}ms`);
      }
    }

    cbDashboard = await getCircuitDashboard();
    if (cbDashboard['UserService-LB']?.['3001'] !== 'OPEN') {
      throw new Error(`Expected circuit to be OPEN. Got: ${JSON.stringify(cbDashboard)}`);
    }
    console.log('✅ PASS: Circuit is OPEN and rejecting traffic instantly.\n');

    // --- Scenario 3: Half Open & Recovery ---
    console.log('====================================================');
    console.log('🧪 Scenario 3: Half Open & Recovery');
    console.log('====================================================');
    console.log('Removing delay from backend...');
    await axios.post('http://localhost:3001/health/delay', { delay: 0 }); // Reset

    console.log('Waiting 31 seconds for circuit cooldown (30s) to expire...');
    // We poll to avoid waiting the full 31s statically if it takes less, but we'll wait 31s
    await sleep(31000);

    console.log('Sending half-open probe request...');
    const recoveryRes = await axios.get('http://localhost:3000/users', axiosConfig);
    if (recoveryRes.status !== 200) {
      throw new Error(`Expected 200 OK for half-open recovery, got ${recoveryRes.status}`);
    }

    cbDashboard = await getCircuitDashboard();
    if (cbDashboard['UserService-CB']?.['3001'] !== 'CLOSED') {
      throw new Error(`Expected circuit to recover to CLOSED. Got: ${JSON.stringify(cbDashboard)}`);
    }
    console.log('✅ PASS: Circuit is CLOSED and service recovered!\n');

    console.log('🎉 All Circuit Breaker E2E Scenarios PASSED!');
  } catch (error: any) {
    console.error('❌ Test Failed!');
    console.error(error.message);
    if (error.response) {
      console.error(error.response.data);
    }
    process.exit(1);
  } finally {
    userServiceProcess.kill();
    gatewayProcess.kill();
  }
}

runTests();
