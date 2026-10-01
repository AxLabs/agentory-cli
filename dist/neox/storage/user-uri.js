import { assertRegistrationMetadataUri } from "../metadata.js";
/**
 * Provider-neutral escape hatch. The CLI does not upload, fetch, or rewrite the document.
 * Richer target validation lives with the user-provided URI registration path.
 */
export class UserUriMetadataStorage {
    backend = "uri";
    metadataUri;
    constructor(metadataUri) {
        this.metadataUri = assertRegistrationMetadataUri(metadataUri);
    }
    async publish(_input) {
        return {
            backend: "uri",
            uri: this.metadataUri,
        };
    }
}
