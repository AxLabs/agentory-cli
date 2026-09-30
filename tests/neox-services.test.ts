import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { Address } from "viem";
import { generateProject } from "../src/generator.js";
import { buildNeoxRegistrationServices } from "../src/neox-registration-services.js";
import {
    normalizeAgentServices,
    validateOptionalRegistrationServiceEndpoint,
    validateRegistrationServiceEndpoint,
} from "../src/neox/services.js";
import {
    buildRegistrationMetadata,
    decodeMetadataDataUri,
    encodeMetadataDataUri,
    registrationRefMatches,
} from "../src/neox/metadata.js";
import { NEOX_T4_IDENTITY_REGISTRY } from "../src/neox/constants.js";
import { emptyState } from "../src/neox/state.js";
import type { AgentProjectConfig, RegistrationState } from "../src/neox/types.js";
import { verifyOnChain } from "../src/neox/verify.js";
import type { WizardAnswers } from "../src/wizard.js";
import { generateNeoxAgentConfig } from "../src/templates/neox.js";

const REGISTRY = NEOX_T4_IDENTITY_REGISTRY;
const OWNER = "0x1111111111111111111111111111111111111111" as Address;

function baseAnswers(overrides: Partial<WizardAnswers> = {}): WizardAnswers {
    return {
        projectDir: "fixture",
        agentName: "Service Test Agent",
        agentDescription: "Fixture",
        agentImage: "https://example.com/a.png",
        features: [],
        a2aStreaming: false,
        chain: "neox-t4",
        trustModels: [],
        agentWallet: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        ...overrides,
    };
}

const BASE_CONFIG: AgentProjectConfig = {
    name: "Service Test Agent",
    description: "Fixture",
    image: "https://example.com/a.png",
    projectId: "service-test-agent",
};

async function verifyServicesFromAnswers(answers: WizardAnswers) {
    const config: AgentProjectConfig = {
        ...BASE_CONFIG,
        services: buildNeoxRegistrationServices(answers),
    };
    const metadata = buildRegistrationMetadata(config, 42n, REGISTRY);
    const uri = encodeMetadataDataUri(metadata);
    const state: RegistrationState = {
        ...emptyState(config.projectId),
        stage: "uri-set",
        agentId: "42",
        owner: OWNER,
        agentURI: uri,
        metadata,
        metadataStorage: { backend: "inline", uri },
    };
    const client = {
        readContract: vi.fn().mockImplementation(({ functionName }: { functionName: string }) => {
            if (functionName === "ownerOf" || functionName === "getAgentWallet") return OWNER;
            if (functionName === "tokenURI") return uri;
            throw new Error(`unexpected ${functionName}`);
        }),
    };
    return verifyOnChain({
        client: client as never,
        registry: REGISTRY,
        state,
        config,
        expectedOwner: OWNER,
    });
}

describe("Neo X registration services model", () => {
    it("normalizes zero services", () => {
        expect(normalizeAgentServices([])).toEqual([]);
        const metadata = buildRegistrationMetadata(BASE_CONFIG, 1n, REGISTRY);
        expect(metadata.services).toEqual([]);
    });

    it("includes A2A only", () => {
        const services = buildNeoxRegistrationServices(
            baseAnswers({
                features: ["a2a"],
                a2aEndpoint: "https://agent.example/.well-known/agent-card.json",
            })
        );
        expect(services).toEqual([
            { name: "A2A", endpoint: "https://agent.example/.well-known/agent-card.json" },
        ]);
    });

    it("includes MCP only when a public HTTP endpoint is configured", () => {
        const services = buildNeoxRegistrationServices(
            baseAnswers({
                features: ["mcp"],
                mcpEndpoint: "https://agent.example/mcp",
            })
        );
        expect(services).toEqual([{ name: "MCP", endpoint: "https://agent.example/mcp" }]);
    });

    it("omits MCP service metadata when MCP is selected without a public endpoint", () => {
        const services = buildNeoxRegistrationServices(baseAnswers({ features: ["mcp"] }));
        expect(services).toEqual([]);
    });

    it("includes A2A and MCP together when MCP endpoint is set", () => {
        const services = buildNeoxRegistrationServices(
            baseAnswers({
                features: ["a2a", "mcp"],
                a2aEndpoint: "https://agent.example/.well-known/agent-card.json",
                mcpEndpoint: "https://agent.example/mcp",
            })
        );
        expect(services).toHaveLength(2);
        expect(services.map((s) => s.name).sort()).toEqual(["A2A", "MCP"]);
    });

    it("rejects invalid MCP public endpoints", () => {
        const result = validateRegistrationServiceEndpoint("MCP", "ipfs://QmExample");
        expect(result.ok).toBe(false);
    });

    it("accepts blank optional MCP endpoint", () => {
        expect(validateOptionalRegistrationServiceEndpoint("MCP", "").ok).toBe(true);
        expect(validateOptionalRegistrationServiceEndpoint("MCP", "   ").ok).toBe(true);
    });

    it("does not inject YOUR_PUBLIC_HOST MCP placeholder into metadata", () => {
        const configSource = generateNeoxAgentConfig(baseAnswers({ features: ["mcp"] }));
        expect(configSource).not.toContain("YOUR_PUBLIC_HOST");
        expect(configSource).not.toContain('"name": "MCP"');
    });

    it("omits OASF service when skills/domains are set without an endpoint", () => {
        const services = buildNeoxRegistrationServices(
            baseAnswers({
                skills: ["technology/data_science/data_engineering"],
                domains: ["finance_and_business/investment_services"],
            })
        );
        expect(services).toEqual([]);
    });

    it("includes OASF with explicit HTTPS endpoint", () => {
        const services = buildNeoxRegistrationServices(
            baseAnswers({
                skills: ["technology/data_science/data_engineering"],
                domains: ["finance_and_business/investment_services"],
                oasfEndpoint: "https://agent.example/oasf",
            })
        );
        expect(services).toEqual([
            {
                name: "OASF",
                endpoint: "https://agent.example/oasf",
                skills: ["technology/data_science/data_engineering"],
                domains: ["finance_and_business/investment_services"],
            },
        ]);
    });

    it("includes OASF with explicit IPFS endpoint", () => {
        const services = buildNeoxRegistrationServices(
            baseAnswers({
                skills: ["technology/data_science/data_engineering"],
                oasfEndpoint: "ipfs://QmOasfResource",
            })
        );
        expect(services).toEqual([
            {
                name: "OASF",
                endpoint: "ipfs://QmOasfResource",
                skills: ["technology/data_science/data_engineering"],
            },
        ]);
    });

    it("does not auto-use the OASF taxonomy GitHub repo as service endpoint", () => {
        const services = buildNeoxRegistrationServices(
            baseAnswers({
                skills: ["technology/data_science/data_engineering"],
            })
        );
        expect(services.some((s) => s.endpoint.includes("github.com/8004-org/oasf"))).toBe(false);
    });

    it("accepts blank optional OASF endpoint", () => {
        expect(validateOptionalRegistrationServiceEndpoint("OASF", "").ok).toBe(true);
    });

    it("round-trips metadata with services and preserves registration ref", () => {
        const config: AgentProjectConfig = {
            ...BASE_CONFIG,
            services: [
                {
                    name: "A2A",
                    endpoint: "https://agent.example/.well-known/agent-card.json",
                    version: "0.3.0",
                },
            ],
        };
        const metadata = buildRegistrationMetadata(config, 9007199254740991n, REGISTRY);
        expect(metadata.registrations[0].agentId).toBe(9007199254740991);
        const uri = encodeMetadataDataUri(metadata);
        const decoded = decodeMetadataDataUri(uri);
        expect(decoded.services).toEqual(config.services);
        expect(registrationRefMatches(decoded, 9007199254740991n, REGISTRY)).toBe(true);
    });

    it("rejects unsafe endpoints", () => {
        expect(() =>
            normalizeAgentServices([{ name: "A2A", endpoint: "javascript:alert(1)" }])
        ).toThrow();
    });
});

describe("Neo X generator service declarations", () => {
    const outputRoot = path.join(process.cwd(), "test-output", "neox-services-generator");

    it("emits no A2A/MCP services without features", async () => {
        const configSource = generateNeoxAgentConfig(baseAnswers());
        expect(configSource).not.toContain('"name": "A2A"');
        expect(configSource).not.toContain('"name": "MCP"');
    });

    it("emits A2A service aligned with agent-card path", () => {
        const configSource = generateNeoxAgentConfig(
            baseAnswers({
                features: ["a2a"],
                a2aEndpoint: "https://public.example/.well-known/agent-card.json",
            })
        );
        expect(configSource).toContain('"name": "A2A"');
        expect(configSource).toContain(".well-known/agent-card.json");
    });

    it("generates MCP server script without MCP service metadata when no public endpoint", async () => {
        await fs.promises.rm(outputRoot, { recursive: true, force: true });
        await generateProject(
            baseAnswers({
                projectDir: path.join(outputRoot, "mcp-stdio-only"),
                features: ["mcp"],
            })
        );
        const pkg = JSON.parse(
            await fs.promises.readFile(path.join(outputRoot, "mcp-stdio-only", "package.json"), "utf8")
        );
        expect(pkg.scripts["start:mcp"]).toBeDefined();
        const configSource = await fs.promises.readFile(
            path.join(outputRoot, "mcp-stdio-only", "src", "agent-config.ts"),
            "utf8"
        );
        expect(configSource).not.toContain('"name": "MCP"');
        const mcpServer = await fs.promises.readFile(
            path.join(outputRoot, "mcp-stdio-only", "src", "mcp-server.ts"),
            "utf8"
        );
        expect(mcpServer).toContain("StdioServerTransport");
    });

    it("writes README service discovery guidance", async () => {
        await fs.promises.rm(outputRoot, { recursive: true, force: true });
        await generateProject(
            baseAnswers({
                projectDir: path.join(outputRoot, "a2a-only"),
                features: ["a2a"],
                a2aEndpoint: "https://public.example/.well-known/agent-card.json",
            })
        );
        const readme = await fs.promises.readFile(
            path.join(outputRoot, "a2a-only", "README.md"),
            "utf8"
        );
        expect(readme).toContain("agent-config.ts");
        expect(readme).toContain("https://staging.agentory.xyz");
        expect(readme).not.toContain("agentory.xyz/api/agents");
        expect(readme).not.toContain("not advertised in on-chain metadata");
    });

    it("README distinguishes stdio MCP from ERC-8004 HTTP advertisement", async () => {
        await fs.promises.rm(outputRoot, { recursive: true, force: true });
        await generateProject(
            baseAnswers({
                projectDir: path.join(outputRoot, "mcp-readme"),
                features: ["mcp"],
            })
        );
        const readme = await fs.promises.readFile(
            path.join(outputRoot, "mcp-readme", "README.md"),
            "utf8"
        );
        expect(readme).toContain("stdio MCP server");
        expect(readme).toContain("does not listen on HTTP");
        expect(readme).toContain("does not serve the HTTP URL");
    });
});

describe("resumable registration metadata", () => {
    it("rebuilds identical service declarations across register retries", () => {
        const config: AgentProjectConfig = {
            ...BASE_CONFIG,
            services: [{ name: "A2A", endpoint: "https://resume.example/.well-known/agent-card.json" }],
        };
        const first = buildRegistrationMetadata(config, 0n, REGISTRY);
        const second = buildRegistrationMetadata(config, 0n, REGISTRY);
        expect(second).toEqual(first);
        expect(decodeMetadataDataUri(encodeMetadataDataUri(first)).services).toEqual(config.services);
    });

    it("rebuilds identical services when MCP is stdio-only (no public advertisement)", () => {
        const built = buildNeoxRegistrationServices(baseAnswers({ features: ["mcp"] }));
        const config: AgentProjectConfig = { ...BASE_CONFIG, services: built };
        const first = buildRegistrationMetadata(config, 42n, REGISTRY);
        const second = buildRegistrationMetadata(config, 42n, REGISTRY);
        expect(second).toEqual(first);
        expect(first.services).toEqual([]);
    });

    it("verifies stdio-only MCP without expecting a public service entry", async () => {
        const result = await verifyServicesFromAnswers(baseAnswers({ features: ["mcp"] }));
        expect(result.expectedServices).toEqual([]);
        expect(result.metadataMatches).toBe(true);
    });

    it("verifies taxonomy-only OASF without expecting a public service entry", async () => {
        const result = await verifyServicesFromAnswers(baseAnswers({
            skills: ["technology/data_science/data_engineering"],
            domains: ["finance_and_business/investment_services"],
        }));
        expect(result.expectedServices).toEqual([]);
        expect(result.metadataMatches).toBe(true);
    });
});
