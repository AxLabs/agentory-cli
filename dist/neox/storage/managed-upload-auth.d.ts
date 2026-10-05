import type { FetchLike } from "./types.js";
import { type ManagedMetadataRequestProtection } from "./managed.js";
export declare const MANAGED_UPLOAD_AUTHORIZATION_SCHEME = "AgentoryUpload";
export declare const MANAGED_UPLOAD_AUTHORIZATION_VERSION = "v1";
export declare function formatManagedUploadAuthorizationHeader(args: {
    challengeId: string;
    signature: string;
}): string;
export declare function managedUploadAuthDisabled(): boolean;
export declare function createWalletManagedMetadataProtection(args: {
    apiBaseUrl?: string;
    fetchImpl?: FetchLike;
    signerAddress: string;
    signMessage(message: string): Promise<string>;
}): ManagedMetadataRequestProtection;
