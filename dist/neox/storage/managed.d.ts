import type { PublishedMetadata } from "../types.js";
import type { FetchLike, MetadataStorage, PublishMetadataInput } from "./types.js";
export type ManagedMetadataFailureClass = "validation" | "storage" | "security" | "transport";
/**
 * Attach the protection selected for this Agentory environment.
 * Development and staging currently accept the registration document with no client credential.
 * Implementations must not attach a NeoFS write secret or an EVM signing key.
 */
export interface ManagedUploadProtectionContext {
    contentHash: string;
    chainId: number;
    registry: string;
    agentId: bigint;
}
export interface ManagedMetadataRequestProtection {
    apply(headers: Headers, context: ManagedUploadProtectionContext): void | Promise<void>;
}
export declare const environmentManagedMetadataProtection: ManagedMetadataRequestProtection;
export declare class ManagedMetadataError extends Error {
    readonly code: string;
    readonly failureClass: ManagedMetadataFailureClass;
    readonly retryable: boolean;
    constructor(args: {
        code: string;
        message: string;
        failureClass: ManagedMetadataFailureClass;
        retryable: boolean;
    });
}
export interface ManagedMetadataStorageOptions {
    apiBaseUrl?: string;
    fetchImpl?: FetchLike;
    protection?: ManagedMetadataRequestProtection;
    /** Extra values that must never appear in thrown errors. */
    redactedValues?: string[];
}
interface ManagedSuccessBody {
    storage?: {
        type?: unknown;
        containerId?: unknown;
        objectId?: unknown;
    };
    agentURI?: unknown;
}
export declare function resolveAgentoryApiBaseUrl(value?: string | undefined): string;
export declare function scrubManagedErrorText(text: string, secrets: readonly string[]): string;
export declare class ManagedMetadataStorage implements MetadataStorage {
    private readonly fetchImpl;
    readonly backend: "managed";
    private readonly apiBaseUrl;
    private readonly protection;
    private readonly redactedValues;
    constructor(options?: ManagedMetadataStorageOptions, fetchImpl?: FetchLike);
    publish(input: PublishMetadataInput): Promise<PublishedMetadata>;
}
export declare function publicationFromResponse(parsed: ManagedSuccessBody, contentHash: string, secrets?: readonly string[]): PublishedMetadata;
export {};
