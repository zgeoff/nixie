import type { LogLevel } from '@heynixie/ops';
import { logLevels } from '@heynixie/ops';
import { z } from 'zod';

// The server section of the deployment configuration: the data volume's mount root, where the API
// and the health endpoint listen, nixie's encrypted secrets file, and the lowest level of event the
// log writes. Each has the default the reference Compose recipe and manifests use.
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

export interface ServerConfig {
  readonly dataDir: string;
  readonly hostname: string;
  readonly port: number;
  readonly secretsFile: string;
  readonly logLevel: LogLevel;
}
