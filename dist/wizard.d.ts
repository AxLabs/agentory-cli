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
    metadataStorage?: "managed" | "uri" | "inline" | "neofs";
    /** Exact registration URI when metadataStorage is "uri". */
    metadataUri?: string;
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
/** Normal wizard storage choices. Legacy inline and direct NeoFS stay available to config and tests. */
export declare const METADATA_STORAGE_CHOICES: readonly [{
    readonly name: "Managed by Agentory (recommended)";
    readonly value: "managed";
}, {
    readonly name: "Use my own URI";
    readonly value: "uri";
}];
export declare const DEFAULT_METADATA_STORAGE: "managed";
export declare function runWizard(): Promise<WizardAnswers>;
