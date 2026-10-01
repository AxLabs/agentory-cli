/**
 * Provider-neutral escape hatch. The CLI does not upload, fetch, or rewrite the document.
 * Richer target validation lives with the user-provided URI registration path.
 */
export class UserUriMetadataStorage {
    backend = "uri";
    metadataUri;
    constructor(metadataUri) {
        const uri = metadataUri.trim();
        if (!uri || /\s/.test(uri)) {
            throw new Error("metadataUri is required when metadataStorage is \"uri\". Provide the registration URI you already host.");
        }
        this.metadataUri = uri;
    }
    async publish(_input) {
        return {
            backend: "uri",
            uri: this.metadataUri,
        };
    }
}
