import { cleanupTestOutput } from "./utils/test-output.js";

export async function setup(): Promise<void> {
    await cleanupTestOutput();
}

export async function teardown(): Promise<void> {
    await cleanupTestOutput();
}
