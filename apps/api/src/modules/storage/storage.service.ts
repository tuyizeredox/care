import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CloudinaryStorageProvider } from './providers/cloudinary-storage.provider';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';
import {
  RetrievedObject,
  StorableFile,
  StorageProvider,
  StoredObject,
} from './providers/storage-provider.interface';

/**
 * Facade over the configured storage backend. Application code never knows
 * whether a file lives on disk, in S3 or in Cloudinary.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly provider: StorageProvider;
  private readonly localPath: string;

  constructor(private readonly config: ConfigService) {
    const providerName = this.config.get<string>('storage.provider') ?? 'local';
    this.localPath = this.config.get<string>('storage.localPath') ?? './uploads';

    switch (providerName) {
      case 's3':
        this.provider = new S3StorageProvider({
          bucket: this.config.get<string>('storage.aws.bucket') ?? '',
          region: this.config.get<string>('storage.aws.region') ?? 'eu-west-1',
          accessKeyId: this.config.get<string>('storage.aws.accessKeyId'),
          secretAccessKey: this.config.get<string>('storage.aws.secretAccessKey'),
        });
        break;
      case 'cloudinary':
        this.provider = new CloudinaryStorageProvider({
          cloudName: this.config.get<string>('storage.cloudinary.cloudName') ?? '',
          apiKey: this.config.get<string>('storage.cloudinary.apiKey') ?? '',
          apiSecret: this.config.get<string>('storage.cloudinary.apiSecret') ?? '',
        });
        break;
      default:
        this.provider = new LocalStorageProvider(this.localPath);
    }
  }

  async onModuleInit(): Promise<void> {
    if (this.provider.name === 'local') {
      await mkdir(resolve(this.localPath), { recursive: true });
    }
    this.logger.log('File storage provider: ' + this.provider.name);
  }

  get providerName(): string {
    return this.provider.name;
  }

  get maxUploadBytes(): number {
    return this.config.get<number>('storage.maxUploadBytes') ?? 25 * 1024 * 1024;
  }

  save(file: StorableFile, keyPrefix = 'tasks'): Promise<StoredObject> {
    return this.provider.save(file, keyPrefix);
  }

  read(storageKey: string): Promise<RetrievedObject> {
    return this.provider.read(storageKey);
  }

  delete(storageKey: string): Promise<void> {
    return this.provider.delete(storageKey);
  }

  getSignedUrl(storageKey: string, expiresInSeconds?: number): Promise<string | null> {
    return this.provider.getSignedUrl(storageKey, expiresInSeconds);
  }
}
