import { MANAGED_METADATA_PATH } from "../constants.js";
import type { FetchLike } from "./types.js";
import {
    type ManagedMetadataRequestProtection,
    type ManagedUploadProtectionContext,
    ManagedMetadataError,
    resolveAgentoryApiBaseUrl,
} from "./managed.js";

export const MANAGED_UPLOAD_AUTHORIZATION_SCHEME = "AgentoryUpload";
export const MANAGED_UPLOAD_AUTHORIZATION_VERSION = "v1";

export function formatManagedUploadAuthorizationHeader(args: {
    challengeId: string;
    signature: string;
}): string {
    return `${MANAGED_UPLOAD_AUTHORIZATION_SCHEME} ${MANAGED_UPLOAD_AUTHORIZATION_VERSION} challenge="${args.challengeId}" signature="${args.signature}"`;
}

interface ChallengeResponse {
    challengeId: string;
    message: string;
    expiresAt: string;
}

export function managedUploadAuthDisabled(): boolean {
    const raw =
        process.env.MANAGED_UPLOAD_AUTH_DISABLED ?? process.env.AGENTORY_MANAGED_UPLOAD_AUTH_DISABLED;
    return raw === "true" || raw === "1";
}

export function createWalletManagedMetadataProtection(args: {
    apiBaseUrl?: string;
    fetchImpl?: FetchLike;
    signerAddress: string;
    signMessage(message: string): Promise<string>;
}): ManagedMetadataRequestProtection {
    const apiBaseUrl = resolveAgentoryApiBaseUrl(args.apiBaseUrl);
    const fetchImpl = args.fetchImpl ?? fetch;
    return {
        async apply(headers, context: ManagedUploadProtectionContext) {
            const challengeUrl = `${apiBaseUrl}${MANAGED_METADATA_PATH}/challenge`;
            const challengeBody = {
                signerAddress: args.signerAddress,
                chainId: String(context.chainId),
                agentRegistry: context.registry,
                agentId: context.agentId.toString(10),
                contentHash: context.contentHash,
            };
            let response: Response;
            try {
                response = await fetchImpl(challengeUrl, {
                    method: "POST",
                    headers: {
                        accept: "application/json",
                        "content-type": "application/json",
                    },
                    body: JSON.stringify(challengeBody),
                });
            } catch (error) {
                const detail = error instanceof Error ? error.message : "network request failed";
                throw new ManagedMetadataError({
                    code: "storage_unavailable",
                    message: `Agentory managed upload challenge could not be reached (${detail}).`,
                    failureClass: "transport",
                    retryable: true,
                });
            }
            if (!response.ok) {
                throw new ManagedMetadataError({
                    code: "challenge_rejected",
                    message: `Agentory refused the managed upload challenge (HTTP ${response.status}).`,
                    failureClass: "security",
                    retryable: false,
                });
            }
            const challenge = (await response.json()) as ChallengeResponse;
            const signature = await args.signMessage(challenge.message);
            headers.set(
                "authorization",
                formatManagedUploadAuthorizationHeader({
                    challengeId: challenge.challengeId,
                    signature,
                })
            );
        },
    };
}
