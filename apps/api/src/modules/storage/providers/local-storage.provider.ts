import { Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import {
  RetrievedObject,
  StorableFile,
  StorageProvider,
  StoredObject,
} from './storage-provider.interface';

/**
 * Development / single-node backend. Files are written under
 * `STORAGE_LOCAL_PATH` with a generated key, so the original file name can
 * never influence the path on disk.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly root: string;

  constructor(rootPath: string) {
    this.root = resolve(rootPath);
  }

  async save(file: StorableFile, keyPrefix: string): Promise<StoredObject> {
    const extension = extname(file.originalName).toLowerCase();
    const storageKey = keyPrefix + '/' + randomUUID() + extension;
    const absolute = this.resolveKey(storageKey);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, file.buffer);
    return {
      storageKey,
      provider: this.name,
      sizeBytes: file.size,
      checksum: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }

  async read(storageKey: string): Promise<RetrievedObject> {
    return { buffer: await readFile(this.resolveKey(storageKey)) };
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await unlink(this.resolveKey(storageKey));
    } catch (error) {
      this.logger.warn('Could not delete ' + storageKey + ': ' + (error as Error).message);
    }
  }

  async getSignedUrl(): Promise<string | null> {
    // Local files are streamed through the authenticated download endpoint.
    return null;
  }

  /** Blocks path traversal: the resolved path must stay inside the root. */
  private resolveKey(storageKey: string): string {
    const absolute = resolve(join(this.root, storageKey));
    if (absolute !== this.root && !absolute.startsWith(this.root + sep)) {
      throw new Error('Invalid storage key');
    }
    return absolute;
  }
}
