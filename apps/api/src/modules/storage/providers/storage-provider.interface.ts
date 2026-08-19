/** A binary payload handed to a storage provider. */
export interface StorableFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface StoredObject {
  /** Provider-specific key/path. Never returned to the browser directly. */
  storageKey: string;
  provider: string;
  sizeBytes: number;
  checksum: string;
}

export interface RetrievedObject {
  buffer: Buffer;
  mimeType?: string;
}

/**
 * Contract every storage backend implements. Adding a new backend (Azure,
 * GCS, ...) means writing one class - nothing else in the codebase changes.
 */
export interface StorageProvider {
  readonly name: string;
  save(file: StorableFile, keyPrefix: string): Promise<StoredObject>;
  read(storageKey: string): Promise<RetrievedObject>;
  delete(storageKey: string): Promise<void>;
  /** Direct/signed URL when the provider supports one, otherwise null. */
  getSignedUrl(storageKey: string, expiresInSeconds?: number): Promise<string | null>;
}
