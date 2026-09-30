import { getAddress } from "viem";
import { IDENTITY_REGISTRY_ABI } from "./abi.js";
import { buildRegistrationMetadata, decodeMetadataDataUri, metadataEquals, parseAgentId, registrationRefMatches, } from "./metadata.js";
import { servicesMetadataEquals } from "./services.js";
import { readHttpMetadata } from "./storage/neofs.js";
export async function verifyOnChain(args) {
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
        }),
        args.client.readContract({
            address: args.registry,
            abi: IDENTITY_REGISTRY_ABI,
            functionName: "tokenURI",
            args: [agentId],
        }),
        args.client.readContract({
            address: args.registry,
            abi: IDENTITY_REGISTRY_ABI,
            functionName: "getAgentWallet",
            args: [agentId],
        }),
    ]);
    if (getAddress(owner) !== getAddress(args.expectedOwner)) {
        throw new Error(`ownerOf(${args.state.agentId}) is ${owner}, expected ${args.expectedOwner}`);
    }
    if (args.state.agentURI && tokenURI !== args.state.agentURI) {
        throw new Error("On-chain tokenURI does not match the URI written during setAgentURI");
    }
    if (args.state.metadataStorage?.backend === "external") {
        return {
            agentId: args.state.agentId,
            owner,
            agentWallet,
            tokenURI,
            metadataStorage: args.state.metadataStorage,
            expectedServices: args.config.services ?? [],
        };
    }
    const decodedMetadata = tokenURI.startsWith("data:")
        ? decodeMetadataDataUri(tokenURI)
        : await readHttpMetadata(tokenURI, args.fetchImpl);
    const expected = buildRegistrationMetadata(args.config, agentId, args.registry, args.state.chainId);
    const expectedServices = expected.services;
    const servicesMatch = servicesMetadataEquals(decodedMetadata.services, expectedServices);
    const metadataMatches = metadataEquals(decodedMetadata, expected);
    const registrationRefMatchesResult = registrationRefMatches(decodedMetadata, agentId, args.registry);
    if (!metadataMatches) {
        throw new Error("On-chain tokenURI metadata does not match current canonical project metadata");
    }
    if (!servicesMatch) {
        throw new Error("On-chain metadata services do not match src/agent-config.ts declarations");
    }
    if (!registrationRefMatchesResult) {
        throw new Error("On-chain metadata is missing the exact eip155 registration reference");
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
            backend: tokenURI.startsWith("data:") ? "inline" : "neofs",
            uri: tokenURI,
        },
        servicesMatch,
        expectedServices,
    };
}
