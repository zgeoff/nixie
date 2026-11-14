import type { LogLevel } from '@heynixie/logger';
import { logLevels } from '@heynixie/logger';
import { z } from 'zod';

export interface ServerConfig {
  readonly dataDir: string;
  readonly hostname: string;
  readonly port: number;
  readonly secretsFile: string;
  readonly logLevel: LogLevel;
}

export const serverConfigSchema = z
  .strictObject({
    data_dir: z.string().min(1).default('/data'),
    hostname: z.string().min(1).default('0.0.0.0'),
    port: z.number().int().min(0).max(65_535).default(8080),
    secrets_file: z.string().min(1).default('/etc/nixie/secrets.yaml'),
    log_level: z.enum(logLevels).default('info'),
  })
  .transform((config): ServerConfig => ({
    dataDir: config.data_dir,
    hostname: config.hostname,
    port: config.port,
    secretsFile: config.secrets_file,
    logLevel: config.log_level,
  }));
