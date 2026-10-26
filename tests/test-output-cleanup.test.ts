import fs from "fs/promises";
import path from "path";
import { describe, expect, it } from "vitest";
import { cleanupTestOutput, removeTestProject, TEST_BASE_DIR } from "./utils/test-output.js";

const keepOutput = process.env.KEEP_TEST_OUTPUT === "1";

describe("test output cleanup", () => {
    it.skipIf(keepOutput)("removes one generated project and leaves its siblings", async () => {
        const keepDir = path.join(TEST_BASE_DIR, "keep-me");
        const dropDir = path.join(TEST_BASE_DIR, "drop-me", "node_modules", "pkg");
        await fs.mkdir(dropDir, { recursive: true });
        await fs.mkdir(keepDir, { recursive: true });
        await fs.writeFile(path.join(dropDir, "index.js"), "module.exports = 1;\n");

        await removeTestProject(path.join(TEST_BASE_DIR, "drop-me"));

        await expect(fs.stat(path.join(TEST_BASE_DIR, "drop-me"))).rejects.toThrow();
        await expect(fs.stat(keepDir)).resolves.toBeTruthy();
        await removeTestProject(keepDir);
    });

    it("refuses to remove the output root or a path outside it", async () => {
        const packageJson = path.join(process.cwd(), "package.json");
        await expect(removeTestProject(TEST_BASE_DIR)).rejects.toThrow(/outside/);
        await expect(removeTestProject(path.join(TEST_BASE_DIR, "..", "package.json"))).rejects.toThrow(/outside/);
        await expect(fs.stat(packageJson)).resolves.toBeTruthy();
    });

    it("ignores an unset project directory", async () => {
        await removeTestProject(undefined);
    });

    it.skipIf(keepOutput)("clears the whole test-output directory", async () => {
        const projectDir = path.join(TEST_BASE_DIR, "wipe-probe");
        await fs.mkdir(projectDir, { recursive: true });
        await fs.writeFile(path.join(projectDir, "marker.txt"), "x");

        await cleanupTestOutput();

        await expect(fs.stat(TEST_BASE_DIR)).rejects.toThrow();
        await expect(fs.stat(path.join(process.cwd(), "package.json"))).resolves.toBeTruthy();
    });
});
