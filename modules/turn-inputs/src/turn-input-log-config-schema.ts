import { z } from 'zod';
import { parseDuration } from './utils/parse-duration';

export const turnInputRoles = [
  'conversation',
  'task',
  'memory-writer',
  'memory-consolidator',
] as const;

export type TurnInputRole = (typeof turnInputRoles)[number];

export interface TurnInputSource {
  readonly baseURL: string;
  readonly directory: string;
}

export interface TurnInputLogConfig {
  readonly default: 'off' | 'always';
  readonly maxWindowMs: number;
  readonly closeWaitMs: number;
  readonly roles: readonly TurnInputRole[];
  readonly retention: { readonly days: 3 | 7 | 30; readonly bytes: number };
  readonly sources: Readonly<Record<string, TurnInputSource>>;
}

const refusedRoleSchema = z.enum(['checker', 'worker']).transform((role, issues) => {
  issues.addIssue({
    code: 'custom',
    message:
      role === 'checker'
        ? 'the checker sends no turn frame, so the log cannot capture it'
        : 'no runner uses the worker role',
  });

  return z.NEVER;
});

const roleSchema = z.union([z.enum(turnInputRoles), refusedRoleSchema]);

const sourceSchema = z.strictObject({
  base_url: z.url({ protocol: /^https?$/u }),

  // oxlint-disable-next-line zgeoff/no-abbreviated-names -- the key of the deployment's config
  dir: z.string().refine((path) => path.startsWith('/'), { message: 'an absolute path' }),
});

const retentionSchema = z.strictObject({
  days: z.union([z.literal(3), z.literal(7), z.literal(30)]).default(7),
  bytes: z.int().positive().default(2_147_483_648),
});

export const turnInputLogConfigSchema = z
  .strictObject({
    default: z.enum(['off', 'always']).default('always'),
    max_window: buildDurationSchema('24h'),
    close_wait: buildDurationSchema('5s'),
    roles: z.array(roleSchema).default(['conversation', 'task']),
    retention: retentionSchema.default({ days: 7, bytes: 2_147_483_648 }),
    sources: z.record(z.string().min(1), sourceSchema).default({}),
  })
  .transform((config): TurnInputLogConfig => ({
    default: config.default,
    maxWindowMs: config.max_window,
    closeWaitMs: config.close_wait,
    roles: config.roles,
    retention: config.retention,
    sources: buildSources(config.sources),
  }));

function buildDurationSchema(fallback: string) {
  return z
    .string()
    .default(fallback)
    .transform((text, issues) => {
      const durationMs = parseDuration(text);

      if (durationMs === null) {
        issues.addIssue({ code: 'custom', message: 'a duration such as 500ms, 5s, 10m or 24h' });

        return z.NEVER;
      }

      return durationMs;
    });
}

function buildSources(
  sources: Readonly<Record<string, z.infer<typeof sourceSchema>>>,
): Record<string, TurnInputSource> {
  const entries = Object.entries(sources);

  return Object.fromEntries(
    entries.map(([name, source]) => [name, { baseURL: source.base_url, directory: source.dir }]),
  );
}
