import { IDENTITY_REGISTRY_ABI } from "./abi.js";
import { explorerTxUrl } from "./constants.js";
import { decodeRegisteredFromReceipt, decodeURIUpdatedFromReceipt, hasAgentId } from "./events.js";
import { getNeoxFees } from "./fees.js";
import { buildRegistrationMetadata, decodeMetadataDataUri, metadataContentHash, metadataEquals, parseAgentId, } from "./metadata.js";
import { parseCanonicalNeofsAgentUri } from "./storage/neofs-uri.js";
import { formatPreflight, runPreflight } from "./preflight.js";
import { hasMinted, isComplete, persistMinted, persistMetadataPublished, persistPendingTx, persistRevertedPending, persistUriSet, } from "./state.js";
import { InlineMetadataStorage } from "./storage/inline.js";
export function canReuseMetadataPublication(state, metadata, configuredBackend, expectedUri) {
    if (!state.metadata ||
        !state.metadataStorage ||
        !state.agentURI ||
        state.metadataStorage.backend !== configuredBackend ||
        state.metadataStorage.uri !== state.agentURI ||
        !metadataEquals(state.metadata, metadata)) {
        return false;
    }
    if (configuredBackend === "uri" && state.agentURI !== expectedUri) {
        return false;
    }
    if (state.metadataStorage.backend === "inline") {
        try {
            return metadataEquals(decodeMetadataDataUri(state.agentURI), metadata);
        }
        catch {
            return false;
        }
    }
    if (state.metadataStorage.backend === "managed") {
        const parsed = parseCanonicalNeofsAgentUri(state.agentURI);
        return Boolean(parsed &&
            state.metadataStorage.containerId === parsed.containerId &&
            state.metadataStorage.objectId === parsed.objectId &&
            state.metadataStorage.contentHash === metadataContentHash(metadata) &&
            state.agentURI === `neofs:${parsed.containerId}/${parsed.objectId}`);
    }
    return true;
}
function configuredBackendOf(deps) {
    return deps.config.metadataStorage ?? "inline";
}
function expectedPublicationUri(deps) {
    return configuredBackendOf(deps) === "uri" ? deps.config.metadataUri : undefined;
}
function storageForPublication(deps) {
    const configuredBackend = configuredBackendOf(deps);
    if (deps.storage && deps.storage.backend !== configuredBackend) {
        throw new Error(`Configured metadataStorage is "${configuredBackend}", but the provided storage backend is "${deps.storage.backend}"`);
    }
    if (configuredBackend === "neofs" && !deps.storage) {
        throw new Error("NeoFS metadata storage dependency is required when metadataStorage is \"neofs\"");
    }
    if (configuredBackend === "managed" && !deps.storage) {
        throw new Error("Managed metadata storage is required when metadataStorage is \"managed\"");
    }
    if (configuredBackend === "uri" && !deps.storage) {
        throw new Error("A user-provided URI is required when metadataStorage is \"uri\"");
    }
    return deps.storage ?? new InlineMetadataStorage();
}
async function waitForReceipt(publicClient, hash) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === "reverted") {
        throw new Error(`Transaction ${hash} reverted`);
    }
    return receipt;
}
export async function reconcilePending(deps, state) {
    if (!state.pendingTxHash || !state.pendingKind)
        return state;
    const hash = state.pendingTxHash;
    let receipt = null;
    try {
        receipt = await deps.publicClient.getTransactionReceipt({ hash });
    }
    catch {
        receipt = null;
    }
    if (!receipt) {
        const tx = await deps.publicClient.getTransaction({ hash }).catch(() => null);
        if (tx) {
            receipt = await deps.publicClient.waitForTransactionReceipt({ hash });
        }
        else {
            throw new Error(`Pending ${state.pendingKind} transaction ${hash} was not found. Inspect the hash on the explorer before retrying.`);
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
    const publicationIsCurrent = canReuseMetadataPublication({ ...state, agentURI: updated.newURI }, intendedMetadata, configuredBackendOf(deps), expectedPublicationUri(deps));
    return persistUriSet(deps.projectDir, state, {
        agentURI: updated.newURI,
        receipt,
        metadata: state.metadata,
        complete: publicationIsCurrent,
    });
}
async function broadcastRegister(deps, state) {
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
async function broadcastSetUri(deps, state) {
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
export async function registerOrResume(deps, state) {
    let current = await reconcilePending(deps, state);
    let metadata = hasMinted(current)
        ? buildRegistrationMetadata(deps.config, parseAgentId(current.agentId), deps.registry)
        : undefined;
    if (isComplete(current)) {
        if (!metadata ||
            !canReuseMetadataPublication(current, metadata, configuredBackendOf(deps), expectedPublicationUri(deps))) {
            throw new Error(`Registration is already complete for agentId ${current.agentId}, but current canonical metadata differs from the published URI. This command does not update completed registrations.`);
        }
        console.log(`Registration already complete for agentId ${current.agentId}. Refusing to mint another identity.`);
        return current;
    }
    const publicationRequired = !isComplete(current) &&
        (!metadata ||
            !canReuseMetadataPublication(current, metadata, configuredBackendOf(deps), expectedPublicationUri(deps)));
    if (publicationRequired &&
        (deps.config.metadataStorage === "neofs" ||
            deps.config.metadataStorage === "managed" ||
            deps.config.metadataStorage === "uri")) {
        // Resolve storage before minting and before a resumed upload.
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
            throw new Error(`Signer ${deps.signer} has 0 GAS on Neo X T4. Fund it before registering.`);
        }
        current = await broadcastRegister(deps, current);
        metadata = buildRegistrationMetadata(deps.config, parseAgentId(current.agentId), deps.registry);
    }
    else {
        console.log(`Resuming metadata publication for agentId ${current.agentId}`);
    }
    if (!isComplete(current)) {
        const agentId = parseAgentId(current.agentId);
        metadata ??= buildRegistrationMetadata(deps.config, agentId, deps.registry);
        if (!canReuseMetadataPublication(current, metadata, configuredBackendOf(deps), expectedPublicationUri(deps))) {
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
            throw new Error(`Signer ${deps.signer} has 0 GAS on Neo X T4. Fund it before registering.`);
        }
        current = await broadcastSetUri(deps, current);
    }
    return current;
}
