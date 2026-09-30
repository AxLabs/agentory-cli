import type { Address, Hex } from "viem";
export type RegistrationStage = "not-started" | "register-broadcast" | "minted" | "set-uri-broadcast" | "uri-set" | "verified";
/** ERC-8004 registration-v1 service declaration (A2A, MCP, OASF, or custom). */
export interface AgentService {
    name: string;
    endpoint: string;
    version?: string;
    skills?: string[];
    domains?: string[];
}
export interface AgentProjectConfig {
    name: string;
    description: string;
    image: string;
    projectId: string;
    chainId?: number;
    registry?: Address;
    rpcUrl?: string;
    metadataStorage?: MetadataStorageBackend;
    /** Existing user-managed registration metadata URI. Preserved exactly. */
    agentURI?: string;
    services?: AgentService[];
}
export type MetadataStorageBackend = "inline" | "neofs" | "external";
export interface PublishedMetadata {
    uri: string;
    backend: MetadataStorageBackend;
    containerId?: string;
    objectId?: string;
}
export interface RegistrationRecord {
    agentId: number | string;
    agentRegistry: string;
}
export interface AgentRegistrationMetadata {
    type: string;
    name: string;
    description: string;
    image: string;
    services: AgentService[];
    active: false;
    x402Support: false;
    supportedTrust: [];
    registrations: RegistrationRecord[];
}
export interface RegistrationState {
    chainId: number;
    registry: Address;
    projectId: string;
    stage: RegistrationStage;
    signer?: Address;
    /** Decimal string. Agent ID 0 is valid. */
    agentId?: string;
    owner?: Address;
    agentWallet?: Address;
    agentURI?: string;
    registerTxHash?: Hex;
    registerBlockNumber?: string;
    registerBlockHash?: Hex;
    setUriTxHash?: Hex;
    setUriBlockNumber?: string;
    setUriBlockHash?: Hex;
    pendingTxHash?: Hex;
    pendingKind?: "register" | "setAgentURI";
    metadata?: AgentRegistrationMetadata;
    metadataStorage?: PublishedMetadata;
    verifiedAt?: string;
}
export interface FeeQuote {
    gasPrice: bigint;
    baseFee: bigint;
    maxPriorityFeePerGas: bigint;
    maxFeePerGas: bigint;
    gasEstimate?: bigint;
    estimatedFeeWei?: bigint;
}
export interface PreflightReport {
    chainId: number;
    registry: Address;
    signer: Address;
    balanceWei: bigint;
    registryName: string;
    registryVersion: string;
    bytecodeLength: number;
    fees: FeeQuote;
    nextAction: "register" | "setAgentURI" | "already-complete";
    agentId?: string;
    estimatedFeeWei: bigint;
}
export interface VerificationResult {
    agentId: string;
    owner: Address;
    agentWallet: Address;
    tokenURI: string;
    decodedMetadata?: AgentRegistrationMetadata;
    metadataMatches?: boolean;
    registrationRefMatches?: boolean;
    metadataStorage: PublishedMetadata;
    servicesMatch?: boolean;
    expectedServices: AgentService[];
}
export interface SecretFreeRegistrationResult {
    chainId: number;
    registry: Address;
    agentId: string;
    owner: Address;
    agentWallet: Address;
    finalURI: string;
    agentURI: string;
    metadataStorage: PublishedMetadata;
    decodedMetadata?: AgentRegistrationMetadata;
    transactionHashes: {
        register?: Hex;
        setAgentURI?: Hex;
    };
    receipts: {
        register?: {
            blockNumber: string;
            blockHash: Hex;
        };
        setAgentURI?: {
            blockNumber: string;
            blockHash: Hex;
        };
    };
    verification: VerificationResult;
    explorer: {
        registerTx?: string;
        setAgentURITx?: string;
        registry?: string;
    };
}
