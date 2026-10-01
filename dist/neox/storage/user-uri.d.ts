import type { PublishedMetadata } from "../types.js";
import type { MetadataStorage, PublishMetadataInput } from "./types.js";
/**
 * Provider-neutral escape hatch. The CLI does not upload, fetch, or rewrite the document.
 * Richer target validation lives with the user-provided URI registration path.
 */
export declare class UserUriMetadataStorage implements MetadataStorage {
    readonly backend: "uri";
    private readonly metadataUri;
    constructor(metadataUri: string);
    publish(_input: PublishMetadataInput): Promise<PublishedMetadata>;
}
