/**
 * Typed application configuration, hydrated from environment variables.
 * Nothing in the codebase reads `process.env` directly except this file.
 */
export interface AppConfig {
  env: string;
  port: number;
  apiPrefix: string;
  appUrl: string;
  apiUrl: string;
  corsOrigins: string[];
  jwt: {
    secret: string;
    expiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  bcryptRounds: number;
  rateLimit: { ttl: number; max: number; authMax: number };
  storage: {
    provider: 'local' | 's3' | 'cloudinary';
    localPath: string;
    maxUploadBytes: number;
    aws: { accessKeyId?: string; secretAccessKey?: string; region?: string; bucket?: string };
    cloudinary: { cloudName?: string; apiKey?: string; apiSecret?: string };
  };
  mail: {
    enabled: boolean;
    host?: string;
    port: number;
    secure: boolean;
    user?: string;
    password?: string;
    from: string;
  };
  reminders: { enabled: boolean; cron: string };
}

const toBool = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: toInt(process.env.API_PORT, 4000),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  apiUrl: process.env.API_URL ?? 'http://localhost:4000',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  jwt: {
    secret: process.env.JWT_SECRET ?? 'insecure-development-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ?? 'insecure-development-refresh-secret-change-me',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  bcryptRounds: toInt(process.env.BCRYPT_SALT_ROUNDS, 12),
  rateLimit: {
    ttl: toInt(process.env.RATE_LIMIT_TTL, 60),
    max: toInt(process.env.RATE_LIMIT_MAX, 300),
    authMax: toInt(process.env.AUTH_RATE_LIMIT_MAX, 10),
  },
  storage: {
    provider: (process.env.STORAGE_PROVIDER as AppConfig['storage']['provider']) ?? 'local',
    localPath: process.env.STORAGE_LOCAL_PATH ?? './uploads',
    maxUploadBytes: toInt(process.env.MAX_UPLOAD_SIZE_MB, 25) * 1024 * 1024,
    aws: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION,
      bucket: process.env.AWS_S3_BUCKET,
    },
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.CLOUDINARY_API_SECRET,
    },
  },
  mail: {
    enabled: toBool(process.env.EMAIL_ENABLED, false),
    host: process.env.EMAIL_HOST || undefined,
    port: toInt(process.env.EMAIL_PORT, 587),
    secure: toBool(process.env.EMAIL_SECURE, false),
    user: process.env.EMAIL_USER || undefined,
    password: process.env.EMAIL_PASSWORD || undefined,
    from: process.env.EMAIL_FROM ?? 'OrgFlow <no-reply@orgflow.local>',
  },
  reminders: {
    enabled: toBool(process.env.REMINDERS_ENABLED, true),
    cron: process.env.REMINDERS_CRON ?? '0 7 * * *',
  },
});
