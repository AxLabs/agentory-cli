import fs from "node:fs";
import path from "node:path";
import { CHAINS, type ChainKey, type TrustModel } from "./config.js";
import { isSolanaChain, type SolanaChainKey } from "./config-solana.js";
import { isNeoxChain } from "./neox/constants.js";
import { DEFAULT_METADATA_STORAGE, type WizardAnswers } from "./wizard.js";

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
    metadataStorage?: "managed" | "uri" | "inline" | "neofs";
    metadataUri?: string;
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
    const metadataStorage = raw.metadataStorage ?? (isNeoxChain(raw.chain) ? DEFAULT_METADATA_STORAGE : "inline");
    if (!["managed", "uri", "inline", "neofs"].includes(metadataStorage)) {
        throw new Error(
            `Unsupported metadataStorage "${raw.metadataStorage}". Use managed, uri, inline, or neofs.`
        );
    }
    const metadataUri = raw.metadataUri?.trim() || undefined;
    if (metadataStorage === "uri" && !metadataUri) {
        throw new Error("metadataUri is required when metadataStorage is \"uri\"");
    }
    if (metadataUri && /\s/.test(metadataUri)) {
        throw new Error("metadataUri cannot contain whitespace");
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
        metadataUri: metadataStorage === "uri" ? metadataUri : undefined,
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
