import { privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createWalletManagedMetadataProtection,
    formatManagedUploadAuthorizationHeader,
    managedUploadAuthDisabled,
} from "../src/neox/storage/managed-upload-auth.js";
import { ManagedMetadataError } from "../src/neox/storage/managed.js";

const SIGNER = privateKeyToAccount(`0x${"ab".repeat(32)}`);
const PRIVATE_KEY_FRAGMENT = "abababab";

async function withEnv<T>(
    values: Record<string, string | undefined>,
    run: () => Promise<T> | T
): Promise<T> {
    const previous = new Map<string, string | undefined>();
    for (const [key, value] of Object.entries(values)) {
        previous.set(key, process.env[key]);
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    try {
        return await run();
    } finally {
        for (const [key, value] of previous.entries()) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
}

describe("managed upload wallet auth", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("formats AgentoryUpload authorization headers", () => {
        expect(
            formatManagedUploadAuthorizationHeader({
                challengeId: "challenge-1",
                signature: "0x01",
            })
        ).toBe('AgentoryUpload v1 challenge="challenge-1" signature="0x01"');
    });

    it("requests a challenge with the expected payload and signs the returned message", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    challengeId: "challenge-42",
                    message: "sign-this",
                    expiresAt: "2026-01-01T00:05:00.000Z",
                }),
                { status: 200, headers: { "content-type": "application/json" } }
            )
        );
        const signMessage = vi.fn().mockResolvedValue("0xsig");
        const protection = createWalletManagedMetadataProtection({
            apiBaseUrl: "https://staging.agentory.xyz",
            fetchImpl,
            signerAddress: SIGNER.address,
            signMessage,
        });
        const headers = new Headers();
        await protection.apply(headers, {
            contentHash: "a".repeat(64),
            chainId: 12227332,
            registry: "0x8004A856a396D08d31E597a867B1D8273901e641",
            agentId: 7n,
        });

        expect(fetchImpl).toHaveBeenCalledWith(
            "https://staging.agentory.xyz/api/registration-metadata/challenge",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    signerAddress: SIGNER.address,
                    chainId: "12227332",
                    agentRegistry: "0x8004A856a396D08d31E597a867B1D8273901e641",
                    agentId: "7",
                    contentHash: "a".repeat(64),
                }),
            })
        );
        expect(signMessage).toHaveBeenCalledWith("sign-this");
        expect(headers.get("authorization")).toBe(
            'AgentoryUpload v1 challenge="challenge-42" signature="0xsig"'
        );
    });

    it("surfaces actionable errors when the challenge is rejected", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 403 }));
        const protection = createWalletManagedMetadataProtection({
            apiBaseUrl: "https://staging.agentory.xyz",
            fetchImpl,
            signerAddress: SIGNER.address,
            signMessage: vi.fn(),
        });
        await expect(
            protection.apply(new Headers(), {
                contentHash: "b".repeat(64),
                chainId: 12227332,
                registry: "0x8004A856a396D08d31E597a867B1D8273901e641",
                agentId: 1n,
            })
        ).rejects.toMatchObject({
            code: "challenge_rejected",
            failureClass: "security",
            retryable: false,
        });
    });

    it("rejects malformed challenge responses", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ challengeId: "", message: "" }), {
                status: 200,
                headers: { "content-type": "application/json" },
            })
        );
        const protection = createWalletManagedMetadataProtection({
            apiBaseUrl: "https://staging.agentory.xyz",
            fetchImpl,
            signerAddress: SIGNER.address,
            signMessage: vi.fn(),
        });
        await expect(
            protection.apply(new Headers(), {
                contentHash: "c".repeat(64),
                chainId: 12227332,
                registry: "0x8004A856a396D08d31E597a867B1D8273901e641",
                agentId: 2n,
            })
        ).rejects.toMatchObject({ code: "challenge_malformed" });
    });

    it("honors MANAGED_UPLOAD_AUTH_DISABLED only when explicitly enabled", async () => {
        await withEnv({ MANAGED_UPLOAD_AUTH_DISABLED: undefined }, () => {
            expect(managedUploadAuthDisabled()).toBe(false);
        });
        await withEnv({ MANAGED_UPLOAD_AUTH_DISABLED: "true" }, () => {
            expect(managedUploadAuthDisabled()).toBe(true);
        });
        await withEnv({ MANAGED_UPLOAD_AUTH_DISABLED: "0" }, () => {
            expect(managedUploadAuthDisabled()).toBe(false);
        });
    });

    it("does not leak signatures or private key material in thrown errors", async () => {
        const signature = "0xdeadbeef";
        const signMessage = vi.fn().mockRejectedValue(new Error(`wallet refused ${PRIVATE_KEY_FRAGMENT}`));
        const fetchImpl = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    challengeId: "challenge-99",
                    message: "sign-this",
                    expiresAt: "2026-01-01T00:05:00.000Z",
                }),
                { status: 200, headers: { "content-type": "application/json" } }
            )
        );
        const protection = createWalletManagedMetadataProtection({
            apiBaseUrl: "https://staging.agentory.xyz",
            fetchImpl,
            signerAddress: SIGNER.address,
            signMessage,
        });
        let caught: unknown;
        try {
            await protection.apply(new Headers(), {
                contentHash: "d".repeat(64),
                chainId: 12227332,
                registry: "0x8004A856a396D08d31E597a867B1D8273901e641",
                agentId: 3n,
            });
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(ManagedMetadataError);
        const message = (caught as Error).message;
        expect(message).not.toContain(signature);
        expect(message).not.toContain(SIGNER.address);
        expect(message).not.toContain(PRIVATE_KEY_FRAGMENT);
    });
});
