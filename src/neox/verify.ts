import { getAddress, type Address, type PublicClient } from "viem";
import { IDENTITY_REGISTRY_ABI } from "./abi.js";
import {
    buildRegistrationMetadata,
    decodeMetadataDataUri,
    metadataEquals,
    parseAgentId,
    registrationRefMatches,
} from "./metadata.js";
import { servicesMetadataEquals } from "./services.js";
import type { AgentProjectConfig, RegistrationState, VerificationResult } from "./types.js";
import { neofsObjectReadUrl } from "./storage/neofs-uri.js";
import { readHttpMetadata } from "./storage/neofs.js";
import type { FetchLike } from "./storage/types.js";

export async function verifyOnChain(args: {
    client: PublicClient;
    registry: Address;
    state: RegistrationState;
    config: AgentProjectConfig;
    expectedOwner: Address;
    fetchImpl?: FetchLike;
    neofsPublicGateway?: string;
}): Promise<VerificationResult> {
    if (args.state.agentId === undefined) {
        throw new Error("Cannot verify before minting an agentId");
    }
    const agentId = parseAgentId(args.state.agentId);

    const [owner, tokenURI, agentWallet] = await Promise.all([
        args.client.readContract({
            address: args.registry,
            abi: IDENTITY_REGISTRY_ABI,
            functionName: "ownerOf",
            args: [agentId],
        }) as Promise<Address>,
        args.client.readContract({
            address: args.registry,
            abi: IDENTITY_REGISTRY_ABI,
            functionName: "tokenURI",
            args: [agentId],
        }) as Promise<string>,
        args.client.readContract({
            address: args.registry,
            abi: IDENTITY_REGISTRY_ABI,
            functionName: "getAgentWallet",
            args: [agentId],
        }) as Promise<Address>,
    ]);

    if (getAddress(owner) !== getAddress(args.expectedOwner)) {
        throw new Error(`ownerOf(${args.state.agentId}) is ${owner}, expected ${args.expectedOwner}`);
    }

    const userSuppliedUri =
        args.state.metadataStorage?.backend === "uri" || args.config.metadataStorage === "uri";
    if (userSuppliedUri) {
        const expectedUri = args.state.agentURI ?? args.config.metadataUri;
        if (!expectedUri || tokenURI !== expectedUri) {
            throw new Error("On-chain tokenURI does not match the user-supplied registration metadata URI");
        }
        return {
            agentId: args.state.agentId,
            owner,
            agentWallet,
            tokenURI,
            metadataStorage: args.state.metadataStorage ?? { backend: "uri", uri: tokenURI },
            expectedServices: args.config.services ?? [],
        };
    }

    const decodedMetadata = tokenURI.startsWith("data:")
        ? decodeMetadataDataUri(tokenURI)
        : await readHttpMetadata(
              tokenURI.startsWith("neofs:")
                  ? neofsObjectReadUrl(tokenURI, args.neofsPublicGateway)
                  : tokenURI,
              args.fetchImpl
          );
    const expected = buildRegistrationMetadata(
        args.config,
        agentId,
        args.registry,
        args.state.chainId
    );
    const expectedServices = expected.services;
    const servicesMatch = servicesMetadataEquals(decodedMetadata.services, expectedServices);
    const metadataMatches = metadataEquals(decodedMetadata, expected);
    const registrationRefMatchesResult = registrationRefMatches(
        decodedMetadata,
        agentId,
        args.registry
    );

    if (!metadataMatches) {
        throw new Error("On-chain tokenURI metadata does not match current canonical project metadata");
    }
    if (!servicesMatch) {
        throw new Error("On-chain metadata services do not match src/agent-config.ts declarations");
    }
    if (!registrationRefMatchesResult) {
        throw new Error("On-chain metadata is missing the exact eip155 registration reference");
    }
    if (args.state.agentURI && tokenURI !== args.state.agentURI) {
        throw new Error("On-chain tokenURI does not match the URI written during setAgentURI");
    }

    return {
        agentId: args.state.agentId,
        owner,
        agentWallet,
        tokenURI,
        decodedMetadata,
        metadataMatches,
        registrationRefMatches: registrationRefMatchesResult,
        metadataStorage: args.state.metadataStorage ?? {
            backend: tokenURI.startsWith("data:")
                ? "inline"
                : tokenURI.startsWith("neofs:")
                    ? "managed"
                    : "neofs",
            uri: tokenURI,
        },
        servicesMatch,
        expectedServices,
    };
}
