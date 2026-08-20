import { z } from 'zod';

// Validate all required environment variables at startup.
// The application will fail fast with a clear error if any are missing.

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (val === '' || val === null || val === undefined ? undefined : val), schema);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  AUTH_ACCESS_SECRET: z.string().min(32, 'AUTH_ACCESS_SECRET must be at least 32 characters'),
  AUTH_REFRESH_SECRET: z.string().min(32, 'AUTH_REFRESH_SECRET must be at least 32 characters'),
  AUTH_ACCESS_EXPIRES_IN: z.string().default('15m'),
  AUTH_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Local storage needs none of these; only required when STORAGE_PROVIDER=r2.
  STORAGE_PROVIDER: z.enum(['local', 'r2']).default('local'),
  LOCAL_STORAGE_DIR: z.string().default('./storage'),
  R2_ENDPOINT: emptyToUndefined(z.string().optional()),
  R2_BUCKET: emptyToUndefined(z.string().optional()),
  R2_ACCESS_KEY_ID: emptyToUndefined(z.string().optional()),
  R2_SECRET_ACCESS_KEY: emptyToUndefined(z.string().optional()),
  R2_REGION: z.string().default('auto'),
  R2_SIGNED_URL_EXPIRES: z.coerce.number().int().positive().default(3600),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    result.error.issues.forEach((issue) => {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    });
    process.exit(1);
  }

  if (result.data.STORAGE_PROVIDER === 'r2') {
    const missing = (['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'] as const).filter(
      (key) => !result.data[key]
    );
    if (missing.length > 0) {
      console.error(`❌ STORAGE_PROVIDER=r2 requires: ${missing.join(', ')}`);
      process.exit(1);
    }
    try {
      new URL(result.data.R2_ENDPOINT!);
    } catch {
      console.error('❌ R2_ENDPOINT must be a valid URL when STORAGE_PROVIDER=r2');
      process.exit(1);
    }
  }

  return result.data;
}

export const env = validateEnv();
export type Env = typeof env;
