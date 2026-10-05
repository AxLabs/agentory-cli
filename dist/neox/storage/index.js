import { assertRegistrationMetadataUri } from "../metadata.js";
import { MANAGED_URI_GAS_ESTIMATE } from "./neofs-uri.js";
import { InlineMetadataStorage } from "./inline.js";
import { createWalletManagedMetadataProtection, managedUploadAuthDisabled, } from "./managed-upload-auth.js";
import { ManagedMetadataStorage, resolveAgentoryApiBaseUrl } from "./managed.js";
import { NeofsMetadataStorage, neofsPublicUri, validateNeofsStorageConfig } from "./neofs.js";
import { UserUriMetadataStorage } from "./user-uri.js";
export * from "./types.js";
export * from "./inline.js";
export * from "./neofs.js";
export * from "./managed.js";
export * from "./managed-upload-auth.js";
export * from "./user-uri.js";
const BACKENDS = ["managed", "uri", "inline", "neofs"];
export function metadataBackend(config) {
    const backend = config.metadataStorage || "inline";
    if (!BACKENDS.includes(backend)) {
        throw new Error(`Unsupported metadataStorage "${backend}". Use managed, uri, inline, or neofs.`);
    }
    return backend;
}
export function createMetadataStorage(config, fetchImpl = fetch, options = {}) {
    const backend = metadataBackend(config);
    if (backend === "inline")
        return new InlineMetadataStorage();
    if (backend === "managed") {
        const apiBaseUrl = resolveAgentoryApiBaseUrl();
        let protection;
        if (!managedUploadAuthDisabled()) {
            if (!options.signerAddress || !options.signMessage) {
                throw new Error("Managed Agentory uploads require a connected wallet signer when authorization is enabled.");
            }
            protection = createWalletManagedMetadataProtection({
                apiBaseUrl,
                fetchImpl: options.fetchImpl ?? fetchImpl,
                signerAddress: options.signerAddress,
                signMessage: options.signMessage,
            });
        }
        return new ManagedMetadataStorage({
            apiBaseUrl,
            fetchImpl: options.fetchImpl ?? fetchImpl,
            protection,
        }, options.fetchImpl ?? fetchImpl);
    }
    if (backend === "uri") {
        return new UserUriMetadataStorage(config.metadataUri ?? "");
    }
    return new NeofsMetadataStorage({
        restGateway: process.env.NEOFS_REST_GATEWAY ?? "",
        containerId: process.env.NEOFS_CONTAINER_ID ?? "",
        publicGateway: process.env.NEOFS_PUBLIC_GATEWAY ?? "",
        bearerToken: process.env.NEOFS_BEARER_TOKEN,
    }, fetchImpl);
}
export function uriForStoragePreflight(config) {
    const backend = metadataBackend(config);
    if (backend === "inline")
        return undefined;
    if (backend === "managed") {
        resolveAgentoryApiBaseUrl();
        return MANAGED_URI_GAS_ESTIMATE;
    }
    if (backend === "uri") {
        return assertRegistrationMetadataUri(config.metadataUri);
    }
    const storageConfig = validateNeofsStorageConfig({
        restGateway: process.env.NEOFS_REST_GATEWAY ?? "",
        containerId: process.env.NEOFS_CONTAINER_ID ?? "",
        publicGateway: process.env.NEOFS_PUBLIC_GATEWAY ?? "",
        bearerToken: process.env.NEOFS_BEARER_TOKEN,
    });
    return neofsPublicUri(storageConfig, storageConfig.containerId, "1".repeat(44));
}
