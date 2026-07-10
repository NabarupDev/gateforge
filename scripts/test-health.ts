import { fork, ChildProcess } from 'child_process';
import axios from 'axios';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../gateway/.env') });

let gatewayProcess: ChildProcess;
let userServiceProcess: ChildProcess;

const GATEWAY_URL = 'http://localhost:3000';

async function getHealthDashboard() {
  const res = await axios.get(`${GATEWAY_URL}/gateway/health/services`);
  return res.data;
}

async function run() {
  console.log('====================================================');
  console.log('🧪 Starting GateForge Phase 6 Active Health Monitor E2E Tests');
  console.log('====================================================\n');

  try {
    // 1. Start User Service on 3001
    const userServicePath = path.resolve(__dirname, '../services/user-service/dist/main.js');
    userServiceProcess = fork(userServicePath, [], {
      env: { ...process.env, PORT: '3001' },
      stdio: 'pipe',
    });
    userServiceProcess.stdout?.pipe(process.stdout);
    userServiceProcess.stderr?.pipe(process.stderr);
    console.log('[Setup] Started User Service on :3001');

    // 2. Start Gateway
    const gatewayPath = path.resolve(__dirname, '../gateway/dist/main.js');
    gatewayProcess = fork(gatewayPath, [], {
      env: { ...process.env, PORT: '3000' },
      stdio: 'pipe',
    });
    gatewayProcess.stdout?.pipe(process.stdout);
    gatewayProcess.stderr?.pipe(process.stderr);
    console.log('[Setup] Started GateForge Gateway on :3000');

    console.log('[Setup] Waiting 8s for services to boot and register...');
    await new Promise((resolve) => setTimeout(resolve, 8000));

    console.log('[Setup] Registering UserService-LB and instance :3001 in Gateway...');
    await axios.post(`${GATEWAY_URL}/gateway/services`, {
      name: 'UserService-LB',
      basePath: '/users',
      strategy: 'ROUND_ROBIN',
      enabled: true,
    });
    await axios.post(`${GATEWAY_URL}/gateway/services/UserService-LB/instances`, {
      host: 'localhost',
      port: 3001,
      weight: 1,
      healthy: true,
    });

    // --- Scenario 1: Detects Healthy Service ---
    console.log('\n====================================================');
    console.log('🧪 Scenario 1: Detects Healthy Service (3 Probes)');
    console.log('====================================================');
    console.log('Waiting 8s more for HealthMonitor 5s intervals...');
    await new Promise((resolve) => setTimeout(resolve, 8000));

    let dashboard = await getHealthDashboard();
    let instance3001 = dashboard['UserService-LB']?.find((i: any) => i.port === 3001);
    
    if (!instance3001 || !['HEALTHY', 'DEGRADED'].includes(instance3001.status)) {
      throw new Error(`Scenario 1 Failed: Instance not HEALTHY. Got: ${JSON.stringify(instance3001)}`);
    }
    console.log(`✅ PASS: Instance 3001 is ${instance3001.status} with ${instance3001.latency}ms latency\n`);

    // --- Scenario 2: Slow Response (DEGRADED) ---
    console.log('====================================================');
    console.log('🧪 Scenario 2: Slow Response (DEGRADED)');
    console.log('====================================================');
    console.log('Injecting 2500ms delay to /health and waiting 16s (3 probes)...');
    await axios.post('http://localhost:3001/health/delay', { delay: 2500 });
    await new Promise((resolve) => setTimeout(resolve, 16000));

    dashboard = await getHealthDashboard();
    instance3001 = dashboard['UserService-LB']?.find((i: any) => i.port === 3001);
    if (instance3001?.status !== 'DEGRADED') {
      throw new Error(`Scenario 2 Failed: Instance not DEGRADED. Got: ${JSON.stringify(instance3001)}`);
    }
    console.log(`✅ PASS: Instance 3001 marked DEGRADED with ${instance3001.latency}ms latency\n`);
    await axios.post('http://localhost:3001/health/delay', { delay: 0 }); // Reset

    // --- Scenario 3: Failure Detection (UNHEALTHY) ---
    console.log('====================================================');
    console.log('🧪 Scenario 3: Failure Detection (UNHEALTHY)');
    console.log('====================================================');
    console.log('Killing User Service and waiting 16s (3 probes)...');
    userServiceProcess.kill();
    await new Promise((resolve) => setTimeout(resolve, 16000));

    dashboard = await getHealthDashboard();
    instance3001 = dashboard['UserService-LB']?.find((i: any) => i.port === 3001);
    if (instance3001?.status !== 'UNHEALTHY') {
      throw new Error(`Scenario 3 Failed: Instance not UNHEALTHY. Got: ${JSON.stringify(instance3001)}`);
    }
    console.log(`✅ PASS: Instance 3001 marked UNHEALTHY after failure\n`);

    // --- Scenario 4: Automatic Recovery (HEALTHY) ---
    console.log('====================================================');
    console.log('🧪 Scenario 4: Automatic Recovery (HEALTHY)');
    console.log('====================================================');
    console.log('Restarting User Service and waiting 20s for boot + 3 probes...');
    userServiceProcess = fork(userServicePath, [], {
      env: { ...process.env, PORT: '3001' },
      stdio: 'pipe',
    });
    userServiceProcess.stdout?.pipe(process.stdout);
    userServiceProcess.stderr?.pipe(process.stderr);
    await new Promise((resolve) => setTimeout(resolve, 20000));

    dashboard = await getHealthDashboard();
    instance3001 = dashboard['UserService-LB']?.find((i: any) => i.port === 3001);
    if (!instance3001 || !['HEALTHY', 'DEGRADED'].includes(instance3001.status)) {
      throw new Error(`Scenario 4 Failed: Instance did not recover to HEALTHY. Got: ${JSON.stringify(instance3001)}`);
    }
    console.log(`✅ PASS: Instance 3001 successfully recovered to ${instance3001.status}\n`);

    console.log('====================================================');
    console.log('🎉 All Phase 6 E2E Health Monitoring Scenarios PASSED!');
    console.log('====================================================');
    
  } catch (error) {
    console.error('\n❌ E2E Tests Failed:');
    console.error(error);
    process.exit(1);
  } finally {
    if (gatewayProcess) gatewayProcess.kill();
    if (userServiceProcess) userServiceProcess.kill();
    process.exit(0);
  }
}

run();
