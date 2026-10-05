import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import bs58 from "bs58";
import { encodeAbiParameters, encodeEventTopics, type Address, type Hex } from "viem";
import { wizardAnswersFromConfig } from "../src/generate-from-config.js";
import { IDENTITY_REGISTRY_ABI } from "../src/neox/abi.js";
import { NEOX_T4_IDENTITY_REGISTRY } from "../src/neox/constants.js";
import { buildRegistrationMetadata, metadataContentHash } from "../src/neox/metadata.js";
import { parseCanonicalNeofsAgentUri, MANAGED_URI_GAS_ESTIMATE } from "../src/neox/storage/neofs-uri.js";
import { registerOrResume } from "../src/neox/register.js";
import { verifyOnChain } from "../src/neox/verify.js";
import { emptyState, saveState } from "../src/neox/state.js";
import {
    ManagedMetadataError,
    ManagedMetadataStorage,
    resolveAgentoryApiBaseUrl,
    scrubManagedErrorText,
} from "../src/neox/storage/managed.js";
import { createMetadataStorage, metadataBackend, uriForStoragePreflight } from "../src/neox/storage/index.js";
import { UserUriMetadataStorage } from "../src/neox/storage/user-uri.js";
import type { AgentProjectConfig, RegistrationState } from "../src/neox/types.js";
import { generateNeoxAgentConfig, generateNeoxEnvExample, generateNeoxReadme } from "../src/templates/neox.js";
import { CHAINS } from "../src/config.js";
import { DEFAULT_METADATA_STORAGE, METADATA_STORAGE_CHOICES } from "../src/wizard.js";
import type { WizardAnswers } from "../src/wizard.js";

const REGISTRY = NEOX_T4_IDENTITY_REGISTRY;
const OWNER = "0x1111111111111111111111111111111111111111" as Address;
const SIGNING_KEY = `0x${"ab".repeat(32)}`;
const API_SECRET = "super-secret-token-value-123456";
const containerId = bs58.encode(Buffer.alloc(32, 0x22));
const objectId = bs58.encode(Buffer.alloc(32, 0x33));
const agentURI = `neofs:${containerId}/${objectId}`;

async function withApiBaseUrl<T>(value: string | undefined, run: () => Promise<T> | T): Promise<T> {
    const previous = process.env.AGENTORY_API_BASE_URL;
    if (value === undefined) delete process.env.AGENTORY_API_BASE_URL;
    else process.env.AGENTORY_API_BASE_URL = value;
    try {
        return await run();
    } finally {
        if (previous === undefined) delete process.env.AGENTORY_API_BASE_URL;
        else process.env.AGENTORY_API_BASE_URL = previous;
    }
}

const CONFIG: AgentProjectConfig = {
    name: "Managed test",
    description: "fixture",
    image: "https://example.com/agent.png",
    projectId: "managed-test",
    metadataStorage: "managed",
};

function answers(overrides: Partial<WizardAnswers> = {}): WizardAnswers {
    return {
        projectDir: "managed-agent",
        agentName: "Managed Agent",
        agentDescription: "Stored by Agentory",
        agentImage: "https://example.com/agent.png",
        features: [],
        a2aStreaming: false,
        chain: "neox-t4",
        trustModels: [],
        agentWallet: OWNER,
        metadataStorage: "managed",
        ...overrides,
    };
}

function successResponse(uri = agentURI, object = objectId): Response {
    const id = uri.slice("neofs:".length).split("/");
    return new Response(JSON.stringify({
        storage: { type: "neofs", containerId: id[0], objectId: object },
        agentURI: uri,
    }), { status: 200, headers: { "content-type": "application/json" } });
}

function errorResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function protection() {
    return {
        apply(headers: Headers) {
            headers.set("authorization", `Bearer ${API_SECRET}`);
        },
    };
}

describe("wizard metadata choices", () => {
    it("offers managed storage by default and only the user-URI alternative", () => {
        expect(DEFAULT_METADATA_STORAGE).toBe("managed");
        expect(METADATA_STORAGE_CHOICES.map((choice) => choice.name)).toEqual([
            "Managed by Agentory (recommended)",
            "Use my own URI",
        ]);
        expect(METADATA_STORAGE_CHOICES).toHaveLength(2);
        const rendered = METADATA_STORAGE_CHOICES.map((choice) => `${choice.name} ${choice.value}`).join("\n");
        expect(rendered).not.toMatch(/pinata|ipfs|inline|neofs|https|on-chain/i);

        const fromConfig = wizardAnswersFromConfig({
            projectDir: "demo",
            agentName: "Demo",
            agentDescription: "Demo",
            chain: "neox-t4",
        });
        expect(fromConfig.metadataStorage).toBe("managed");
        expect(fromConfig.metadataUri).toBeUndefined();
    });

    it("keeps legacy backends available to config without making them wizard choices", () => {
        expect(wizardAnswersFromConfig({
            projectDir: "demo",
            agentName: "Demo",
            agentDescription: "Demo",
            chain: "neox-t4",
            metadataStorage: "neofs",
        }).metadataStorage).toBe("neofs");
        expect(wizardAnswersFromConfig({
            projectDir: "demo",
            agentName: "Demo",
            agentDescription: "Demo",
            chain: "neox-t4",
            metadataStorage: "uri",
            metadataUri: "ipfs://bafyexample",
        }).metadataUri).toBe("ipfs://bafyexample");
    });
});

describe("generated managed configuration", () => {
    it("does not ask the user for NeoFS credentials", () => {
        const input = answers();
        const chain = CHAINS["neox-t4"];
        const envExample = generateNeoxEnvExample(input, chain);
        const readme = generateNeoxReadme(input, chain);
        const config = generateNeoxAgentConfig(input);

        expect(config).toContain('metadataStorage: "managed"');
        expect(config).not.toContain("staging.agentory.xyz");
        expect(envExample).not.toContain("NEOFS_");
        expect(envExample).not.toContain("PINATA");
        expect(envExample).not.toContain(SIGNING_KEY);
        expect(envExample).toMatch(/^AGENTORY_API_BASE_URL=$/m);
        expect(envExample).not.toMatch(/^AGENTORY_API_BASE_URL=https?:\/\//m);
        expect(readme).toContain("do not create a NeoFS account");
        expect(readme).not.toContain("NEOFS_BEARER_TOKEN");
        expect(readme).toContain("neofs:<containerId>/<objectId>");
        expect(readme).toContain("Staging/development example");
        expect(readme).not.toMatch(/defaults to/i);
        const library = fs.readFileSync(new URL("../src/neox/constants.ts", import.meta.url), "utf8");
        expect(library).not.toContain("staging.agentory.xyz");
        expect(library).not.toContain("DEFAULT_AGENTORY_API_BASE_URL");
    });
});

describe("managed metadata client", () => {
    it("preserves the API agentURI and sends only the registration document", async () => {
        const metadata = buildRegistrationMetadata(CONFIG, 7n, REGISTRY);
        const fetchImpl = vi.fn().mockResolvedValue(successResponse());
        const storage = new ManagedMetadataStorage({
            apiBaseUrl: "http://127.0.0.1:3000",
            protection: protection(),
            redactedValues: [SIGNING_KEY],
        }, fetchImpl);

        const published = await storage.publish({
            metadata,
            projectId: CONFIG.projectId,
            agentId: 7n,
            chainId: 12227332,
            registry: REGISTRY,
        });

        expect(published).toEqual({
            backend: "managed",
            uri: agentURI,
            containerId,
            objectId,
            contentHash: metadataContentHash(metadata),
        });
        expect(published.uri).toBe(agentURI);
        const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("http://127.0.0.1:3000/api/registration-metadata");
        expect(init.method).toBe("POST");
        expect(init.body).toBe(JSON.stringify(metadata));
        expect(String(init.body)).not.toContain(SIGNING_KEY);
        expect(String(init.body)).not.toContain(API_SECRET);
        const headers = init.headers as Headers;
        expect(headers.get("authorization")).toBe(`Bearer ${API_SECRET}`);
        expect(headers.get("content-type")).toBe("application/json");
    });

    it("rejects malformed responses without rewriting the URI", async () => {
        const metadata = buildRegistrationMetadata(CONFIG, 7n, REGISTRY);
        const cases = [
            successResponse("https://agentory.example/metadata"),
            new Response(JSON.stringify({
                storage: { type: "neofs", containerId, objectId: "not-canonical" },
                agentURI: `neofs:${containerId}/not-canonical`,
            }), { status: 200 }),
            new Response(JSON.stringify({
                storage: { type: "https", containerId, objectId },
                agentURI,
            }), { status: 200 }),
            new Response("not-json", { status: 200 }),
            new Response(JSON.stringify({
                storage: { type: "neofs", containerId, objectId },
                agentURI: `neofs:${objectId}/${containerId}`,
            }), { status: 200 }),
        ];
        for (const response of cases) {
            const storage = new ManagedMetadataStorage({
                apiBaseUrl: "https://staging.agentory.xyz",
            }, vi.fn().mockResolvedValue(response));
            await expect(storage.publish({
                metadata,
                projectId: CONFIG.projectId,
                agentId: 7n,
                chainId: 12227332,
                registry: REGISTRY,
            })).rejects.toBeInstanceOf(ManagedMetadataError);
        }
    });

    it("reports security and storage errors without secrets", async () => {
        const metadata = buildRegistrationMetadata(CONFIG, 7n, REGISTRY);
        const cases: Array<{ response: Response; code: string; failureClass: string }> = [
            {
                response: errorResponse(401, {
                    error: "unauthorized",
                    message: `denied for Bearer ${API_SECRET} key ${SIGNING_KEY}`,
                    failureClass: "security",
                    retryable: false,
                }),
                code: "unauthorized",
                failureClass: "security",
            },
            {
                response: errorResponse(503, {
                    error: "storage_not_configured",
                    message: "Managed NeoFS metadata upload is not configured.",
                    failureClass: "storage",
                    retryable: false,
                }),
                code: "storage_not_configured",
                failureClass: "storage",
            },
            {
                response: errorResponse(503, {
                    error: "storage_unavailable",
                    message: `socket hang up ${API_SECRET}`,
                    failureClass: "storage",
                    retryable: true,
                }),
                code: "storage_unavailable",
                failureClass: "storage",
            },
            {
                response: errorResponse(502, {
                    error: "storage_rejected",
                    message: "NeoFS rejected the metadata object.",
                    failureClass: "storage",
                    retryable: false,
                }),
                code: "storage_rejected",
                failureClass: "storage",
            },
            {
                response: errorResponse(400, {
                    error: "malformed_metadata",
                    message: "registrations are missing",
                    failureClass: "validation",
                    retryable: false,
                }),
                code: "malformed_metadata",
                failureClass: "validation",
            },
        ];

        for (const entry of cases) {
            const storage = new ManagedMetadataStorage({
                apiBaseUrl: "https://staging.agentory.xyz",
                protection: protection(),
                redactedValues: [SIGNING_KEY],
            }, vi.fn().mockResolvedValue(entry.response));
            try {
                await storage.publish({
                    metadata,
                    projectId: CONFIG.projectId,
                    agentId: 7n,
                    chainId: 12227332,
                    registry: REGISTRY,
                });
                throw new Error("expected publish to fail");
            } catch (error) {
                expect(error).toBeInstanceOf(ManagedMetadataError);
                const managed = error as ManagedMetadataError;
                expect(managed.code).toBe(entry.code);
                expect(managed.failureClass).toBe(entry.failureClass);
                expect(managed.message).not.toContain(API_SECRET);
                expect(managed.message).not.toContain(SIGNING_KEY);
                expect(managed.message.length).toBeGreaterThan(20);
            }
        }
    });

    it("scrubs signing keys and bearer tokens from transport errors", async () => {
        const storage = new ManagedMetadataStorage({
            apiBaseUrl: "https://staging.agentory.xyz",
            protection: protection(),
            redactedValues: [SIGNING_KEY],
        }, vi.fn().mockRejectedValue(new Error(`connect failed ${SIGNING_KEY} Bearer ${API_SECRET}`)));
        await expect(storage.publish({
            metadata: buildRegistrationMetadata(CONFIG, 1n, REGISTRY),
            projectId: CONFIG.projectId,
            agentId: 1n,
            chainId: 12227332,
            registry: REGISTRY,
        })).rejects.toThrow(/\[redacted\]/);
        expect(scrubManagedErrorText(`Bearer ${API_SECRET}`, [API_SECRET])).not.toContain(API_SECRET);
    });
});

describe("managed registration resume", () => {
    function client() {
        return {
            getChainId: vi.fn().mockResolvedValue(12227332),
            getBytecode: vi.fn().mockResolvedValue("0x6001"),
            readContract: vi.fn().mockImplementation(({ functionName }: { functionName: string }) =>
                functionName === "name" ? "Identity Registry" : "1.0.0"
            ),
            getBalance: vi.fn().mockResolvedValue(1n),
            getGasPrice: vi.fn().mockResolvedValue(20_000_000_000n),
            estimateMaxPriorityFeePerGas: vi.fn().mockResolvedValue(20_000_000_000n),
            getBlock: vi.fn().mockResolvedValue({ baseFeePerGas: 1n }),
            simulateContract: vi.fn().mockResolvedValue({}),
            estimateContractGas: vi.fn().mockResolvedValue(100_000n),
            waitForTransactionReceipt: vi.fn(),
            getTransactionReceipt: vi.fn().mockRejectedValue(new Error("missing")),
            getTransaction: vi.fn().mockResolvedValue(null),
        };
    }

    function minted(projectId: string): RegistrationState {
        return {
            ...emptyState(projectId),
            stage: "minted",
            agentId: "7",
            owner: OWNER,
        };
    }

    it("persists the mint before upload and does not setAgentURI when upload fails", async () => {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "managed-upload-fail-"));
        const registerHash = `0x${"4".repeat(64)}` as Hex;
        let sawMintedIdentity = false;
        const fetchImpl = vi.fn().mockImplementation(async () => {
            const saved = JSON.parse(fs.readFileSync(path.join(projectDir, ".registration-state.json"), "utf8")) as RegistrationState;
            sawMintedIdentity = saved.stage === "minted" && saved.agentId === "7" && saved.agentURI === undefined;
            return errorResponse(503, {
                error: "storage_unavailable",
                message: `NeoFS could not store the metadata object. ${SIGNING_KEY}`,
                failureClass: "storage",
                retryable: true,
            });
        });
        const storage = new ManagedMetadataStorage({
            apiBaseUrl: "https://staging.agentory.xyz",
            redactedValues: [SIGNING_KEY],
        }, fetchImpl);
        const publicClient = client();
        publicClient.waitForTransactionReceipt.mockResolvedValue({
            status: "success",
            transactionHash: registerHash,
            blockNumber: 1n,
            blockHash: `0x${"5".repeat(64)}`,
            logs: [{
                address: REGISTRY,
                topics: encodeEventTopics({
                    abi: IDENTITY_REGISTRY_ABI,
                    eventName: "Registered",
                    args: { agentId: 7n, owner: OWNER },
                }),
                data: encodeAbiParameters([{ type: "string" }], [""]),
                blockNumber: 1n,
                transactionHash: registerHash,
                blockHash: `0x${"5".repeat(64)}`,
                logIndex: 0,
                transactionIndex: 0,
                removed: false,
            }],
        });
        const wallet = {
            writeContract: vi.fn().mockResolvedValue(registerHash),
            account: undefined,
            chain: undefined,
        };
        const logs: string[] = [];
        const spy = vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
            logs.push(String(message));
        });
        saveState(projectDir, emptyState(CONFIG.projectId));

        await expect(registerOrResume({
            publicClient: publicClient as never,
            walletClient: wallet as never,
            signer: OWNER,
            registry: REGISTRY,
            projectDir,
            config: CONFIG,
            storage,
        }, emptyState(CONFIG.projectId))).rejects.toMatchObject({
            code: "storage_unavailable",
            retryable: true,
        });

        spy.mockRestore();
        expect(sawMintedIdentity).toBe(true);
        expect(wallet.writeContract).toHaveBeenCalledTimes(1);
        expect(wallet.writeContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "register" }));
        const saved = JSON.parse(fs.readFileSync(path.join(projectDir, ".registration-state.json"), "utf8")) as RegistrationState;
        expect(saved.stage).toBe("minted");
        expect(saved.agentId).toBe("7");
        expect(saved.agentURI).toBeUndefined();
        expect(saved.metadataStorage).toBeUndefined();
        expect(JSON.stringify(saved)).not.toContain(SIGNING_KEY);
        expect(JSON.stringify(logs)).not.toContain(SIGNING_KEY);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("reuses a successful upload after setAgentURI fails and uploads again when metadata changes", async () => {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "managed-reuse-"));
        const nextObjectId = bs58.encode(Buffer.alloc(32, 0x44));
        const nextUri = `neofs:${containerId}/${nextObjectId}`;
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(successResponse())
            .mockResolvedValueOnce(successResponse(nextUri, nextObjectId));
        const storage = new ManagedMetadataStorage({
            apiBaseUrl: "https://staging.agentory.xyz",
        }, fetchImpl);
        const failingWallet = {
            writeContract: vi.fn().mockRejectedValue(new Error(`setAgentURI unavailable ${SIGNING_KEY}`)),
            account: undefined,
            chain: undefined,
        };

        await expect(registerOrResume({
            publicClient: client() as never,
            walletClient: failingWallet as never,
            signer: OWNER,
            registry: REGISTRY,
            projectDir,
            config: CONFIG,
            storage,
        }, minted(CONFIG.projectId))).rejects.toThrow(/setAgentURI unavailable/);

        const saved = JSON.parse(fs.readFileSync(path.join(projectDir, ".registration-state.json"), "utf8")) as RegistrationState;
        expect(saved.agentURI).toBe(agentURI);
        expect(saved.metadataStorage).toMatchObject({
            backend: "managed",
            uri: agentURI,
            containerId,
            objectId,
            contentHash: metadataContentHash(buildRegistrationMetadata(CONFIG, 7n, REGISTRY)),
        });
        expect(JSON.stringify(saved)).not.toContain(SIGNING_KEY);
        expect(failingWallet.writeContract).toHaveBeenCalledWith(expect.objectContaining({
            functionName: "setAgentURI",
            args: [7n, agentURI],
        }));

        const retryWallet = {
            writeContract: vi.fn().mockResolvedValue(`0x${"2".repeat(64)}` as Hex),
            account: undefined,
            chain: undefined,
        };
        const publicClient = client();
        publicClient.waitForTransactionReceipt.mockResolvedValue({
            status: "success",
            transactionHash: `0x${"2".repeat(64)}`,
            blockNumber: 9n,
            blockHash: `0x${"3".repeat(64)}`,
            logs: [{
                address: REGISTRY,
                topics: encodeEventTopics({
                    abi: IDENTITY_REGISTRY_ABI,
                    eventName: "URIUpdated",
                    args: { agentId: 7n, updatedBy: OWNER },
                }),
                data: encodeAbiParameters([{ type: "string" }], [agentURI]),
                blockNumber: 9n,
                transactionHash: `0x${"2".repeat(64)}`,
                blockHash: `0x${"3".repeat(64)}`,
                logIndex: 0,
                transactionIndex: 0,
                removed: false,
            }],
        });
        const completed = await registerOrResume({
            publicClient: publicClient as never,
            walletClient: retryWallet as never,
            signer: OWNER,
            registry: REGISTRY,
            projectDir,
            config: CONFIG,
            storage,
        }, saved);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(retryWallet.writeContract).toHaveBeenCalledWith(expect.objectContaining({
            functionName: "setAgentURI",
            args: [7n, agentURI],
        }));
        expect(completed.agentURI).toBe(agentURI);

        const changed = { ...CONFIG, name: "Managed test renamed" };
        const changedWallet = {
            writeContract: vi.fn().mockResolvedValue(`0x${"4".repeat(64)}` as Hex),
            account: undefined,
            chain: undefined,
        };
        publicClient.waitForTransactionReceipt.mockResolvedValue({
            status: "success",
            transactionHash: `0x${"4".repeat(64)}`,
            blockNumber: 10n,
            blockHash: `0x${"5".repeat(64)}`,
            logs: [{
                address: REGISTRY,
                topics: encodeEventTopics({
                    abi: IDENTITY_REGISTRY_ABI,
                    eventName: "URIUpdated",
                    args: { agentId: 7n, updatedBy: OWNER },
                }),
                data: encodeAbiParameters([{ type: "string" }], [nextUri]),
                blockNumber: 10n,
                transactionHash: `0x${"4".repeat(64)}`,
                blockHash: `0x${"5".repeat(64)}`,
                logIndex: 0,
                transactionIndex: 0,
                removed: false,
            }],
        });
        const republished = await registerOrResume({
            publicClient: publicClient as never,
            walletClient: changedWallet as never,
            signer: OWNER,
            registry: REGISTRY,
            projectDir,
            config: changed,
            storage,
        }, { ...completed, stage: "minted" });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(changedWallet.writeContract).toHaveBeenCalledWith(expect.objectContaining({
            args: [7n, nextUri],
        }));
        expect(republished.metadataStorage?.objectId).toBe(nextObjectId);
        expect(republished.metadataStorage?.contentHash).toBe(
            createHash("sha256").update(JSON.stringify(buildRegistrationMetadata(changed, 7n, REGISTRY)), "utf8").digest("hex")
        );
    });

    it("does not upload a user-provided URI", async () => {
        const fetchImpl = vi.fn();
        const uri = "ipfs://bafyexample";
        const storage = new UserUriMetadataStorage(uri);
        const published = await storage.publish({
            metadata: buildRegistrationMetadata(CONFIG, 1n, REGISTRY),
            projectId: CONFIG.projectId,
            agentId: 1n,
            chainId: 12227332,
            registry: REGISTRY,
        });
        expect(published).toEqual({ backend: "uri", uri });
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(metadataBackend({ ...CONFIG, metadataStorage: "uri", metadataUri: uri })).toBe("uri");
        expect(parseCanonicalNeofsAgentUri(MANAGED_URI_GAS_ESTIMATE)).not.toBeNull();
        await withApiBaseUrl(undefined, () => {
            expect(createMetadataStorage({ ...CONFIG, metadataStorage: "uri", metadataUri: uri }, fetchImpl).backend).toBe("uri");
            expect(uriForStoragePreflight({ ...CONFIG, metadataStorage: "uri", metadataUri: uri })).toBe(uri);
        });
    });

    it("reads a managed neofs URI back through the public gateway during verify", async () => {
        const metadata = buildRegistrationMetadata(CONFIG, 7n, REGISTRY);
        const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(metadata), {
            status: 200,
            headers: { "content-type": "application/json" },
        }));
        const chainClient = {
            readContract: vi.fn().mockImplementation(({ functionName }: { functionName: string }) => {
                if (functionName === "ownerOf" || functionName === "getAgentWallet") return OWNER;
                if (functionName === "tokenURI") return agentURI;
                throw new Error(`unexpected ${functionName}`);
            }),
        };
        const verification = await verifyOnChain({
            client: chainClient as never,
            registry: REGISTRY,
            state: {
                ...emptyState(CONFIG.projectId),
                stage: "uri-set",
                agentId: "7",
                owner: OWNER,
                agentURI,
                metadata,
                metadataStorage: {
                    backend: "managed",
                    uri: agentURI,
                    containerId,
                    objectId,
                    contentHash: metadataContentHash(metadata),
                },
            },
            config: CONFIG,
            expectedOwner: OWNER,
            fetchImpl,
            neofsPublicGateway: "https://rest.fs.neo.org",
        });
        expect(verification.tokenURI).toBe(agentURI);
        expect(fetchImpl).toHaveBeenCalledWith(
            `https://rest.fs.neo.org/v1/objects/${encodeURIComponent(containerId)}/by_id/${encodeURIComponent(objectId)}`,
            expect.objectContaining({ headers: { accept: "application/json" } })
        );
    });
});

describe("managed API origin configuration", () => {
    function client() {
        return {
            getChainId: vi.fn().mockResolvedValue(12227332),
            getBytecode: vi.fn().mockResolvedValue("0x6001"),
            readContract: vi.fn().mockImplementation(({ functionName }: { functionName: string }) =>
                functionName === "name" ? "Identity Registry" : "1.0.0"
            ),
            getBalance: vi.fn().mockResolvedValue(1n),
            getGasPrice: vi.fn().mockResolvedValue(20_000_000_000n),
            estimateMaxPriorityFeePerGas: vi.fn().mockResolvedValue(20_000_000_000n),
            getBlock: vi.fn().mockResolvedValue({ baseFeePerGas: 1n }),
            simulateContract: vi.fn().mockResolvedValue({}),
            estimateContractGas: vi.fn().mockResolvedValue(100_000n),
            waitForTransactionReceipt: vi.fn(),
            getTransactionReceipt: vi.fn().mockRejectedValue(new Error("missing")),
            getTransaction: vi.fn().mockResolvedValue(null),
        };
    }

    it("fails before minting when AGENTORY_API_BASE_URL is missing and does not call staging", async () => {
        const fetchImpl = vi.fn();
        const wallet = { writeContract: vi.fn(), account: undefined, chain: undefined };
        await withApiBaseUrl(undefined, async () => {
            expect(() => resolveAgentoryApiBaseUrl()).toThrow(/AGENTORY_API_BASE_URL is required/);
            expect(() => uriForStoragePreflight(CONFIG)).toThrow(/AGENTORY_API_BASE_URL is required/);
            expect(() => createMetadataStorage(CONFIG, fetchImpl)).toThrow(/AGENTORY_API_BASE_URL is required/);
            await expect(registerOrResume({
                publicClient: client() as never,
                walletClient: wallet as never,
                signer: OWNER,
                registry: REGISTRY,
                projectDir: fs.mkdtempSync(path.join(os.tmpdir(), "managed-missing-api-")),
                config: CONFIG,
                storage: undefined,
            }, emptyState(CONFIG.projectId))).rejects.toThrow(/Managed metadata storage is required/);
        });
        expect(wallet.writeContract).not.toHaveBeenCalled();
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(fetchImpl.mock.calls.join("")).not.toContain("staging.agentory.xyz");
    });

    it("does not upload on resume when the API origin is missing or invalid", async () => {
        const fetchImpl = vi.fn();
        const wallet = { writeContract: vi.fn(), account: undefined, chain: undefined };
        const minted: RegistrationState = {
            ...emptyState(CONFIG.projectId),
            stage: "minted",
            agentId: "7",
            owner: OWNER,
        };
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "managed-resume-api-"));
        await withApiBaseUrl(undefined, async () => {
            await expect(registerOrResume({
                publicClient: client() as never,
                walletClient: wallet as never,
                signer: OWNER,
                registry: REGISTRY,
                projectDir,
                config: CONFIG,
                storage: undefined,
            }, minted)).rejects.toThrow(/Managed metadata storage is required/);
            expect(() => createMetadataStorage(CONFIG, fetchImpl)).toThrow(/AGENTORY_API_BASE_URL is required/);
        });
        await withApiBaseUrl("http://example.com", async () => {
            expect(() => resolveAgentoryApiBaseUrl()).toThrow(/https URL/);
            expect(() => createMetadataStorage(CONFIG, fetchImpl)).toThrow(/https URL/);
            expect(() => uriForStoragePreflight(CONFIG)).toThrow(/https URL/);
        });
        expect(wallet.writeContract).not.toHaveBeenCalled();
        expect(fetchImpl).not.toHaveBeenCalled();
        const saved = projectDir;
        expect(fs.existsSync(path.join(saved, ".registration-state.json"))).toBe(false);
    });

    it("accepts an explicit staging HTTPS origin and a localhost HTTP origin", async () => {
        const metadata = buildRegistrationMetadata(CONFIG, 7n, REGISTRY);
        const previousAuthDisabled = process.env.MANAGED_UPLOAD_AUTH_DISABLED;
        process.env.MANAGED_UPLOAD_AUTH_DISABLED = "true";
        try {
        await withApiBaseUrl("https://staging.agentory.xyz/ignored-path", async () => {
            const fetchImpl = vi.fn().mockResolvedValue(successResponse());
            const storage = createMetadataStorage(CONFIG, fetchImpl);
            const published = await storage.publish({
                metadata,
                projectId: CONFIG.projectId,
                agentId: 7n,
                chainId: 12227332,
                registry: REGISTRY,
            });
            expect(published.uri).toBe(agentURI);
            expect(fetchImpl).toHaveBeenCalledWith(
                "https://staging.agentory.xyz/api/registration-metadata",
                expect.objectContaining({ method: "POST" })
            );
            expect(uriForStoragePreflight(CONFIG)).toBe(MANAGED_URI_GAS_ESTIMATE);
        });
        await withApiBaseUrl("http://127.0.0.1:4010", async () => {
            const fetchImpl = vi.fn().mockResolvedValue(successResponse());
            const storage = createMetadataStorage(CONFIG, fetchImpl);
            await storage.publish({
                metadata,
                projectId: CONFIG.projectId,
                agentId: 7n,
                chainId: 12227332,
                registry: REGISTRY,
            });
            expect(fetchImpl).toHaveBeenCalledWith(
                "http://127.0.0.1:4010/api/registration-metadata",
                expect.objectContaining({ method: "POST" })
            );
        });
        await withApiBaseUrl("http://localhost:4010", async () => {
            expect(resolveAgentoryApiBaseUrl()).toBe("http://localhost:4010");
        });
        } finally {
            if (previousAuthDisabled === undefined) delete process.env.MANAGED_UPLOAD_AUTH_DISABLED;
            else process.env.MANAGED_UPLOAD_AUTH_DISABLED = previousAuthDisabled;
        }
    });
});
