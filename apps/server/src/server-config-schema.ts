import { z } from 'zod';

// The server section of the deployment configuration: the data volume's mount root, where the API
// and the health endpoint listen, and nixie's encrypted secrets file. Each has the default the
// reference Compose recipe and manifests use.
export const serverConfigSchema = z
  .strictObject({
    data_dir: z.string().min(1).default('/data'),
    hostname: z.string().min(1).default('0.0.0.0'),
    port: z.number().int().min(0).max(65_535).default(8080),
    secrets_file: z.string().min(1).default('/etc/nixie/secrets.yaml'),
  })
  .transform((config): ServerConfig => ({
    dataDir: config.data_dir,
    hostname: config.hostname,
    port: config.port,
    secretsFile: config.secrets_file,
  }));

export interface ServerConfig {
  readonly dataDir: string;
  readonly hostname: string;
  readonly port: number;
  readonly secretsFile: string;
}
