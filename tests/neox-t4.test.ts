import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CHAINS } from "../src/config.js";
import { generateProject } from "../src/generator.js";
import { isNeoxChain, NEOX_T4_CHAIN_ID, NEOX_T4_IDENTITY_REGISTRY } from "../src/neox/constants.js";
import { IDENTITY_REGISTRY_ABI } from "../src/neox/abi.js";
import type { WizardAnswers } from "../src/wizard.js";
import { wizardAnswersFromConfig } from "../src/generate-from-config.js";

const execFileAsync = promisify(execFile);
const OUTPUT_DIR = path.join(process.cwd(), "test-output", "neox-t4-generator");

async function execChecked(command: string, args: string[], cwd: string): Promise<void> {
    try {
        await execFileAsync(command, args, { cwd, maxBuffer: 10 * 1024 * 1024 });
    } catch (error) {
        const details = error as Error & { stdout?: string; stderr?: string };
        throw new Error(`${details.message}\n${details.stdout ?? ""}\n${details.stderr ?? ""}`);
    }
}

function neoxAnswers(overrides: Partial<WizardAnswers> = {}): WizardAnswers {
    return {
        projectDir: path.join(OUTPUT_DIR, "identity-fixture"),
        agentName: "AxLabs Neo X Scanner Test 01",
        agentDescription: "AxLabs scanner test fixture for Neo X T4.",
        agentImage:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        features: [],
        a2aStreaming: false,
        chain: "neox-t4",
        trustModels: [],
        agentWallet: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        ...overrides,
    };
}

describe("Neo X T4 chain configuration", () => {
    it("uses the contracts-repo T4 values", () => {
        const chain = CHAINS["neox-t4"];
        expect(chain).toBeDefined();
        expect(chain.name).toBe("Neo X T4 (Testnet)");
        expect(chain.chainId).toBe(12227332);
        expect(chain.chainId).toBe(NEOX_T4_CHAIN_ID);
        expect(chain.rpcUrl).toBe("https://neoxt4seed1.ngd.network");
        expect(chain.x402Supported).toBe(false);
        expect(chain.x402Providers).toEqual([]);
        expect(chain.scanPath).toBe("");
        expect(NEOX_T4_IDENTITY_REGISTRY).toBe("0x8004A856a396D08d31E597a867B1D8273901e641");
        expect(isNeoxChain("neox-t4")).toBe(true);
        expect(isNeoxChain("monad-testnet")).toBe(false);
    });

    it("embeds the exact ABI surface used by the registration flow", () => {
        const surface = IDENTITY_REGISTRY_ABI.map((fragment) => ({
            type: fragment.type,
            name: fragment.name,
            inputs: "inputs" in fragment ? fragment.inputs.map((input) => input.type) : [],
        }));
        expect(surface).toMatchInlineSnapshot(`
          [
            {
              "inputs": [],
              "name": "name",
              "type": "function",
            },
            {
              "inputs": [],
              "name": "getVersion",
              "type": "function",
            },
            {
              "inputs": [],
              "name": "register",
              "type": "function",
            },
            {
              "inputs": [
                "uint256",
                "string",
              ],
              "name": "setAgentURI",
              "type": "function",
            },
            {
              "inputs": [
                "uint256",
              ],
              "name": "ownerOf",
              "type": "function",
            },
            {
              "inputs": [
                "uint256",
              ],
              "name": "tokenURI",
              "type": "function",
            },
            {
              "inputs": [
                "uint256",
              ],
              "name": "getAgentWallet",
              "type": "function",
            },
            {
              "inputs": [
                "uint256",
                "string",
                "address",
              ],
              "name": "Registered",
              "type": "event",
            },
            {
              "inputs": [
                "uint256",
                "string",
                "address",
              ],
              "name": "URIUpdated",
              "type": "event",
            },
          ]
        `);
    });
});

describe("Neo X T4 generator routing", () => {
    beforeAll(async () => {
        await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
        await generateProject(neoxAnswers());
        await generateProject(neoxAnswers({
            projectDir: path.join(OUTPUT_DIR, "neofs-fixture"),
            agentName: "NeoFS fixture",
            metadataStorage: "neofs",
        }));
        await generateProject(neoxAnswers({
            projectDir: path.join(OUTPUT_DIR, "external-uri-fixture"),
            agentName: "External URI fixture",
            metadataStorage: "external",
            agentURI: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3fte3pr7x2v5w3x5v5q4y6x4a/agent.json",
        }));
    });

    it("generates a viem registration path instead of agent0-sdk", async () => {
        const projectDir = path.join(OUTPUT_DIR, "identity-fixture");
        const register = await fs.readFile(path.join(projectDir, "src/register.ts"), "utf8");
        const pkg = JSON.parse(await fs.readFile(path.join(projectDir, "package.json"), "utf8"));
        const envExample = await fs.readFile(path.join(projectDir, ".env.example"), "utf8");
        const readme = await fs.readFile(path.join(projectDir, "README.md"), "utf8");

        expect(register).toContain("runNeoxRegistrationCli");
        expect(register).not.toContain("agent0-sdk");
        expect(pkg.dependencies.viem).toBeDefined();
        expect(pkg.dependencies["agent0-sdk"]).toBeUndefined();
        expect(pkg.scripts.preflight).toBeDefined();
        expect(pkg.scripts.register).toBeDefined();
        expect(pkg.scripts.verify).toBeDefined();
        expect(envExample).toContain("PRIVATE_KEY=");
        expect(envExample).not.toMatch(/PRIVATE_KEY=0x[0-9a-fA-F]{64}/);
        expect(envExample).not.toContain("PINATA");
        expect(envExample).not.toContain("OPENAI");
        expect(envExample).not.toContain("METADATA_STORAGE=");
        expect(envExample).not.toContain("NEOFS_BEARER_TOKEN");
        expect(readme).toContain("GAS");
        expect(readme).toContain("https://xt4scan.ngd.network");
        expect(readme).not.toContain("8004scan.io");
        expect(readme).toContain("0x8004A856a396D08d31E597a867B1D8273901e641");

        const copied = await fs.readFile(path.join(projectDir, "src/neox/constants.ts"), "utf8");
        expect(copied).toContain("12227332");
        expect(await fs.stat(path.join(projectDir, "src/neox/storage/neofs.ts"))).toBeDefined();
    });

    it("generates NeoFS config and secret-free placeholders through --config", async () => {
        const answers = wizardAnswersFromConfig({
            projectDir: "demo-agent",
            agentName: "Neo X Demo Agent",
            agentDescription: "ERC-8004 agent registered on Neo X T4",
            chain: "neox-t4",
            metadataStorage: "neofs",
        });
        expect(answers.metadataStorage).toBe("neofs");

        const projectDir = path.join(OUTPUT_DIR, "neofs-fixture");
        const envExample = await fs.readFile(path.join(projectDir, ".env.example"), "utf8");
        const config = await fs.readFile(path.join(projectDir, "src/agent-config.ts"), "utf8");
        const readme = await fs.readFile(path.join(projectDir, "README.md"), "utf8");
        expect(envExample).not.toContain("METADATA_STORAGE=");
        expect(envExample).toContain("NEOFS_REST_GATEWAY=");
        expect(envExample).toContain("NEOFS_CONTAINER_ID=");
        expect(envExample).toContain("NEOFS_PUBLIC_GATEWAY=");
        expect(envExample).toContain("NEOFS_BEARER_TOKEN=");
        expect(config).toContain('metadataStorage: "neofs"');
        expect(readme).toContain("publishes metadata to NeoFS");
        expect(readme).toContain('change it from `"neofs"` to `"inline"`');
        expect(readme).not.toMatch(/NEOFS_BEARER_TOKEN=[^\s#]+/);
    });

    it("generates a provider-neutral external URI path without storage credentials", async () => {
        const projectDir = path.join(OUTPUT_DIR, "external-uri-fixture");
        const envExample = await fs.readFile(path.join(projectDir, ".env.example"), "utf8");
        const config = await fs.readFile(path.join(projectDir, "src/agent-config.ts"), "utf8");
        const readme = await fs.readFile(path.join(projectDir, "README.md"), "utf8");

        expect(envExample).not.toContain("PINATA");
        expect(envExample).not.toContain("NEOFS_");
        expect(config).toContain('metadataStorage: "external"');
        expect(config).toContain("ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3fte3pr7x2v5w3x5v5q4y6x4a/agent.json");
        expect(readme).toContain("registered exactly as supplied");
        expect(readme).toContain("does not fetch, upload, normalize, rewrite, or remotely verify");
    });

    it(
        "compiles generated inline and NeoFS projects",
        async () => {
            for (const fixture of ["identity-fixture", "neofs-fixture"]) {
                const projectDir = path.join(OUTPUT_DIR, fixture);
                const packageManager = process.env.TEST_PACKAGE_MANAGER === "pnpm" ? "pnpm" : "npm";
                const installArgs = packageManager === "pnpm"
                    ? ["install", "--no-frozen-lockfile"]
                    : ["install", "--no-fund", "--no-audit"];
                await execChecked(packageManager, installArgs, projectDir);
                const compileArgs = packageManager === "pnpm"
                    ? ["exec", "tsc", "--noEmit"]
                    : ["exec", "--", "tsc", "--noEmit"];
                await execChecked(packageManager, compileArgs, projectDir);
            }
        },
        300000,
    );
});
