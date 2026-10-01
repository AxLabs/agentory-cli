import { createHash } from "node:crypto";
import { agentRegistryCaip, NEOX_T4_CHAIN_ID, REGISTRATION_V1_TYPE } from "./constants.js";
import { normalizeAgentServices } from "./services.js";
import type { AgentProjectConfig, AgentRegistrationMetadata } from "./types.js";

const DATA_JSON_PREFIX = "data:application/json;base64,";
export const REGISTRATION_URI_MAX_LENGTH = 2048;

const SUPPORTED_REGISTRATION_URI_PROTOCOLS = new Set(["https:", "ipfs:", "neofs:"]);

export type RegistrationUriValidation =
    | { ok: true; value: string }
    | { ok: false; message: string };

/**
 * Validate syntax only. The accepted value is returned unchanged: this does not
 * fetch, normalize, or rewrite a user-managed registration metadata URI.
 */
export function validateRegistrationMetadataUri(value: string): RegistrationUriValidation {
    if (!value) {
        return { ok: false, message: "Registration metadata URI is required" };
    }
    if (value !== value.trim()) {
        return {
            ok: false,
            message: "Registration metadata URI must not contain leading or trailing whitespace",
        };
    }
    if (value.length > REGISTRATION_URI_MAX_LENGTH) {
        return {
            ok: false,
            message: `Registration metadata URI must be at most ${REGISTRATION_URI_MAX_LENGTH} characters`,
        };
    }
    if (/\s|[<>]/.test(value)) {
        return {
            ok: false,
            message: "Registration metadata URI contains invalid characters",
        };
    }

    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        return {
            ok: false,
            message: "Enter a valid https://, ipfs://, or neofs: registration metadata URI",
        };
    }

    if (!SUPPORTED_REGISTRATION_URI_PROTOCOLS.has(parsed.protocol)) {
        return {
            ok: false,
            message: "Registration metadata URI must use https://, ipfs://, or neofs:",
        };
    }
    if (parsed.username || parsed.password) {
        return {
            ok: false,
            message: "Registration metadata URI must not contain embedded credentials",
        };
    }
    if (parsed.protocol === "https:" && !parsed.hostname) {
        return { ok: false, message: "HTTPS registration metadata URI must include a host" };
    }
    if (parsed.protocol === "ipfs:" && !parsed.hostname) {
        return { ok: false, message: "IPFS registration metadata URI must include a CID" };
    }
    if (parsed.protocol === "neofs:" && !value.slice("neofs:".length).replace(/^\/*/, "")) {
        return { ok: false, message: "NeoFS registration metadata URI must include an object reference" };
    }

    return { ok: true, value };
}

export function assertRegistrationMetadataUri(value: string | undefined): string {
    const result = validateRegistrationMetadataUri(value ?? "");
    if (!result.ok) {
        throw new Error(result.message);
    }
    return result.value;
}

export function agentIdToDecimalString(agentId: bigint): string {
    return agentId.toString(10);
}

export function parseAgentId(value: string | number | bigint): bigint {
    if (typeof value === "bigint") return value;
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
export function agentIdForMetadataJson(agentId: bigint): number | string {
    if (agentId <= BigInt(Number.MAX_SAFE_INTEGER)) {
        return Number(agentId);
    }
    return agentId.toString(10);
}

export function buildRegistrationMetadata(
    config: Pick<AgentProjectConfig, "name" | "description" | "image" | "services">,
    agentId: bigint,
    registry: string,
    chainId = NEOX_T4_CHAIN_ID
): AgentRegistrationMetadata {
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

export function encodeMetadataDataUri(metadata: AgentRegistrationMetadata): string {
    const json = JSON.stringify(metadata);
    return `${DATA_JSON_PREFIX}${Buffer.from(json, "utf8").toString("base64")}`;
}

export function decodeMetadataDataUri(uri: string): AgentRegistrationMetadata {
    if (!uri.startsWith(DATA_JSON_PREFIX)) {
        throw new Error(`tokenURI is not a base64 application/json data URI`);
    }
    const encoded = uri.slice(DATA_JSON_PREFIX.length);
    const canonicalBase64 =
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
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
        return JSON.parse(json) as AgentRegistrationMetadata;
    } catch {
        throw new Error("tokenURI metadata is not valid JSON");
    }
}

export function metadataEquals(actual: AgentRegistrationMetadata, expected: AgentRegistrationMetadata): boolean {
    return JSON.stringify(actual) === JSON.stringify(expected);
}

/** Identity of the exact JSON document sent to managed storage. */
export function metadataContentHash(metadata: AgentRegistrationMetadata): string {
    return createHash("sha256").update(JSON.stringify(metadata), "utf8").digest("hex");
}

export function registrationRefMatches(
    metadata: AgentRegistrationMetadata,
    agentId: bigint,
    registry: string,
    chainId = NEOX_T4_CHAIN_ID
): boolean {
    const expected = agentRegistryCaip(registry, chainId);
    return metadata.registrations.some((entry) => {
        const id = parseAgentId(entry.agentId);
        return id === agentId && entry.agentRegistry === expected;
    });
}
