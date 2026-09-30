/**
 * Solana chain configurations for 8004 protocol
 * Separate from EVM chains for maintainability
 */

export const SOLANA_CHAINS = {
    "solana-devnet": {
        name: "Solana Devnet",
        cluster: "devnet" as const,
        rpcUrl: "https://api.devnet.solana.com",
        explorer: "https://explorer.solana.com",
        explorerSuffix: "?cluster=devnet",
        programId: "HvF3JqhahcX7JfhbDRYYCJ7S3f6nJdrqu5yi9hyTREp",
        scanPath: null, // No supported explorer integration for this experimental path.
        x402Network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", // CAIP-2 for x402
    },
} as const;

export type SolanaChainKey = keyof typeof SOLANA_CHAINS;

/**
 * Type guard to check if a chain key is a Solana chain
 */
export function isSolanaChain(chain: string): chain is SolanaChainKey {
    return chain in SOLANA_CHAINS;
}

/**
 * Get Solana chain config with type safety
 */
export function getSolanaChain(key: SolanaChainKey) {
    return SOLANA_CHAINS[key];
}
