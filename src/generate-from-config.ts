import fs from "node:fs";
import path from "node:path";
import type { WizardAnswers } from "./wizard.js";
import { CHAINS, type ChainKey, type TrustModel } from "./config.js";
import { isSolanaChain, type SolanaChainKey } from "./config-solana.js";
import { assertRegistrationMetadataUri } from "./neox/metadata.js";

export interface GenerateConfigFile {
    projectDir: string;
    agentName: string;
    agentDescription: string;
    agentImage?: string;
    chain: ChainKey | SolanaChainKey;
    features?: WizardAnswers["features"];
    a2aStreaming?: boolean;
    trustModels?: TrustModel[];
    agentWallet?: string;
    generatedPrivateKey?: string;
    skipInstall?: boolean;
    metadataStorage?: "inline" | "neofs" | "external";
    agentURI?: string;
    a2aEndpoint?: string;
    mcpEndpoint?: string;
    oasfEndpoint?: string;
    skills?: string[];
    domains?: string[];
}

export function wizardAnswersFromConfig(raw: GenerateConfigFile): WizardAnswers {
    if (!raw.projectDir || !raw.agentName || !raw.agentDescription || !raw.chain) {
        throw new Error("Config requires projectDir, agentName, agentDescription, and chain");
    }
    if (!isSolanaChain(raw.chain) && !(raw.chain in CHAINS)) {
        throw new Error(`Unknown chain: ${raw.chain}`);
    }
    const metadataStorage = raw.metadataStorage ?? (raw.agentURI ? "external" : "inline");
    const agentURI = metadataStorage === "external"
        ? assertRegistrationMetadataUri(raw.agentURI)
        : undefined;
    if (raw.agentURI && metadataStorage !== "external") {
        throw new Error('agentURI requires metadataStorage: "external"');
    }
    return {
        projectDir: raw.projectDir,
        agentName: raw.agentName,
        agentDescription: raw.agentDescription,
        agentImage: raw.agentImage ?? "",
        features: raw.features ?? [],
        a2aStreaming: raw.a2aStreaming ?? false,
        chain: raw.chain,
        trustModels: raw.trustModels ?? [],
        agentWallet: raw.agentWallet ?? "",
        generatedPrivateKey: raw.generatedPrivateKey,
        metadataStorage,
        agentURI,
        a2aEndpoint: raw.a2aEndpoint,
        mcpEndpoint: raw.mcpEndpoint,
        oasfEndpoint: raw.oasfEndpoint,
        skills: raw.skills,
        domains: raw.domains,
    };
}

export function readGenerateConfigFile(configPath: string): GenerateConfigFile {
    const resolved = path.resolve(configPath);
    if (!fs.existsSync(resolved)) {
        throw new Error(`Config file not found: ${resolved}`);
    }
    return JSON.parse(fs.readFileSync(resolved, "utf8")) as GenerateConfigFile;
}
