import { MANAGED_METADATA_PATH } from "../constants.js";
import { metadataContentHash } from "../metadata.js";
import { parseCanonicalNeofsAgentUri } from "./neofs-uri.js";
export const environmentManagedMetadataProtection = {
    apply() {
        // No client credential until the API's CLI protection mechanism is selected.
    },
};
export class ManagedMetadataError extends Error {
    code;
    failureClass;
    retryable;
    constructor(args) {
        super(args.message);
        this.name = "ManagedMetadataError";
        this.code = args.code;
        this.failureClass = args.failureClass;
        this.retryable = args.retryable;
    }
}
export function resolveAgentoryApiBaseUrl(value = process.env.AGENTORY_API_BASE_URL) {
    const raw = value?.trim().replace(/\/$/, "") ?? "";
    if (!raw) {
        throw new ManagedMetadataError({
            code: "missing_api_base_url",
            message: 'AGENTORY_API_BASE_URL is required when metadataStorage is "managed". Set it to the Agentory API origin before registering. Managed storage does not select an origin.',
            failureClass: "validation",
            retryable: false,
        });
    }
    let url;
    try {
        url = new URL(raw);
    }
    catch {
        throw new ManagedMetadataError({
            code: "invalid_api_base_url",
            message: "AGENTORY_API_BASE_URL must be an https URL for the Agentory environment that stores metadata.",
            failureClass: "validation",
            retryable: false,
        });
    }
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol === "https:" || (url.protocol === "http:" && local)) {
        return url.origin;
    }
    throw new ManagedMetadataError({
        code: "invalid_api_base_url",
        message: "AGENTORY_API_BASE_URL must be an https URL. Local http is accepted only for localhost testing.",
        failureClass: "validation",
        retryable: false,
    });
}
export function scrubManagedErrorText(text, secrets) {
    let out = text;
    const unique = [...new Set(secrets.map((secret) => secret.trim()).filter((secret) => secret.length >= 8))];
    unique.sort((left, right) => right.length - left.length);
    for (const secret of unique) {
        out = out.split(secret).join("[redacted]");
    }
    out = out.replace(/0x[a-fA-F0-9]{64}/g, "[redacted]");
    out = out.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
    out = out.replace(/\b5[HJK][1-9A-HJ-NP-Za-km-z]{49,51}\b/g, "[redacted]");
    return out;
}
function safeMessage(value, secrets) {
    if (typeof value !== "string")
        return undefined;
    const scrubbed = scrubManagedErrorText(value, secrets).trim();
    if (!scrubbed || scrubbed.length > 300)
        return undefined;
    return scrubbed;
}
function managedUploadUrl(apiBaseUrl) {
    return `${resolveAgentoryApiBaseUrl(apiBaseUrl)}${MANAGED_METADATA_PATH}`;
}
export class ManagedMetadataStorage {
    fetchImpl;
    backend = "managed";
    apiBaseUrl;
    protection;
    redactedValues;
    constructor(options = {}, fetchImpl = options.fetchImpl ?? fetch) {
        this.fetchImpl = fetchImpl;
        this.apiBaseUrl = resolveAgentoryApiBaseUrl(options.apiBaseUrl);
        this.protection = options.protection ?? environmentManagedMetadataProtection;
        this.redactedValues = options.redactedValues ?? [];
    }
    async publish(input) {
        const body = JSON.stringify(input.metadata);
        const headers = new Headers({
            accept: "application/json",
            "content-type": "application/json",
        });
        await this.protection.apply(headers);
        const secrets = headerSecrets(headers, this.redactedValues);
        const url = managedUploadUrl(this.apiBaseUrl);
        let response;
        try {
            response = await this.fetchImpl(url, {
                method: "POST",
                headers,
                body,
            });
        }
        catch (error) {
            const detail = error instanceof Error ? error.message : "network request failed";
            throw new ManagedMetadataError({
                code: "storage_unavailable",
                message: scrubManagedErrorText(`Agentory managed storage could not be reached (${detail}). The minted identity is unchanged. Run register again to retry the upload. setAgentURI is sent only after a successful upload.`, secrets),
                failureClass: "transport",
                retryable: true,
            });
        }
        const raw = await response.text();
        if (!response.ok) {
            throw errorFromResponse(response.status, raw, secrets);
        }
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch {
            throw malformedResponse(secrets);
        }
        return publicationFromResponse(parsed, metadataContentHash(input.metadata), secrets);
    }
}
function headerSecrets(headers, extra) {
    const secrets = [...extra];
    headers.forEach((value, key) => {
        const normalized = key.toLowerCase();
        if (normalized === "authorization" || normalized === "cookie" || normalized === "x-api-key") {
            secrets.push(value);
            const bearer = value.replace(/^Bearer\s+/i, "");
            if (bearer !== value)
                secrets.push(bearer);
        }
    });
    return secrets;
}
function malformedResponse(secrets) {
    return new ManagedMetadataError({
        code: "malformed_response",
        message: scrubManagedErrorText("Agentory returned an unexpected managed-storage response. The minted identity is unchanged, and setAgentURI was not sent. Retry only if the metadata document is unchanged.", secrets),
        failureClass: "validation",
        retryable: false,
    });
}
function errorFromResponse(status, raw, secrets) {
    let body = {};
    try {
        body = JSON.parse(raw);
    }
    catch {
        body = {};
    }
    const code = typeof body.error === "string" && body.error.trim() ? body.error.trim() : `http_${status}`;
    const failureClass = body.failureClass;
    const serverMessage = safeMessage(body.message, secrets);
    const classified = failureClass === "security" || status === 401 || status === 403
        ? "security"
        : failureClass === "validation" || failureClass === "storage"
            ? failureClass
            : status >= 500
                ? "storage"
                : "validation";
    const retryable = body.retryable === true || classified === "storage" && code === "storage_unavailable";
    if (classified === "security") {
        return new ManagedMetadataError({
            code,
            failureClass: "security",
            retryable: false,
            message: scrubManagedErrorText(serverMessage
                ? `Agentory refused the managed metadata upload (${code}): ${serverMessage} No NeoFS credential is required, and the EVM signing key is not sent.`
                : `Agentory refused the managed metadata upload (${code}). This environment is not authorized for managed storage. No NeoFS credential is required, and the EVM signing key is not sent.`, secrets),
        });
    }
    if (code === "storage_not_configured") {
        return new ManagedMetadataError({
            code,
            failureClass: "storage",
            retryable: false,
            message: "Agentory managed storage is not enabled in this environment. The minted identity is unchanged, and setAgentURI was not sent. Use an environment where managed upload is enabled, or choose your own URI.",
        });
    }
    if (classified === "storage" && retryable) {
        return new ManagedMetadataError({
            code,
            failureClass: "storage",
            retryable: true,
            message: scrubManagedErrorText(serverMessage
                ? `Agentory could not store the metadata (${code}): ${serverMessage} The minted identity is unchanged. Run register again to retry the upload.`
                : "Agentory could not store the metadata. The minted identity is unchanged. Run register again to retry the upload. setAgentURI was not sent.", secrets),
        });
    }
    if (classified === "storage") {
        return new ManagedMetadataError({
            code,
            failureClass: "storage",
            retryable: false,
            message: scrubManagedErrorText(serverMessage
                ? `Agentory rejected the metadata object (${code}): ${serverMessage} The minted identity is unchanged, and setAgentURI was not sent.`
                : "Agentory rejected the metadata object. The minted identity is unchanged, and setAgentURI was not sent.", secrets),
        });
    }
    return new ManagedMetadataError({
        code,
        failureClass: "validation",
        retryable: false,
        message: scrubManagedErrorText(serverMessage
            ? `Agentory rejected the registration metadata (${code}): ${serverMessage} The minted identity is unchanged, and setAgentURI was not sent.`
            : `Agentory rejected the registration metadata (${code}). The minted identity is unchanged, and setAgentURI was not sent.`, secrets),
    });
}
export function publicationFromResponse(parsed, contentHash, secrets = []) {
    const storage = parsed.storage;
    if (!storage || storage.type !== "neofs") {
        throw malformedResponse(secrets);
    }
    if (typeof storage.containerId !== "string" || typeof storage.objectId !== "string") {
        throw malformedResponse(secrets);
    }
    if (typeof parsed.agentURI !== "string") {
        throw malformedResponse(secrets);
    }
    const canonical = parseCanonicalNeofsAgentUri(parsed.agentURI);
    if (!canonical ||
        canonical.containerId !== storage.containerId ||
        canonical.objectId !== storage.objectId ||
        parsed.agentURI !== `neofs:${storage.containerId}/${storage.objectId}`) {
        throw malformedResponse(secrets);
    }
    return {
        backend: "managed",
        uri: parsed.agentURI,
        containerId: storage.containerId,
        objectId: storage.objectId,
        contentHash,
    };
}
