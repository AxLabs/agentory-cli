/** True when `value` is the canonical base58 form of a 32-byte NeoFS id. */
export declare function isCanonicalNeoFsId(value: string): boolean;
/**
 * True only for `neofs:<canonical-container-id>/<canonical-object-id>`.
 * The returned ids are the exact substrings of `agentURI`.
 */
export declare function parseCanonicalNeofsAgentUri(agentURI: string): {
    containerId: string;
    objectId: string;
} | null;
export declare function neofsObjectReadUrl(agentURI: string, gateway?: string): string;
/** Representative `neofs:` URI used only to estimate setAgentURI gas before an object exists. */
export declare const MANAGED_URI_GAS_ESTIMATE: string;
