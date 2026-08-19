import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  RetrievedObject,
  StorableFile,
  StorageProvider,
  StoredObject,
} from './storage-provider.interface';

export interface S3Options {
  bucket: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

const MISSING_SDK =
  'STORAGE_PROVIDER=s3 requires the AWS SDK. Install it with: ' +
  'npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner --workspace=@orgflow/api';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */

/**
 * S3 backend. The AWS SDK is resolved lazily so deployments that use local or
 * Cloudinary storage do not have to carry the dependency.
 */
export class S3StorageProvider implements StorageProvider {
  readonly name = 's3';
  private client: any;

  constructor(private readonly options: S3Options) {}

  private getSdk(): { client: any; lib: any } {
    let lib: any;
    try {
      lib = require('@aws-sdk/client-s3');
    } catch {
      throw new Error(MISSING_SDK);
    }
    if (!this.client) {
      this.client = new lib.S3Client({
        region: this.options.region,
        ...(this.options.accessKeyId && this.options.secretAccessKey
          ? {
              credentials: {
                accessKeyId: this.options.accessKeyId,
                secretAccessKey: this.options.secretAccessKey,
              },
            }
          : {}),
      });
    }
    return { client: this.client, lib };
  }

  async save(file: StorableFile, keyPrefix: string): Promise<StoredObject> {
    const { client, lib } = this.getSdk();
    const storageKey = keyPrefix + '/' + randomUUID() + extname(file.originalName).toLowerCase();
    await client.send(
      new lib.PutObjectCommand({
        Bucket: this.options.bucket,
        Key: storageKey,
        Body: file.buffer,
        ContentType: file.mimeType,
        ServerSideEncryption: 'AES256',
      }),
    );
    return {
      storageKey,
      provider: this.name,
      sizeBytes: file.size,
      checksum: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }

  async read(storageKey: string): Promise<RetrievedObject> {
    const { client, lib } = this.getSdk();
    const result = await client.send(
      new lib.GetObjectCommand({ Bucket: this.options.bucket, Key: storageKey }),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of result.Body as AsyncIterable<Buffer>) chunks.push(chunk);
    return { buffer: Buffer.concat(chunks), mimeType: result.ContentType };
  }

  async delete(storageKey: string): Promise<void> {
    const { client, lib } = this.getSdk();
    await client.send(new lib.DeleteObjectCommand({ Bucket: this.options.bucket, Key: storageKey }));
  }

  async getSignedUrl(storageKey: string, expiresInSeconds = 300): Promise<string | null> {
    const { client, lib } = this.getSdk();
    let presigner: any;
    try {
      presigner = require('@aws-sdk/s3-request-presigner');
    } catch {
      return null;
    }
    return presigner.getSignedUrl(
      client,
      new lib.GetObjectCommand({ Bucket: this.options.bucket, Key: storageKey }),
      { expiresIn: expiresInSeconds },
    );
  }
}
