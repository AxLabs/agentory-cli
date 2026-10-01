import type { AgentProjectConfig, AgentRegistrationMetadata } from "./types.js";
export declare function agentIdToDecimalString(agentId: bigint): string;
export declare function parseAgentId(value: string | number | bigint): bigint;
/**
 * JSON metadata uses a JSON number when the id is a safe integer (spec examples use numbers).
 * Callers must keep bigint/decimal-string forms for on-chain and exported state.
 */
export declare function agentIdForMetadataJson(agentId: bigint): number | string;
export declare function buildRegistrationMetadata(config: Pick<AgentProjectConfig, "name" | "description" | "image" | "services">, agentId: bigint, registry: string, chainId?: number): AgentRegistrationMetadata;
export declare function encodeMetadataDataUri(metadata: AgentRegistrationMetadata): string;
export declare function decodeMetadataDataUri(uri: string): AgentRegistrationMetadata;
export declare function metadataEquals(actual: AgentRegistrationMetadata, expected: AgentRegistrationMetadata): boolean;
/** Identity of the exact JSON document sent to managed storage. */
export declare function metadataContentHash(metadata: AgentRegistrationMetadata): string;
export declare function registrationRefMatches(metadata: AgentRegistrationMetadata, agentId: bigint, registry: string, chainId?: number): boolean;
