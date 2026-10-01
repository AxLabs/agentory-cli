import { createHash } from "node:crypto";
import { agentRegistryCaip, NEOX_T4_CHAIN_ID, REGISTRATION_V1_TYPE } from "./constants.js";
import { normalizeAgentServices } from "./services.js";
const DATA_JSON_PREFIX = "data:application/json;base64,";
export function agentIdToDecimalString(agentId) {
    return agentId.toString(10);
}
export function parseAgentId(value) {
    if (typeof value === "bigint")
        return value;
    if (typeof value === "number") {
        if (!Number.isInteger(value) || value < 0) {
            throw new Error(`Invalid agentId number: ${value}`);
        }
        return BigInt(value);
    }
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
        throw new Error(`Invalid agentId decimal string: ${value}`);
    }
    return BigInt(trimmed);
}
/**
 * JSON metadata uses a JSON number when the id is a safe integer (spec examples use numbers).
 * Callers must keep bigint/decimal-string forms for on-chain and exported state.
 */
export function agentIdForMetadataJson(agentId) {
    if (agentId <= BigInt(Number.MAX_SAFE_INTEGER)) {
        return Number(agentId);
    }
    return agentId.toString(10);
}
export function buildRegistrationMetadata(config, agentId, registry, chainId = NEOX_T4_CHAIN_ID) {
    const services = normalizeAgentServices(config.services ?? []);
    return {
        type: REGISTRATION_V1_TYPE,
        name: config.name,
        description: config.description,
        image: config.image,
        services,
        active: false,
        x402Support: false,
        supportedTrust: [],
        registrations: [
            {
                agentId: agentIdForMetadataJson(agentId),
                agentRegistry: agentRegistryCaip(registry, chainId),
            },
        ],
    };
}
export function encodeMetadataDataUri(metadata) {
    const json = JSON.stringify(metadata);
    return `${DATA_JSON_PREFIX}${Buffer.from(json, "utf8").toString("base64")}`;
}
export function decodeMetadataDataUri(uri) {
    if (!uri.startsWith(DATA_JSON_PREFIX)) {
        throw new Error(`tokenURI is not a base64 application/json data URI`);
    }
    const encoded = uri.slice(DATA_JSON_PREFIX.length);
    const canonicalBase64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
    if (!encoded || encoded.length % 4 !== 0 || !canonicalBase64.test(encoded)) {
        throw new Error("tokenURI contains invalid or noncanonical base64 metadata");
    }
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.toString("base64") !== encoded) {
        throw new Error("tokenURI contains invalid or noncanonical base64 metadata");
    }
    const json = bytes.toString("utf8");
    if (!Buffer.from(json, "utf8").equals(bytes)) {
        throw new Error("tokenURI metadata is not valid UTF-8 JSON");
    }
    try {
        return JSON.parse(json);
    }
    catch {
        throw new Error("tokenURI metadata is not valid JSON");
    }
}
export function metadataEquals(actual, expected) {
    return JSON.stringify(actual) === JSON.stringify(expected);
}
/** Identity of the exact JSON document sent to managed storage. */
export function metadataContentHash(metadata) {
    return createHash("sha256").update(JSON.stringify(metadata), "utf8").digest("hex");
}
export function registrationRefMatches(metadata, agentId, registry, chainId = NEOX_T4_CHAIN_ID) {
    const expected = agentRegistryCaip(registry, chainId);
    return metadata.registrations.some((entry) => {
        const id = parseAgentId(entry.agentId);
        return id === agentId && entry.agentRegistry === expected;
    });
}
