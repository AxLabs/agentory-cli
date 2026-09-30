import type { AgentProjectConfig } from "../types.js";
import type { FetchLike, MetadataStorage } from "./types.js";
export * from "./types.js";
export * from "./inline.js";
export * from "./neofs.js";
export * from "./external.js";
export declare function metadataBackend(config: AgentProjectConfig): "inline" | "neofs" | "external";
export declare function createMetadataStorage(config: AgentProjectConfig, fetchImpl?: FetchLike): MetadataStorage;
export declare function uriForStoragePreflight(config: AgentProjectConfig): string | undefined;
