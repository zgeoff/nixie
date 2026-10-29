import { z } from 'zod';

export interface ResticRepository {
  readonly repository: string;
  readonly password: string;
}

export interface DataRetention {
  readonly hourly: number;
  readonly daily: number;
  readonly weekly: number;
  readonly monthly: number;
}

export interface JobConfig {
  readonly stagingDir: string;
  readonly restic: string;
  readonly pollMs: number;
  readonly data: ResticRepository;
  readonly keys: ResticRepository;
  readonly retention: DataRetention;

  // every variable outside the job's own, such as a backend's credentials, which restic reads
  readonly backendEnv: Readonly<Record<string, string>>;
}

const jobEnvSchema = z
  .object({
    NIXIE_BACKUP_STAGING_DIR: z.string().min(1).default('/backup'),
    NIXIE_BACKUP_RESTIC: z.string().min(1).default('restic'),
    NIXIE_BACKUP_POLL_SECONDS: z.coerce.number().positive().default(60),
    NIXIE_BACKUP_DATA_REPOSITORY: z.string().min(1),
    NIXIE_BACKUP_DATA_PASSWORD: z.string().min(1),
    NIXIE_BACKUP_KEY_REPOSITORY: z.string().min(1),
    NIXIE_BACKUP_KEY_PASSWORD: z.string().min(1),
    NIXIE_BACKUP_KEEP_HOURLY: z.coerce.number().int().positive().default(24),
    NIXIE_BACKUP_KEEP_DAILY: z.coerce.number().int().positive().default(7),
    NIXIE_BACKUP_KEEP_WEEKLY: z.coerce.number().int().positive().default(4),
    NIXIE_BACKUP_KEEP_MONTHLY: z.coerce.number().int().positive().default(6),
  })
  .refine((env) => env.NIXIE_BACKUP_DATA_REPOSITORY !== env.NIXIE_BACKUP_KEY_REPOSITORY, {
    message:
      'the key repo keeps one snapshot so a forgotten key leaves every backup, so it needs a repository of its own',
    path: ['NIXIE_BACKUP_KEY_REPOSITORY'],
  });

export function parseJobConfig(env: Readonly<Record<string, string | undefined>>): JobConfig {
  const parsed = jobEnvSchema.parse(env);

  return {
    stagingDir: parsed.NIXIE_BACKUP_STAGING_DIR,
    restic: parsed.NIXIE_BACKUP_RESTIC,
    pollMs: Math.round(parsed.NIXIE_BACKUP_POLL_SECONDS * 1000),
    data: {
      repository: parsed.NIXIE_BACKUP_DATA_REPOSITORY,
      password: parsed.NIXIE_BACKUP_DATA_PASSWORD,
    },
    keys: {
      repository: parsed.NIXIE_BACKUP_KEY_REPOSITORY,
      password: parsed.NIXIE_BACKUP_KEY_PASSWORD,
    },
    retention: {
      hourly: parsed.NIXIE_BACKUP_KEEP_HOURLY,
      daily: parsed.NIXIE_BACKUP_KEEP_DAILY,
      weekly: parsed.NIXIE_BACKUP_KEEP_WEEKLY,
      monthly: parsed.NIXIE_BACKUP_KEEP_MONTHLY,
    },
    backendEnv: Object.fromEntries(
      Object.entries(env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined && isBackendName(entry[0]),
      ),
    ),
  };
}

const jobPrefix = 'NIXIE_BACKUP_';

// restic reads a password file or command before RESTIC_PASSWORD, so one left in the environment
// would open both repos with the same password
function isBackendName(name: string): boolean {
  return (
    !name.startsWith(jobPrefix) &&
    !name.startsWith('RESTIC_PASSWORD') &&
    !name.startsWith('RESTIC_REPOSITORY')
  );
}
