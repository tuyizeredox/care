/**
 * Fail fast on misconfiguration. Runs once at boot through ConfigModule.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];
  const isProduction = config.NODE_ENV === 'production';

  if (!config.DATABASE_URL) {
    errors.push('DATABASE_URL is required (postgresql://user:password@host:5432/db)');
  }

  if (isProduction) {
    const secrets = ['JWT_SECRET', 'JWT_REFRESH_SECRET'];
    for (const key of secrets) {
      const value = config[key];
      if (typeof value !== 'string' || value.length < 32) {
        errors.push(`${key} must be set to at least 32 characters in production`);
      }
      if (typeof value === 'string' && value.includes('change-me')) {
        errors.push(`${key} still contains the placeholder value`);
      }
    }
    if (config.JWT_SECRET === config.JWT_REFRESH_SECRET) {
      errors.push('JWT_SECRET and JWT_REFRESH_SECRET must be different values');
    }
  }

  const provider = (config.STORAGE_PROVIDER as string) ?? 'local';
  if (!['local', 's3', 'cloudinary'].includes(provider)) {
    errors.push(`STORAGE_PROVIDER must be one of local | s3 | cloudinary (got "${provider}")`);
  }
  if (provider === 's3' && !config.AWS_S3_BUCKET) {
    errors.push('AWS_S3_BUCKET is required when STORAGE_PROVIDER=s3');
  }
  if (provider === 'cloudinary' && !config.CLOUDINARY_CLOUD_NAME) {
    errors.push('CLOUDINARY_CLOUD_NAME is required when STORAGE_PROVIDER=cloudinary');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n  - ${errors.join('\n  - ')}`);
  }
  return config;
}
