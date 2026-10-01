import { type ChainKey, type TrustModel } from "./config.js";
import { type SolanaChainKey } from "./config-solana.js";
import { type WizardAnswers } from "./wizard.js";
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
export declare function wizardAnswersFromConfig(raw: GenerateConfigFile): WizardAnswers;
export declare function readGenerateConfigFile(configPath: string): GenerateConfigFile;
