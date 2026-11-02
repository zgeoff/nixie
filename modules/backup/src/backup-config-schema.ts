import { z } from 'zod';

export interface BackupConfig {
  readonly isEnabled: boolean;
  readonly intervalMs: number;
}

export const backupConfigSchema = z
  .strictObject({
    enabled: z.boolean().default(true),
    interval_minutes: z.number().positive().default(60),
  })
  .transform((config): BackupConfig => ({
    isEnabled: config.enabled,
    intervalMs: Math.max(1, Math.round(config.interval_minutes * 60_000)),
  }));
