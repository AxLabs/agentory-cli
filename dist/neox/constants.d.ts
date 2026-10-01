import { type Address, type Hex } from "viem";
/** Neo X T4 testnet only. Mainnet writes are intentionally unsupported. */
export declare const NEOX_T4_CHAIN_KEY: "neox-t4";
export declare const NEOX_T4_CHAIN_ID = 12227332;
export declare const NEOX_T4_CHAIN_ID_HEX: Hex;
export declare const NEOX_MAINNET_CHAIN_ID = 47763;
export declare const NEOX_T4_IDENTITY_REGISTRY: Address;
export declare const NEOX_T4_RPC_URL = "https://neoxt4seed1.ngd.network";
export declare const NEOX_T4_EXPLORER_URL = "https://xt4scan.ngd.network";
export declare const NEOX_T4_FAUCET_URL = "https://neoxfaucet.ngd.network/";
/** Path appended to the configured Agentory API origin. The origin is not inferred. */
export declare const MANAGED_METADATA_PATH = "/api/registration-metadata";
/** Public NeoFS REST read gateway. Not a write credential and not required configuration. */
export declare const DEFAULT_NEOFS_PUBLIC_READ_GATEWAY = "https://rest.fs.neo.org";
export declare const NEOX_T4_NATIVE_CURRENCY: {
    readonly name: "GAS";
    readonly symbol: "GAS";
    readonly decimals: 18;
};
/**
 * Neo X Policy requires a minimum priority fee (gas tip) of 20 gwei.
 * Always query the RPC as well; this is a floor, not a substitute for eth_maxPriorityFeePerGas.
 * @see https://xdocs.ngd.network/faq/transaction-underpriced-error
 */
export declare const NEOX_MIN_PRIORITY_FEE_WEI: bigint;
export declare const REGISTRATION_V1_TYPE = "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
/** 1x1 PNG so fixtures do not depend on a hosted image URL. */
export declare const DEFAULT_FIXTURE_IMAGE_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
export declare const STATE_FILE_NAME = ".registration-state.json";
export declare const RESULT_FILE_NAME = "registration-result.json";
export declare function isNeoxChain(chain: string): boolean;
export declare function agentRegistryCaip(registry: string, chainId?: number): string;
export declare function explorerTxUrl(txHash: string): string;
export declare function explorerAddressUrl(address: string): string;
export declare function defineNeoxT4(rpcUrl?: string): {
    blockExplorers: {
        readonly default: {
            readonly name: "Neo X T4 Explorer";
            readonly url: "https://xt4scan.ngd.network";
        };
    };
    blockTime?: number | undefined | undefined;
    contracts?: {
        [x: string]: import("viem").ChainContract | {
            [sourceId: number]: import("viem").ChainContract | undefined;
        } | undefined;
        ensRegistry?: import("viem").ChainContract | undefined;
        ensUniversalResolver?: import("viem").ChainContract | undefined;
        multicall3?: import("viem").ChainContract | undefined;
        erc6492Verifier?: import("viem").ChainContract | undefined;
    } | undefined;
    ensTlds?: readonly string[] | undefined;
    id: 12227332;
    name: "Neo X T4 (Testnet)";
    nativeCurrency: {
        readonly name: "GAS";
        readonly symbol: "GAS";
        readonly decimals: 18;
    };
    experimental_preconfirmationTime?: number | undefined | undefined;
    rpcUrls: {
        readonly default: {
            readonly http: readonly [string];
        };
    };
    sourceId?: number | undefined | undefined;
    testnet: true;
    custom?: Record<string, unknown> | undefined;
    extendSchema?: Record<string, unknown> | undefined;
    fees?: import("viem").ChainFees<undefined> | undefined;
    formatters?: undefined;
    prepareTransactionRequest?: ((args: import("viem").PrepareTransactionRequestParameters, options: {
        phase: "beforeFillTransaction" | "beforeFillParameters" | "afterFillParameters";
    }) => Promise<import("viem").PrepareTransactionRequestParameters>) | [fn: ((args: import("viem").PrepareTransactionRequestParameters, options: {
        phase: "beforeFillTransaction" | "beforeFillParameters" | "afterFillParameters";
    }) => Promise<import("viem").PrepareTransactionRequestParameters>) | undefined, options: {
        runAt: readonly ("beforeFillTransaction" | "beforeFillParameters" | "afterFillParameters")[];
    }] | undefined;
    serializers?: import("viem").ChainSerializers<undefined, import("viem").TransactionSerializable> | undefined;
    verifyHash?: ((client: import("viem").Client, parameters: import("viem").VerifyHashActionParameters) => Promise<import("viem").VerifyHashActionReturnType>) | undefined;
};
export declare function assertTestnetWritesAllowed(chainId: number): void;
