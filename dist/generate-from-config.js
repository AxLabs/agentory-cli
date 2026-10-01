import fs from "node:fs";
import path from "node:path";
import { CHAINS } from "./config.js";
import { isSolanaChain } from "./config-solana.js";
import { isNeoxChain } from "./neox/constants.js";
import { assertRegistrationMetadataUri } from "./neox/metadata.js";
import { DEFAULT_METADATA_STORAGE } from "./wizard.js";
export function wizardAnswersFromConfig(raw) {
    if (!raw.projectDir || !raw.agentName || !raw.agentDescription || !raw.chain) {
        throw new Error("Config requires projectDir, agentName, agentDescription, and chain");
    }
    if (!isSolanaChain(raw.chain) && !(raw.chain in CHAINS)) {
        throw new Error(`Unknown chain: ${raw.chain}`);
    }
    const metadataStorage = raw.metadataStorage ?? (isNeoxChain(raw.chain) ? DEFAULT_METADATA_STORAGE : "inline");
    if (!["managed", "uri", "inline", "neofs"].includes(metadataStorage)) {
        throw new Error(`Unsupported metadataStorage "${raw.metadataStorage}". Use managed, uri, inline, or neofs.`);
    }
    if (metadataStorage === "uri" && isSolanaChain(raw.chain)) {
        throw new Error('metadataStorage "uri" is not supported for Solana projects');
    }
    if (raw.metadataUri && metadataStorage !== "uri") {
        throw new Error('metadataUri requires metadataStorage: "uri"');
    }
    const metadataUri = metadataStorage === "uri"
        ? assertRegistrationMetadataUri(raw.metadataUri)
        : undefined;
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
export function readGenerateConfigFile(configPath) {
    const resolved = path.resolve(configPath);
    if (!fs.existsSync(resolved)) {
        throw new Error(`Config file not found: ${resolved}`);
    }
    return JSON.parse(fs.readFileSync(resolved, "utf8"));
}
