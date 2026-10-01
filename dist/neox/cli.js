import { NEOX_T4_FAUCET_URL, NEOX_T4_IDENTITY_REGISTRY, NEOX_T4_NATIVE_CURRENCY, explorerAddressUrl, } from "./constants.js";
import { accountFromPrivateKey, createNeoxPublicClient, createNeoxWalletClient, loadPrivateKeyFromEnv, resolveRuntimeConfig, } from "./config.js";
import { formatPreflight, runPreflight } from "./preflight.js";
import { canReuseMetadataPublication, registerOrResume } from "./register.js";
import { buildSecretFreeResult, writeSecretFreeResult } from "./result.js";
import { hasMinted, isComplete, loadState, persistVerified } from "./state.js";
import { buildRegistrationMetadata, encodeMetadataDataUri, parseAgentId } from "./metadata.js";
import { verifyOnChain } from "./verify.js";
import { discoverRegistryLogs } from "./discover.js";
import { createMetadataStorage, metadataBackend, uriForStoragePreflight, } from "./storage/index.js";
export function parseNeoxCliCommand(argv = process.argv.slice(2)) {
    const raw = argv.find((arg) => !arg.startsWith("-")) ?? "register";
    if (raw === "preflight" ||
        raw === "dry-run" ||
        raw === "register" ||
        raw === "verify" ||
        raw === "logs") {
        return raw;
    }
    throw new Error(`Unknown command "${raw}". Use preflight, dry-run, register, verify, or logs.`);
}
export async function runNeoxRegistrationCli(config, argv = process.argv.slice(2)) {
    const command = parseNeoxCliCommand(argv);
    const runtime = resolveRuntimeConfig({
        rpcUrl: config.rpcUrl,
        registry: config.registry,
        chainId: config.chainId,
    });
    const projectDir = process.cwd();
    const privateKey = loadPrivateKeyFromEnv();
    const account = accountFromPrivateKey(privateKey);
    const publicClient = createNeoxPublicClient(runtime.rpcUrl);
    const walletClient = createNeoxWalletClient(runtime.rpcUrl, account);
    const registry = runtime.registry ?? NEOX_T4_IDENTITY_REGISTRY;
    let state = loadState(projectDir, config.projectId, registry);
    const backend = metadataBackend(config);
    const intendedMetadata = hasMinted(state)
        ? buildRegistrationMetadata(config, parseAgentId(state.agentId), registry)
        : undefined;
    const needsPublication = !isComplete(state) &&
        (!intendedMetadata ||
            !canReuseMetadataPublication(state, intendedMetadata, backend, backend === "uri" ? config.metadataUri : undefined));
    // Preflight validates selected storage without uploading. Registration validates
    // before minting, while completed or matching resumable publications need no upload credentials.
    const storagePreflightUri = command === "preflight" || command === "dry-run" || (command === "register" && needsPublication)
        ? uriForStoragePreflight(config)
        : undefined;
    const uriForEstimate = hasMinted(state)
        ? canReuseMetadataPublication(state, intendedMetadata, backend, backend === "uri" ? config.metadataUri : undefined)
            ? state.agentURI
            : storagePreflightUri ?? encodeMetadataDataUri(intendedMetadata)
        : undefined;
    if (command === "preflight" || command === "dry-run") {
        const report = await runPreflight({
            client: publicClient,
            registry,
            signer: account.address,
            state,
            uriForEstimate,
        });
        console.log(formatPreflight(report));
        console.log("");
        console.log(`Fund ${NEOX_T4_NATIVE_CURRENCY.symbol} if needed: ${NEOX_T4_FAUCET_URL}`);
        console.log(`Signer: ${explorerAddressUrl(account.address)}`);
        return;
    }
    if (command === "logs") {
        if (!state.registerBlockNumber && !state.setUriBlockNumber) {
            throw new Error("No receipt block numbers in state. Register first.");
        }
        const fromBlock = BigInt(state.registerBlockNumber ?? state.setUriBlockNumber ?? "0");
        const toBlock = BigInt(state.setUriBlockNumber ?? state.registerBlockNumber ?? "0");
        const discovered = await discoverRegistryLogs({
            client: publicClient,
            registry,
            fromBlock,
            toBlock,
        });
        console.log(JSON.stringify({ fromBlock: fromBlock.toString(10), toBlock: toBlock.toString(10), discovered }, null, 2));
        return;
    }
    if (command === "register") {
        state = await registerOrResume({
            publicClient,
            walletClient,
            signer: account.address,
            registry,
            projectDir,
            config,
            storage: needsPublication ? createMetadataStorage(config) : undefined,
        }, state);
    }
    if (command === "verify" && !hasMinted(state)) {
        throw new Error("Nothing to verify yet. Run register first.");
    }
    if (command === "register" || command === "verify") {
        if (!hasMinted(state)) {
            return;
        }
        const verification = await verifyOnChain({
            client: publicClient,
            registry,
            state,
            config,
            expectedOwner: account.address,
        });
        state = persistVerified(projectDir, state, verification.agentWallet);
        const resultPath = writeSecretFreeResult(projectDir, buildSecretFreeResult(state, verification));
        console.log("");
        console.log(`Verified agentId ${verification.agentId}`);
        console.log(`  owner:        ${verification.owner}`);
        console.log(`  agentWallet:  ${verification.agentWallet}`);
        console.log(`  metadata:     ${state.metadataStorage?.backend ?? backend}`);
        if (!verification.decodedMetadata) {
            console.log("  metadata:     URI verified on-chain; contents were not fetched");
        }
        else {
            console.log(`  services:     ${verification.decodedMetadata.services.length} declared`);
            for (const service of verification.decodedMetadata.services) {
                const extras = [
                    service.version ? `v${service.version}` : null,
                    service.skills?.length ? `${service.skills.length} skill(s)` : null,
                    service.domains?.length ? `${service.domains.length} domain(s)` : null,
                ]
                    .filter(Boolean)
                    .join(", ");
                console.log(`    - ${service.name}: ${service.endpoint}${extras ? ` (${extras})` : ""}`);
            }
        }
        console.log(`  result:       ${resultPath}`);
    }
}
