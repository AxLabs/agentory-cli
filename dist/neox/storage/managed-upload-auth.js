import { MANAGED_METADATA_PATH } from "../constants.js";
import { ManagedMetadataError, resolveAgentoryApiBaseUrl, } from "./managed.js";
export const MANAGED_UPLOAD_AUTHORIZATION_SCHEME = "AgentoryUpload";
export const MANAGED_UPLOAD_AUTHORIZATION_VERSION = "v1";
export function formatManagedUploadAuthorizationHeader(args) {
    return `${MANAGED_UPLOAD_AUTHORIZATION_SCHEME} ${MANAGED_UPLOAD_AUTHORIZATION_VERSION} challenge="${args.challengeId}" signature="${args.signature}"`;
}
export function managedUploadAuthDisabled() {
    const raw = process.env.MANAGED_UPLOAD_AUTH_DISABLED ?? process.env.AGENTORY_MANAGED_UPLOAD_AUTH_DISABLED;
    return raw === "true" || raw === "1";
}
export function createWalletManagedMetadataProtection(args) {
    const apiBaseUrl = resolveAgentoryApiBaseUrl(args.apiBaseUrl);
    const fetchImpl = args.fetchImpl ?? fetch;
    return {
        async apply(headers, context) {
            const challengeUrl = `${apiBaseUrl}${MANAGED_METADATA_PATH}/challenge`;
            const challengeBody = {
                signerAddress: args.signerAddress,
                chainId: String(context.chainId),
                agentRegistry: context.registry,
                agentId: context.agentId.toString(10),
                contentHash: context.contentHash,
            };
            let response;
            try {
                response = await fetchImpl(challengeUrl, {
                    method: "POST",
                    headers: {
                        accept: "application/json",
                        "content-type": "application/json",
                    },
                    body: JSON.stringify(challengeBody),
                });
            }
            catch (error) {
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
            let challenge;
            try {
                challenge = (await response.json());
            }
            catch {
                throw new ManagedMetadataError({
                    code: "challenge_malformed",
                    message: "Agentory returned a malformed managed upload challenge response.",
                    failureClass: "security",
                    retryable: false,
                });
            }
            if (typeof challenge.challengeId !== "string" ||
                !challenge.challengeId.trim() ||
                typeof challenge.message !== "string" ||
                !challenge.message.trim()) {
                throw new ManagedMetadataError({
                    code: "challenge_malformed",
                    message: "Agentory returned a malformed managed upload challenge response.",
                    failureClass: "security",
                    retryable: false,
                });
            }
            let signature;
            try {
                signature = await args.signMessage(challenge.message);
            }
            catch {
                throw new ManagedMetadataError({
                    code: "signing_failed",
                    message: "Could not sign the managed upload challenge with the connected wallet.",
                    failureClass: "security",
                    retryable: false,
                });
            }
            headers.set("authorization", formatManagedUploadAuthorizationHeader({
                challengeId: challenge.challengeId,
                signature,
            }));
        },
    };
}
