import { assertRegistrationMetadataUri } from "../metadata.js";
import type { MetadataStorage } from "./types.js";

/** Acquires an already-hosted URI without uploading, fetching, or rewriting it. */
export class UserProvidedMetadataStorage implements MetadataStorage {
    readonly backend = "external" as const;
    readonly uri: string;

    constructor(uri: string) {
        this.uri = assertRegistrationMetadataUri(uri);
    }

    async publish() {
        return {
            uri: this.uri,
            backend: this.backend,
        };
    }
}
