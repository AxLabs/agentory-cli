import { assertRegistrationMetadataUri } from "../metadata.js";
import type { AgentProjectConfig, MetadataStorageBackend } from "../types.js";
import { MANAGED_URI_GAS_ESTIMATE } from "./neofs-uri.js";
import { InlineMetadataStorage } from "./inline.js";
import { ManagedMetadataStorage, resolveAgentoryApiBaseUrl } from "./managed.js";
import { NeofsMetadataStorage, neofsPublicUri, validateNeofsStorageConfig } from "./neofs.js";
import type { FetchLike, MetadataStorage } from "./types.js";
import { UserUriMetadataStorage } from "./user-uri.js";

export * from "./types.js";
export * from "./inline.js";
export * from "./neofs.js";
export * from "./managed.js";
export * from "./user-uri.js";

const BACKENDS: readonly MetadataStorageBackend[] = ["managed", "uri", "inline", "neofs"];

export function metadataBackend(config: AgentProjectConfig): MetadataStorageBackend {
    const backend = config.metadataStorage || "inline";
    if (!BACKENDS.includes(backend)) {
        throw new Error(
            `Unsupported metadataStorage "${backend}". Use managed, uri, inline, or neofs.`
        );
    }
    return backend;
}

export function createMetadataStorage(
    config: AgentProjectConfig,
    fetchImpl: FetchLike = fetch
): MetadataStorage {
    const backend = metadataBackend(config);
    if (backend === "inline") return new InlineMetadataStorage();
    if (backend === "managed") {
        return new ManagedMetadataStorage(
            { apiBaseUrl: process.env.AGENTORY_API_BASE_URL, fetchImpl },
            fetchImpl
        );
    }
    if (backend === "uri") {
        return new UserUriMetadataStorage(config.metadataUri ?? "");
    }
    return new NeofsMetadataStorage(
        {
            restGateway: process.env.NEOFS_REST_GATEWAY ?? "",
            containerId: process.env.NEOFS_CONTAINER_ID ?? "",
            publicGateway: process.env.NEOFS_PUBLIC_GATEWAY ?? "",
            bearerToken: process.env.NEOFS_BEARER_TOKEN,
        },
        fetchImpl
    );
}

export function uriForStoragePreflight(config: AgentProjectConfig): string | undefined {
    const backend = metadataBackend(config);
    if (backend === "inline") return undefined;
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
