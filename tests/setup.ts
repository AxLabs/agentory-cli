/**
 * Test Setup
 * 
 * Global setup and teardown for all tests
 * 
 * Environment Variables:
 * - TEST_PAYER_PRIVATE_KEY: (Optional) Private key for x402 paid request tests
 *   Only needed for testnet x402 payment verification.
 *   The wallet needs testnet USDC on the respective chains.
 * - KEEP_TEST_OUTPUT=1: Leave test-output/ on disk after the run.
 */

import 'dotenv/config';
import { beforeAll } from 'vitest';
import { resetPorts, TEST_BASE_DIR } from './utils/test-helpers.js';
import fs from 'fs/promises';

// Ensure test output directory exists at start. global-setup.ts removes it
// before and after the run; suites remove their own projects when they finish.
beforeAll(async () => {
    await fs.mkdir(TEST_BASE_DIR, { recursive: true });
    resetPorts();
    
    // Log x402 test status
    if (process.env.TEST_PAYER_PRIVATE_KEY) {
        console.log('✅ TEST_PAYER_PRIVATE_KEY set - x402 paid request tests will run');
    } else {
        console.log('⚠️  TEST_PAYER_PRIVATE_KEY not set - x402 paid request tests will be skipped');
    }
});
