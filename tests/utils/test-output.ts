/**
 * Generated-project directories for integration tests.
 *
 * Suites install real dependency trees under test-output/. Those trees are
 * gitignored and are removed when a suite finishes, and again at the start and
 * end of a Vitest run, so a previous run cannot accumulate on disk.
 *
 * Set KEEP_TEST_OUTPUT=1 to leave the directory in place for debugging.
 */

import fs from "fs/promises";
import path from "path";

export const TEST_BASE_DIR = path.join(process.cwd(), "test-output");

export function keepTestOutput(): boolean {
    return process.env.KEEP_TEST_OUTPUT === "1";
}

export async function cleanupTestOutput(): Promise<void> {
    if (keepTestOutput()) return;
    await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
}

/**
 * Remove one generated project. Refuses paths outside test-output/.
 */
export async function removeTestProject(projectDir: string | undefined): Promise<void> {
    if (!projectDir || keepTestOutput()) return;

    const root = path.resolve(TEST_BASE_DIR);
    const resolved = path.resolve(projectDir);
    const relative = path.relative(root, resolved);
    if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`Refusing to remove a path outside ${root}`);
    }

    await fs.rm(resolved, { recursive: true, force: true });
}
