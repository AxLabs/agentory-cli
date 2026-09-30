import type { MetadataStorage } from "./types.js";
/** Acquires an already-hosted URI without uploading, fetching, or rewriting it. */
export declare class UserProvidedMetadataStorage implements MetadataStorage {
    readonly backend: "external";
    readonly uri: string;
    constructor(uri: string);
    publish(): Promise<{
        uri: string;
        backend: "external";
    }>;
}
