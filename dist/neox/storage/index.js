import { assertRegistrationMetadataUri } from "../metadata.js";
import { UserProvidedMetadataStorage } from "./external.js";
import { InlineMetadataStorage } from "./inline.js";
import { NeofsMetadataStorage, neofsPublicUri, validateNeofsStorageConfig } from "./neofs.js";
export * from "./types.js";
export * from "./inline.js";
export * from "./neofs.js";
export * from "./external.js";
export function metadataBackend(config) {
    const backend = config.metadataStorage || "inline";
    if (backend !== "inline" && backend !== "neofs" && backend !== "external") {
        throw new Error(`Unsupported metadataStorage "${backend}". Use inline, neofs, or external.`);
    }
    return backend;
}
export function createMetadataStorage(config, fetchImpl = fetch) {
    const backend = metadataBackend(config);
    if (backend === "inline")
        return new InlineMetadataStorage();
    if (backend === "external") {
        return new UserProvidedMetadataStorage(assertRegistrationMetadataUri(config.agentURI));
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
    if (backend === "external")
        return assertRegistrationMetadataUri(config.agentURI);
    const storageConfig = validateNeofsStorageConfig({
        restGateway: process.env.NEOFS_REST_GATEWAY ?? "",
        containerId: process.env.NEOFS_CONTAINER_ID ?? "",
        publicGateway: process.env.NEOFS_PUBLIC_GATEWAY ?? "",
        bearerToken: process.env.NEOFS_BEARER_TOKEN,
    });
    return neofsPublicUri(storageConfig, storageConfig.containerId, "1".repeat(44));
}
