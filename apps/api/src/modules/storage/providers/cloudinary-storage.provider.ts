import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  RetrievedObject,
  StorableFile,
  StorageProvider,
  StoredObject,
} from './storage-provider.interface';

export interface CloudinaryOptions {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

const MISSING_SDK =
  'STORAGE_PROVIDER=cloudinary requires the Cloudinary SDK. Install it with: ' +
  'npm i cloudinary --workspace=@orgflow/api';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */

/** Cloudinary backend. SDK resolved lazily, as with S3. */
export class CloudinaryStorageProvider implements StorageProvider {
  readonly name = 'cloudinary';
  private configured = false;

  constructor(private readonly options: CloudinaryOptions) {}

  private getSdk(): any {
    let sdk: any;
    try {
      sdk = require('cloudinary').v2;
    } catch {
      throw new Error(MISSING_SDK);
    }
    if (!this.configured) {
      sdk.config({
        cloud_name: this.options.cloudName,
        api_key: this.options.apiKey,
        api_secret: this.options.apiSecret,
        secure: true,
      });
      this.configured = true;
    }
    return sdk;
  }

  async save(file: StorableFile, keyPrefix: string): Promise<StoredObject> {
    const sdk = this.getSdk();
    const publicId = keyPrefix + '/' + randomUUID();
    const dataUri = 'data:' + file.mimeType + ';base64,' + file.buffer.toString('base64');
    const uploaded = await sdk.uploader.upload(dataUri, {
      public_id: publicId,
      resource_type: 'auto',
      type: 'authenticated',
      filename_override: file.originalName,
    });
    const format = uploaded.format ?? extname(file.originalName).replace('.', '');
    return {
      storageKey: uploaded.public_id + (format ? '.' + format : ''),
      provider: this.name,
      sizeBytes: file.size,
      checksum: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }

  async read(storageKey: string): Promise<RetrievedObject> {
    const url = await this.getSignedUrl(storageKey);
    if (!url) throw new Error('Unable to resolve the stored file.');
    const response = await fetch(url);
    if (!response.ok) throw new Error('Unable to retrieve the stored file.');
    return { buffer: Buffer.from(await response.arrayBuffer()) };
  }

  async delete(storageKey: string): Promise<void> {
    const sdk = this.getSdk();
    await sdk.uploader.destroy(storageKey.replace(/\.[^.]+$/, ''), {
      resource_type: 'raw',
      type: 'authenticated',
    });
  }

  async getSignedUrl(storageKey: string, expiresInSeconds = 300): Promise<string | null> {
    const sdk = this.getSdk();
    return sdk.url(storageKey, {
      sign_url: true,
      type: 'authenticated',
      expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
    });
  }
}
