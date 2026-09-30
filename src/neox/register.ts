import type { Address, Hex, PublicClient, TransactionReceipt, WalletClient } from "viem";
import { IDENTITY_REGISTRY_ABI } from "./abi.js";
import { explorerTxUrl } from "./constants.js";
import { decodeRegisteredFromReceipt, decodeURIUpdatedFromReceipt, hasAgentId } from "./events.js";
import { getNeoxFees } from "./fees.js";
import {
    buildRegistrationMetadata,
    decodeMetadataDataUri,
    metadataEquals,
    parseAgentId,
} from "./metadata.js";
import { formatPreflight, runPreflight } from "./preflight.js";
import {
    hasMinted,
    isComplete,
    persistMinted,
    persistMetadataPublished,
    persistPendingTx,
    persistRevertedPending,
    persistUriSet,
} from "./state.js";
import type {
    AgentProjectConfig,
    AgentRegistrationMetadata,
    MetadataStorageBackend,
    RegistrationState,
} from "./types.js";
import { InlineMetadataStorage } from "./storage/inline.js";
import type { MetadataStorage } from "./storage/types.js";

export interface RegisterDeps {
    publicClient: PublicClient;
    walletClient: WalletClient;
    signer: Address;
    registry: Address;
    projectDir: string;
    config: AgentProjectConfig;
    storage?: MetadataStorage;
}

export function canReuseMetadataPublication(
    state: RegistrationState,
    metadata: AgentRegistrationMetadata,
    configuredBackend: MetadataStorageBackend,
    configuredAgentURI?: string
): boolean {
    if (
        !state.metadata ||
        !state.metadataStorage ||
        !state.agentURI ||
        state.metadataStorage.backend !== configuredBackend ||
        state.metadataStorage.uri !== state.agentURI ||
        !metadataEquals(state.metadata, metadata)
    ) {
        return false;
    }

    if (configuredBackend === "external") {
        return state.agentURI === configuredAgentURI;
    }

    if (state.metadataStorage.backend === "inline") {
        try {
            return metadataEquals(decodeMetadataDataUri(state.agentURI), metadata);
        } catch {
            return false;
        }
    }

    return true;
}

function storageForPublication(deps: RegisterDeps): MetadataStorage {
    const configuredBackend = deps.config.metadataStorage ?? "inline";
    if (deps.storage && deps.storage.backend !== configuredBackend) {
        throw new Error(
            `Configured metadataStorage is "${configuredBackend}", but the provided storage backend is "${deps.storage.backend}"`
        );
    }
    if (configuredBackend === "neofs" && !deps.storage) {
        throw new Error(
            "NeoFS metadata storage dependency is required when metadataStorage is \"neofs\""
        );
    }
    if (configuredBackend === "external" && !deps.storage) {
        throw new Error(
            "User-provided metadata URI dependency is required when metadataStorage is \"external\""
        );
    }
    return deps.storage ?? new InlineMetadataStorage();
}

async function waitForReceipt(
    publicClient: PublicClient,
    hash: Hex
): Promise<TransactionReceipt> {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === "reverted") {
        throw new Error(`Transaction ${hash} reverted`);
    }
    return receipt;
}

export async function reconcilePending(
    deps: RegisterDeps,
    state: RegistrationState
): Promise<RegistrationState> {
    if (!state.pendingTxHash || !state.pendingKind) return state;

    const hash = state.pendingTxHash;
    let receipt: TransactionReceipt | null = null;
    try {
        receipt = await deps.publicClient.getTransactionReceipt({ hash });
    } catch {
        receipt = null;
    }

    if (!receipt) {
        const tx = await deps.publicClient.getTransaction({ hash }).catch(() => null);
        if (tx) {
            receipt = await deps.publicClient.waitForTransactionReceipt({ hash });
        } else {
            throw new Error(
                `Pending ${state.pendingKind} transaction ${hash} was not found. Inspect the hash on the explorer before retrying.`
            );
        }
    }

    if (receipt.status === "reverted") {
        console.log(`  Pending ${state.pendingKind} transaction ${hash} reverted; retrying safely.`);
        return persistRevertedPending(deps.projectDir, state);
    }

    if (state.pendingKind === "register") {
        const registered = decodeRegisteredFromReceipt(receipt, deps.registry);
        return persistMinted(deps.projectDir, state, {
            agentId: registered.agentIdDecimal,
            owner: registered.owner,
            receipt,
        });
    }

    const agentId = parseAgentId(state.agentId ?? "0");
    const updated = decodeURIUpdatedFromReceipt(receipt, deps.registry, agentId);
    const intendedMetadata = buildRegistrationMetadata(deps.config, agentId, deps.registry);
    const publicationIsCurrent = canReuseMetadataPublication(
        { ...state, agentURI: updated.newURI },
        intendedMetadata,
        deps.config.metadataStorage ?? "inline",
        deps.config.agentURI
    );
    return persistUriSet(deps.projectDir, state, {
        agentURI: updated.newURI,
        receipt,
        metadata: state.metadata,
        complete: publicationIsCurrent,
    });
}

async function broadcastRegister(deps: RegisterDeps, state: RegistrationState): Promise<RegistrationState> {
    const fees = await getNeoxFees(deps.publicClient);
    const hash = await deps.walletClient.writeContract({
        address: deps.registry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "register",
        args: [],
        account: deps.walletClient.account ?? deps.signer,
        chain: deps.walletClient.chain,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    });
    const pending = persistPendingTx(deps.projectDir, state, "register", hash);
    console.log(`  Broadcast register(): ${hash}`);
    console.log(`  ${explorerTxUrl(hash)}`);
    const receipt = await waitForReceipt(deps.publicClient, hash);
    const registered = decodeRegisteredFromReceipt(receipt, deps.registry);
    console.log(`  Minted agentId ${registered.agentIdDecimal} (agent ID 0 is valid)`);
    return persistMinted(deps.projectDir, pending, {
        agentId: registered.agentIdDecimal,
        owner: registered.owner,
        receipt,
    });
}

async function broadcastSetUri(
    deps: RegisterDeps,
    state: RegistrationState
): Promise<RegistrationState> {
    if (!hasAgentId(state.agentId)) {
        throw new Error("Cannot publish metadata without a minted agentId");
    }
    const agentId = parseAgentId(state.agentId);
    if (!state.metadata || !state.metadataStorage || !state.agentURI) {
        throw new Error("Cannot set agentURI before metadata has been published");
    }
    const metadata = state.metadata;
    const uri = state.agentURI;
    const fees = await getNeoxFees(deps.publicClient);
    const hash = await deps.walletClient.writeContract({
        address: deps.registry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "setAgentURI",
        args: [agentId, uri],
        account: deps.walletClient.account ?? deps.signer,
        chain: deps.walletClient.chain,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    });
    const pending = persistPendingTx(deps.projectDir, { ...state, metadata, agentURI: uri }, "setAgentURI", hash);
    console.log(`  Broadcast setAgentURI(${state.agentId}): ${hash}`);
    console.log(`  ${explorerTxUrl(hash)}`);
    const receipt = await waitForReceipt(deps.publicClient, hash);
    decodeURIUpdatedFromReceipt(receipt, deps.registry, agentId);
    return persistUriSet(deps.projectDir, pending, {
        agentURI: uri,
        receipt,
        metadata,
    });
}

export async function registerOrResume(deps: RegisterDeps, state: RegistrationState): Promise<RegistrationState> {
    let current = await reconcilePending(deps, state);
    let metadata = hasMinted(current)
        ? buildRegistrationMetadata(deps.config, parseAgentId(current.agentId!), deps.registry)
        : undefined;

    if (isComplete(current)) {
        if (
            !metadata ||
            !canReuseMetadataPublication(
                current,
                metadata,
                deps.config.metadataStorage ?? "inline",
                deps.config.agentURI
            )
        ) {
            throw new Error(
                `Registration is already complete for agentId ${current.agentId}, but current canonical metadata differs from the published URI. This command does not update completed registrations.`
            );
        }
        console.log(
            `Registration already complete for agentId ${current.agentId}. Refusing to mint another identity.`
        );
        return current;
    }

    if (!hasMinted(current) && deps.config.metadataStorage !== undefined && deps.config.metadataStorage !== "inline") {
        storageForPublication(deps);
    }

    if (!hasMinted(current)) {
        const report = await runPreflight({
            client: deps.publicClient,
            registry: deps.registry,
            signer: deps.signer,
            state: current,
        });
        console.log(formatPreflight(report));
        if (report.balanceWei === 0n) {
            throw new Error(
                `Signer ${deps.signer} has 0 GAS on Neo X T4. Fund it before registering.`
            );
        }
        current = await broadcastRegister(deps, current);
        metadata = buildRegistrationMetadata(
            deps.config,
            parseAgentId(current.agentId!),
            deps.registry
        );
    } else {
        console.log(`Resuming metadata publication for agentId ${current.agentId}`);
    }

    if (!isComplete(current)) {
        const agentId = parseAgentId(current.agentId!);
        metadata ??= buildRegistrationMetadata(deps.config, agentId, deps.registry);
        if (
            !canReuseMetadataPublication(
                current,
                metadata,
                deps.config.metadataStorage ?? "inline",
                deps.config.agentURI
            )
        ) {
            const storage = storageForPublication(deps);
            const publication = await storage.publish({
                metadata,
                projectId: deps.config.projectId,
                agentId,
                chainId: current.chainId,
                registry: deps.registry,
            });
            current = persistMetadataPublished(deps.projectDir, current, metadata, publication);
            console.log(`  Published metadata using ${publication.backend}: ${publication.uri}`);
        }

        const report = await runPreflight({
            client: deps.publicClient,
            registry: deps.registry,
            signer: deps.signer,
            state: current,
            uriForEstimate: current.agentURI,
        });
        console.log(formatPreflight(report));
        if (report.balanceWei === 0n) {
            throw new Error(
                `Signer ${deps.signer} has 0 GAS on Neo X T4. Fund it before registering.`
            );
        }
        current = await broadcastSetUri(deps, current);
    }

    return current;
}
