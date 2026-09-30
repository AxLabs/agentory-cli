import { type ChainKey, type TrustModel, type X402Provider } from "./config.js";
import { type SolanaChainKey } from "./config-solana.js";
export interface WizardAnswers {
    projectDir: string;
    agentName: string;
    agentDescription: string;
    agentImage: string;
    features: ("a2a" | "mcp" | "x402")[];
    a2aStreaming: boolean;
    chain: ChainKey | SolanaChainKey;
    trustModels: TrustModel[];
    agentWallet: string;
    generatedPrivateKey?: string;
    x402Provider?: X402Provider;
    metadataStorage?: "inline" | "neofs" | "external";
    /** Existing user-managed registration metadata URI. */
    agentURI?: string;
    skills?: string[];
    domains?: string[];
    /** Public agent-card URL for ERC-8004 A2A service metadata (Neo X). */
    a2aEndpoint?: string;
    /** Optional public HTTP(S) MCP endpoint for ERC-8004 discovery (Neo X; stdio-only if omitted). */
    mcpEndpoint?: string;
    /** Optional OASF service/resource endpoint for ERC-8004 metadata (Neo X). */
    oasfEndpoint?: string;
}
export { isSolanaChain } from "./config-solana.js";
export declare const hasFeature: (answers: WizardAnswers, feature: "a2a" | "mcp" | "x402") => boolean;
export declare const NORMAL_METADATA_STORAGE_CHOICES: {
    name: string;
    value: "external";
}[];
export declare function runWizard(): Promise<WizardAnswers>;
