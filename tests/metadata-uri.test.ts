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
import {
    DEFAULT_EVM_METADATA_STORAGE,
    DEFAULT_METADATA_STORAGE,
    EVM_METADATA_STORAGE_CHOICES,
    METADATA_STORAGE_CHOICES,
    type WizardAnswers,
} from "../src/wizard.js";

const OWNER = "0x1111111111111111111111111111111111111111" as Address;
const USER_URIS = [
    "https://metadata.example/agents/42.json?version=1#registration",
    "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3fte3pr7x2v5w3x5v5q4y6x4a/agent.json",
    "neofs:container-id/object-id",
] as const;

function answers(overrides: Partial<WizardAnswers> = {}): WizardAnswers {
    return {
        projectDir: "test-agent",
        agentName: "URI Test Agent",
        agentDescription: "Uses user-managed registration metadata.",
        agentImage: "https://example.com/agent.png",
        features: [],
        a2aStreaming: false,
        chain: "base-sepolia",
        trustModels: [],
        agentWallet: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        metadataStorage: "uri",
        metadataUri: USER_URIS[0],
        ...overrides,
    };
}

describe("user-provided registration metadata URI", () => {
    it.each(USER_URIS)("accepts and preserves %s", (uri) => {
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
        ["http://metadata.example/agent.json", /must use/],
        ["https://user:password@metadata.example/agent.json", /credentials/],
    ])("rejects invalid input %j with an actionable error", (uri, message) => {
        const result = validateRegistrationMetadataUri(uri);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.message).toMatch(message);
    });

    it("keeps managed storage as the Neo X default and Pinata as the other EVM default", () => {
        expect(DEFAULT_METADATA_STORAGE).toBe("managed");
        expect(METADATA_STORAGE_CHOICES).toEqual([
            { name: "Managed by Agentory (recommended)", value: "managed" },
            { name: "Use my own URI", value: "uri" },
        ]);
        expect(DEFAULT_EVM_METADATA_STORAGE).toBe("inline");
        expect(EVM_METADATA_STORAGE_CHOICES).toEqual([
            { name: "Upload with Pinata", value: "inline" },
            { name: "Use my own URI", value: "uri" },
        ]);
        expect(wizardAnswersFromConfig({
            projectDir: "agent",
            agentName: "Agent",
            agentDescription: "Description",
            chain: "base-sepolia",
        }).metadataStorage).toBe("inline");
    });

    it("validates config input and preserves the exact URI", () => {
        const uri = USER_URIS[1];
        const result = wizardAnswersFromConfig({
            projectDir: "agent",
            agentName: "Agent",
            agentDescription: "Description",
            chain: "neox-t4",
            metadataStorage: "uri",
            metadataUri: uri,
        });
        expect(result.metadataStorage).toBe("uri");
        expect(result.metadataUri).toBe(uri);

        expect(() => wizardAnswersFromConfig({
            projectDir: "agent",
            agentName: "Agent",
            agentDescription: "Description",
            chain: "neox-t4",
            metadataStorage: "uri",
        })).toThrow(/required/);
        expect(() => wizardAnswersFromConfig({
            projectDir: "agent",
            agentName: "Agent",
            agentDescription: "Description",
            chain: "solana-devnet",
            metadataStorage: "uri",
            metadataUri: uri,
        })).toThrow(/Solana/);
    });

    it("generates the SDK path without Pinata or an upload call", () => {
        const input = answers();
        const chain = CHAINS["base-sepolia"];
        const script = generateRegisterScript(input, chain);
        const env = generateEnvExample(input, chain);
        const readme = generateReadme(input, chain);
        const pkg = JSON.parse(generatePackageJson(input));

        expect(pkg.dependencies["agent0-sdk"]).toBe("latest");
        expect(script).toContain(`const USER_PROVIDED_AGENT_URI = ${JSON.stringify(input.metadataUri)}`);
        expect(script).toContain("registerHTTP(USER_PROVIDED_AGENT_URI)");
        expect(script).not.toContain("registerIPFS()");
        expect(script).not.toContain("pinataJwt");
        expect(env).not.toContain("PINATA_JWT");
        expect(readme).toContain("storage-provider API call");
        expect(readme).toContain("immutable");
        expect(readme).toContain("publicly readable");
    });

    it("keeps the default EVM registration path on Pinata", () => {
        const input = answers({ metadataStorage: "inline", metadataUri: undefined });
        const chain = CHAINS["base-sepolia"];
        const script = generateRegisterScript(input, chain);
        expect(script).toContain("registerIPFS()");
        expect(script).toContain("PINATA_JWT");
        expect(generateEnvExample(input, chain)).toContain("PINATA_JWT");
    });

    it("generates the direct Monad path without Pinata or fetch", () => {
        const input = answers({ chain: "monad-testnet", metadataUri: USER_URIS[2] });
        const chain = CHAINS["monad-testnet"];
        const script = generateMonadRegisterScript(input, chain);
        const env = generateMonadEnv(input, chain);
        const readme = generateMonadReadme(input, chain);

        expect(script).toContain(`const USER_PROVIDED_AGENT_URI = ${JSON.stringify(input.metadataUri)}`);
        expect(script).toContain("const agentURI = USER_PROVIDED_AGENT_URI");
        expect(script).toContain("args: [agentURI]");
        expect(script).not.toContain("api.pinata.cloud");
        expect(script).not.toContain("fetch(");
        expect(env).not.toContain("PINATA_JWT");
        expect(readme).toContain("storage-provider API call");
    });

    it("generates Neo X config and responsibility guidance without provider credentials", () => {
        const input = answers({ chain: "neox-t4", metadataUri: USER_URIS[1] });
        const config = generateNeoxAgentConfig(input);
        const readme = generateNeoxReadme(input, CHAINS["neox-t4"]);

        expect(config).toContain('metadataStorage: "uri"');
        expect(config).toContain(`metadataUri: ${JSON.stringify(input.metadataUri)}`);
        expect(config).not.toContain("agentURI:");
        expect(readme).toContain("registered exactly as supplied");
        expect(readme).toContain("public readability");
        expect(readme).toContain("new versioned URI");
        expect(readme).not.toContain("NEOFS_BEARER_TOKEN");
        expect(readme).not.toContain("PINATA_JWT");
        expect(readme).not.toContain("AGENTORY_API_BASE_URL=");
    });

    it("acquires the URI without upload, fetch, or a managed API origin", async () => {
        const previous = process.env.AGENTORY_API_BASE_URL;
        delete process.env.AGENTORY_API_BASE_URL;
        try {
            const fetchSpy = vi.fn();
            const uri = USER_URIS[0];
            const storage = createMetadataStorage(
                { metadataStorage: "uri", metadataUri: uri } as AgentProjectConfig,
                fetchSpy as never
            );
            const publication = await storage.publish({
                metadata: {} as never,
                projectId: "uri-test",
                agentId: 42n,
                chainId: 12227332,
                registry: NEOX_T4_IDENTITY_REGISTRY,
            });

            expect(storage.backend).toBe("uri");
            expect(publication).toEqual({ backend: "uri", uri });
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            if (previous === undefined) delete process.env.AGENTORY_API_BASE_URL;
            else process.env.AGENTORY_API_BASE_URL = previous;
        }
    });

    it("verifies exact on-chain URI equality without fetching user-managed contents", async () => {
        const uri = USER_URIS[1];
        const fetchSpy = vi.fn();
        const config: AgentProjectConfig = {
            name: "URI Test Agent",
            description: "Description",
            image: "https://example.com/agent.png",
            projectId: "uri-test",
            metadataStorage: "uri",
            metadataUri: uri,
        };
        const state: RegistrationState = {
            ...emptyState(config.projectId),
            stage: "uri-set",
            agentId: "42",
            owner: OWNER,
            agentURI: uri,
            metadataStorage: { backend: "uri", uri },
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
        expect(secretFreeResult.metadataStorage).toEqual({ backend: "uri", uri });
        expect(JSON.stringify(secretFreeResult)).not.toMatch(/password|bearer|private.?key/i);
    });

    it("persists the exact URI in resumable state without provider credentials", () => {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "user-uri-state-"));
        const uri = USER_URIS[2];
        const config: AgentProjectConfig = {
            name: "URI Test Agent",
            description: "Description",
            image: "https://example.com/agent.png",
            projectId: "uri-test",
            metadataStorage: "uri",
            metadataUri: uri,
        };
        const metadata = buildRegistrationMetadata(config, 42n, NEOX_T4_IDENTITY_REGISTRY);
        const state = persistMetadataPublished(
            projectDir,
            { ...emptyState(config.projectId), stage: "minted", agentId: "42" },
            metadata,
            { backend: "uri", uri }
        );
        const saved = JSON.parse(
            fs.readFileSync(path.join(projectDir, ".registration-state.json"), "utf8")
        );

        expect(state.agentURI).toBe(uri);
        expect(saved.agentURI).toBe(uri);
        expect(saved.metadataStorage).toEqual({ backend: "uri", uri });
        expect(JSON.stringify(saved)).not.toMatch(/password|bearer|private.?key|AGENTORY_API_BASE_URL/i);
    });
});
