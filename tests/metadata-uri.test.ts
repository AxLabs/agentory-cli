import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Address } from "viem";
import { CHAINS } from "../src/config.js";
import { wizardAnswersFromConfig } from "../src/generate-from-config.js";
import { NEOX_T4_IDENTITY_REGISTRY } from "../src/neox/constants.js";
import {
    assertRegistrationMetadataUri,
    buildRegistrationMetadata,
    validateRegistrationMetadataUri,
} from "../src/neox/metadata.js";
import { buildSecretFreeResult } from "../src/neox/result.js";
import { createMetadataStorage } from "../src/neox/storage/index.js";
import { emptyState, persistMetadataPublished } from "../src/neox/state.js";
import type { AgentProjectConfig, RegistrationState } from "../src/neox/types.js";
import { verifyOnChain } from "../src/neox/verify.js";
import {
    generateEnvExample,
    generatePackageJson,
    generateReadme,
    generateRegisterScript,
} from "../src/templates/base.js";
import {
    generateMonadEnv,
    generateMonadReadme,
    generateMonadRegisterScript,
} from "../src/templates/monad.js";
import { generateNeoxAgentConfig, generateNeoxReadme } from "../src/templates/neox.js";
import { NORMAL_METADATA_STORAGE_CHOICES, type WizardAnswers } from "../src/wizard.js";

const OWNER = "0x1111111111111111111111111111111111111111" as Address;
const EXTERNAL_URIS = [
    "https://metadata.example/agents/42.json?version=1#registration",
    "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3fte3pr7x2v5w3x5v5q4y6x4a/agent.json",
    "neofs:container-id/object-id",
] as const;

function answers(overrides: Partial<WizardAnswers> = {}): WizardAnswers {
    return {
        projectDir: "test-agent",
        agentName: "URI Test Agent",
        agentDescription: "Uses externally managed registration metadata.",
        agentImage: "https://example.com/agent.png",
        features: [],
        a2aStreaming: false,
        chain: "base-sepolia",
        trustModels: [],
        agentWallet: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        metadataStorage: "external",
        agentURI: EXTERNAL_URIS[0],
        ...overrides,
    };
}

describe("user-provided registration metadata URI", () => {
    it.each(EXTERNAL_URIS)("accepts and preserves %s", (uri) => {
        expect(validateRegistrationMetadataUri(uri)).toEqual({ ok: true, value: uri });
        expect(assertRegistrationMetadataUri(uri)).toBe(uri);
    });

    it.each([
        ["", /required/],
        [" https://metadata.example/agent.json", /whitespace/],
        ["https://", /valid|host/],
        ["ipfs://", /CID/],
        ["neofs:", /object reference/],
        ["ftp://metadata.example/agent.json", /must use/],
        ["https://user:password@metadata.example/agent.json", /credentials/],
    ])("rejects invalid input %j with an actionable error", (uri, message) => {
        const result = validateRegistrationMetadataUri(uri as string);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.message).toMatch(message as RegExp);
    });

    it("exposes Use my own URI as the only normal non-managed wizard choice", () => {
        expect(NORMAL_METADATA_STORAGE_CHOICES).toEqual([
            { name: "Use my own URI", value: "external" },
        ]);
    });

    it("validates config input and preserves the exact URI", () => {
        const uri = EXTERNAL_URIS[1];
        const result = wizardAnswersFromConfig({
            projectDir: "agent",
            agentName: "Agent",
            agentDescription: "Description",
            chain: "neox-t4",
            metadataStorage: "external",
            agentURI: uri,
        });
        expect(result.metadataStorage).toBe("external");
        expect(result.agentURI).toBe(uri);

        expect(() => wizardAnswersFromConfig({
            projectDir: "agent",
            agentName: "Agent",
            agentDescription: "Description",
            chain: "neox-t4",
            metadataStorage: "external",
        })).toThrow(/URI is required/);
    });

    it("generates the SDK path without Pinata or an upload call", () => {
        const input = answers();
        const chain = CHAINS["base-sepolia"];
        const script = generateRegisterScript(input, chain);
        const env = generateEnvExample(input, chain);
        const readme = generateReadme(input, chain);
        const pkg = JSON.parse(generatePackageJson(input));

        expect(pkg.dependencies["agent0-sdk"]).toBe("1.7.1");
        expect(script).toContain(`const USER_PROVIDED_AGENT_URI = ${JSON.stringify(input.agentURI)}`);
        expect(script).toContain("registerHTTP(USER_PROVIDED_AGENT_URI)");
        expect(script).not.toContain("registerIPFS()");
        expect(script).not.toContain("pinataJwt");
        expect(env).not.toContain("PINATA_JWT");
        expect(readme).toContain("storage-provider API call");
        expect(readme).toContain("immutable");
        expect(readme).toContain("publicly readable");
    });

    it("generates the direct Monad path without Pinata or fetch", () => {
        const input = answers({ chain: "monad-testnet", agentURI: EXTERNAL_URIS[2] });
        const chain = CHAINS["monad-testnet"];
        const script = generateMonadRegisterScript(input, chain);
        const env = generateMonadEnv(input, chain);
        const readme = generateMonadReadme(input, chain);

        expect(script).toContain(`const USER_PROVIDED_AGENT_URI = ${JSON.stringify(input.agentURI)}`);
        expect(script).toContain("const agentURI = USER_PROVIDED_AGENT_URI");
        expect(script).toContain("args: [agentURI]");
        expect(script).not.toContain("api.pinata.cloud");
        expect(script).not.toContain("fetch(");
        expect(env).not.toContain("PINATA_JWT");
        expect(readme).toContain("storage-provider API call");
    });

    it("generates Neo X config and responsibility guidance without provider credentials", () => {
        const input = answers({ chain: "neox-t4", agentURI: EXTERNAL_URIS[1] });
        const config = generateNeoxAgentConfig(input);
        const readme = generateNeoxReadme(input, CHAINS["neox-t4"]);

        expect(config).toContain('metadataStorage: "external"');
        expect(config).toContain(`agentURI: ${JSON.stringify(input.agentURI)}`);
        expect(readme).toContain("registered exactly as supplied");
        expect(readme).toContain("public readability");
        expect(readme).toContain("new versioned URI");
        expect(readme).not.toContain("NEOFS_BEARER_TOKEN");
        expect(readme).not.toContain("PINATA_JWT");
    });

    it("acquires the URI without upload or fetch calls", async () => {
        const fetchSpy = vi.fn();
        const uri = EXTERNAL_URIS[0];
        const storage = createMetadataStorage(
            { metadataStorage: "external", agentURI: uri } as AgentProjectConfig,
            fetchSpy as never
        );
        const publication = await storage.publish({
            metadata: {} as never,
            projectId: "uri-test",
            agentId: 42n,
            chainId: 12227332,
            registry: NEOX_T4_IDENTITY_REGISTRY,
        });

        expect(publication).toEqual({ backend: "external", uri });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("verifies exact on-chain URI equality without fetching external contents", async () => {
        const uri = EXTERNAL_URIS[1];
        const fetchSpy = vi.fn();
        const config: AgentProjectConfig = {
            name: "URI Test Agent",
            description: "Description",
            image: "https://example.com/agent.png",
            projectId: "uri-test",
            metadataStorage: "external",
            agentURI: uri,
        };
        const state: RegistrationState = {
            ...emptyState(config.projectId),
            stage: "uri-set",
            agentId: "42",
            owner: OWNER,
            agentURI: uri,
            metadataStorage: { backend: "external", uri },
        };
        const client = {
            readContract: vi.fn().mockImplementation(({ functionName }: { functionName: string }) => {
                if (functionName === "ownerOf" || functionName === "getAgentWallet") return OWNER;
                if (functionName === "tokenURI") return uri;
                throw new Error(`unexpected ${functionName}`);
            }),
        };

        const result = await verifyOnChain({
            client: client as never,
            registry: NEOX_T4_IDENTITY_REGISTRY,
            state,
            config,
            expectedOwner: OWNER,
            fetchImpl: fetchSpy as never,
        });
        expect(result.tokenURI).toBe(uri);
        expect(result.decodedMetadata).toBeUndefined();
        expect(fetchSpy).not.toHaveBeenCalled();

        const secretFreeResult = buildSecretFreeResult(state, result);
        expect(secretFreeResult.agentURI).toBe(uri);
        expect(secretFreeResult.finalURI).toBe(uri);
        expect(secretFreeResult.metadataStorage).toEqual({ backend: "external", uri });
        expect(JSON.stringify(secretFreeResult)).not.toMatch(/password|bearer|private.?key/i);
    });

    it("persists the exact URI in resumable state without provider credentials", () => {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "external-uri-state-"));
        const uri = EXTERNAL_URIS[2];
        const config: AgentProjectConfig = {
            name: "URI Test Agent",
            description: "Description",
            image: "https://example.com/agent.png",
            projectId: "uri-test",
            metadataStorage: "external",
            agentURI: uri,
        };
        const metadata = buildRegistrationMetadata(config, 42n, NEOX_T4_IDENTITY_REGISTRY);
        const state = persistMetadataPublished(
            projectDir,
            { ...emptyState(config.projectId), stage: "minted", agentId: "42" },
            metadata,
            { backend: "external", uri }
        );
        const saved = JSON.parse(
            fs.readFileSync(path.join(projectDir, ".registration-state.json"), "utf8")
        );

        expect(state.agentURI).toBe(uri);
        expect(saved.agentURI).toBe(uri);
        expect(saved.metadataStorage).toEqual({ backend: "external", uri });
        expect(JSON.stringify(saved)).not.toMatch(/password|bearer|private.?key/i);
    });
});
