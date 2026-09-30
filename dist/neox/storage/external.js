import { assertRegistrationMetadataUri } from "../metadata.js";
/** Acquires an already-hosted URI without uploading, fetching, or rewriting it. */
export class UserProvidedMetadataStorage {
    backend = "external";
    uri;
    constructor(uri) {
        this.uri = assertRegistrationMetadataUri(uri);
    }
    async publish() {
        return {
            uri: this.uri,
            backend: this.backend,
        };
    }
}
