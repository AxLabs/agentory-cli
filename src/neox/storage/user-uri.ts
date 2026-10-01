import { assertRegistrationMetadataUri } from "../metadata.js";
import type { PublishedMetadata } from "../types.js";
import type { MetadataStorage, PublishMetadataInput } from "./types.js";

/**
 * Provider-neutral escape hatch. The CLI does not upload, fetch, or rewrite the document.
 * Richer target validation lives with the user-provided URI registration path.
 */
export class UserUriMetadataStorage implements MetadataStorage {
    readonly backend = "uri" as const;

    private readonly metadataUri: string;

    constructor(metadataUri: string) {
        this.metadataUri = assertRegistrationMetadataUri(metadataUri);
    }

    async publish(_input: PublishMetadataInput): Promise<PublishedMetadata> {
        return {
            backend: "uri",
            uri: this.metadataUri,
        };
    }
}
