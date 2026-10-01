import { defineChain } from "viem";
/** Neo X T4 testnet only. Mainnet writes are intentionally unsupported. */
export const NEOX_T4_CHAIN_KEY = "neox-t4";
export const NEOX_T4_CHAIN_ID = 12227332;
export const NEOX_T4_CHAIN_ID_HEX = "0xba9304";
export const NEOX_MAINNET_CHAIN_ID = 47763;
export const NEOX_T4_IDENTITY_REGISTRY = "0x8004A856a396D08d31E597a867B1D8273901e641";
export const NEOX_T4_RPC_URL = "https://neoxt4seed1.ngd.network";
export const NEOX_T4_EXPLORER_URL = "https://xt4scan.ngd.network";
export const NEOX_T4_FAUCET_URL = "https://neoxfaucet.ngd.network/";
/** Path appended to the configured Agentory API origin. The origin is not inferred. */
export const MANAGED_METADATA_PATH = "/api/registration-metadata";
/** Public NeoFS REST read gateway. Not a write credential and not required configuration. */
export const DEFAULT_NEOFS_PUBLIC_READ_GATEWAY = "https://rest.fs.neo.org";
export const NEOX_T4_NATIVE_CURRENCY = {
    name: "GAS",
    symbol: "GAS",
    decimals: 18,
};
/**
 * Neo X Policy requires a minimum priority fee (gas tip) of 20 gwei.
 * Always query the RPC as well; this is a floor, not a substitute for eth_maxPriorityFeePerGas.
 * @see https://xdocs.ngd.network/faq/transaction-underpriced-error
 */
export const NEOX_MIN_PRIORITY_FEE_WEI = 20n * 1000000000n;
export const REGISTRATION_V1_TYPE = "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
/** 1x1 PNG so fixtures do not depend on a hosted image URL. */
export const DEFAULT_FIXTURE_IMAGE_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
export const STATE_FILE_NAME = ".registration-state.json";
export const RESULT_FILE_NAME = "registration-result.json";
export function isNeoxChain(chain) {
    return chain === NEOX_T4_CHAIN_KEY;
}
export function agentRegistryCaip(registry, chainId = NEOX_T4_CHAIN_ID) {
    return `eip155:${chainId}:${registry}`;
}
export function explorerTxUrl(txHash) {
    return `${NEOX_T4_EXPLORER_URL}/tx/${txHash}`;
}
export function explorerAddressUrl(address) {
    return `${NEOX_T4_EXPLORER_URL}/address/${address}`;
}
export function defineNeoxT4(rpcUrl = NEOX_T4_RPC_URL) {
    return defineChain({
        id: NEOX_T4_CHAIN_ID,
        name: "Neo X T4 (Testnet)",
        nativeCurrency: { ...NEOX_T4_NATIVE_CURRENCY },
        rpcUrls: {
            default: { http: [rpcUrl] },
        },
        blockExplorers: {
            default: {
                name: "Neo X T4 Explorer",
                url: NEOX_T4_EXPLORER_URL,
            },
        },
        testnet: true,
    });
}
export function assertTestnetWritesAllowed(chainId) {
    if (chainId === NEOX_MAINNET_CHAIN_ID) {
        throw new Error(`Mainnet writes are not supported (chainId ${chainId}). Use Neo X T4 (${NEOX_T4_CHAIN_ID}).`);
    }
    if (chainId !== NEOX_T4_CHAIN_ID) {
        throw new Error(`Refusing write: eth_chainId is ${chainId}, expected Neo X T4 ${NEOX_T4_CHAIN_ID}.`);
    }
}
