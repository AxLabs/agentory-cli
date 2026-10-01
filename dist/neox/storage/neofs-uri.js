import bs58 from "bs58";
import { DEFAULT_NEOFS_PUBLIC_READ_GATEWAY } from "../constants.js";
const NEOFS_ID_BYTES = 32;
/** True when `value` is the canonical base58 form of a 32-byte NeoFS id. */
export function isCanonicalNeoFsId(value) {
    if (!value || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(value))
        return false;
    try {
        const decoded = bs58.decode(value);
        return decoded.length === NEOFS_ID_BYTES && bs58.encode(decoded) === value;
    }
    catch {
        return false;
    }
}
/**
 * True only for `neofs:<canonical-container-id>/<canonical-object-id>`.
 * The returned ids are the exact substrings of `agentURI`.
 */
export function parseCanonicalNeofsAgentUri(agentURI) {
    const prefix = "neofs:";
    if (!agentURI.startsWith(prefix))
        return null;
    const rest = agentURI.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash <= 0 || rest.indexOf("/", slash + 1) !== -1)
        return null;
    const containerId = rest.slice(0, slash);
    const objectId = rest.slice(slash + 1);
    if (!isCanonicalNeoFsId(containerId) || !isCanonicalNeoFsId(objectId))
        return null;
    return { containerId, objectId };
}
export function neofsObjectReadUrl(agentURI, gateway = process.env.NEOFS_PUBLIC_GATEWAY?.trim() || DEFAULT_NEOFS_PUBLIC_READ_GATEWAY) {
    const parsed = parseCanonicalNeofsAgentUri(agentURI);
    if (!parsed) {
        throw new Error("tokenURI is not a canonical neofs:<containerId>/<objectId> value");
    }
    let base;
    try {
        base = new URL(gateway);
    }
    catch {
        throw new Error("NeoFS public read gateway must be an https URL");
    }
    if (base.protocol !== "https:") {
        throw new Error("NeoFS public read gateway must be an https URL");
    }
    const prefix = base.toString().replace(/\/$/, "");
    return `${prefix}/v1/objects/${encodeURIComponent(parsed.containerId)}/by_id/${encodeURIComponent(parsed.objectId)}`;
}
/** Representative `neofs:` URI used only to estimate setAgentURI gas before an object exists. */
export const MANAGED_URI_GAS_ESTIMATE = `neofs:${bs58.encode(Buffer.alloc(32, 1))}/${bs58.encode(Buffer.alloc(32, 2))}`;
