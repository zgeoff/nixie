import { z } from 'zod';
import { getCLIContextWindow } from './get-cli-context-window';
import { modelPricesSchema } from './model-prices-schema';
import type { ModelProfile, ModelsConfig, SelectableModel } from './types';

const profileIDSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/u, 'a profile ID is a lowercase slug');

const credentialSchema = z
  .string()
  .regex(/^deployment:[\w-]+$/u, 'a credential reference reads deployment:<name>');

// The CLI's auto-compact window takes an integer in this range and clamps any other value.
const contextTokensSchema = z.int().min(100_000).max(1_000_000);

const profileSchema = z
  .strictObject({
    base_url: z.url({ protocol: /^https?$/u }),
    credential: credentialSchema,
    auth_header: z.enum(['bearer', 'x-api-key']),
    model: z.string().min(1),
    effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']),
    provider_pin: z.string().min(1).optional(),
    context_tokens: contextTokensSchema.optional(),
    cache_ttl: z.enum(['5m', '1h']).optional(),
    prices: modelPricesSchema.optional(),
  })

  // With auto-compaction off, the CLI ignores the cap and refuses a call only against the window it
  // assumes for the model.
  .superRefine((profile, issues) => {
    const window = getCLIContextWindow(profile.model);

    if (profile.context_tokens !== undefined && profile.context_tokens > window) {
      issues.addIssue({
        code: 'custom',
        path: ['context_tokens'],
        message: `the context cap of ${String(profile.context_tokens)} tokens is larger than the ${String(window)}-token window the Claude CLI assumes for ${profile.model}`,
      });
    }
  });

const rolesSchema = z.strictObject({
  conversation: profileIDSchema.optional(),
  task: profileIDSchema.optional(),
  worker: profileIDSchema.optional(),
  checker: profileIDSchema.optional(),
  'memory-writer': profileIDSchema.optional(),
  'memory-consolidator': profileIDSchema.optional(),
});

const selectableSchema = z.strictObject({
  profile: profileIDSchema,
  description: z.string().trim().min(1).max(200),
  ask: z.boolean().optional(),
});

const turnsSchema = z.int().positive();
const dollarsSchema = z.number().positive();

const taskRunSchema = z
  .strictObject({
    default: z
      .strictObject({ turns: turnsSchema.default(25), dollars: dollarsSchema.default(2) })
      .default({ turns: 25, dollars: 2 }),
    max: z
      .strictObject({ turns: turnsSchema.default(100), dollars: dollarsSchema.default(10) })
      .default({ turns: 100, dollars: 10 }),
  })
  .superRefine((limits, issues) => {
    for (const key of ['turns', 'dollars'] as const) {
      if (limits.default[key] > limits.max[key]) {
        issues.addIssue({
          code: 'custom',
          path: ['default', key],
          message: `the default task run limit of ${String(limits.default[key])} ${key} is above its max of ${String(limits.max[key])}`,
        });
      }
    }
  });

const limitsSchema = z.strictObject({ taskRun: taskRunSchema.default(taskRunSchema.parse({})) });

export const modelsConfigSchema = z
  .strictObject({
    profiles: z.record(profileIDSchema, profileSchema),
    roles: rolesSchema,
    selectable: z.record(profileIDSchema, selectableSchema).default({}),
    limits: limitsSchema.default(limitsSchema.parse({})),
  })
  .superRefine((config, issues) => {
    if (config.roles.conversation === undefined) {
      issues.addIssue({
        code: 'custom',
        path: ['roles', 'conversation'],
        message: 'the conversation role is unset, and nixie needs it to start',
      });
    }

    for (const [role, profileID] of Object.entries(config.roles)) {
      if (profileID !== undefined && !Object.hasOwn(config.profiles, profileID)) {
        issues.addIssue({
          code: 'custom',
          path: ['roles', role],
          message: `the ${role} role names the profile ${profileID}, which is not defined`,
        });
      }
    }

    // A task on a selectable model counts its cost against its dollar limit, so its profile needs
    // a price table.
    for (const [name, entry] of Object.entries(config.selectable)) {
      const profile = config.profiles[entry.profile];

      if (profile === undefined) {
        issues.addIssue({
          code: 'custom',
          path: ['selectable', name, 'profile'],
          message: `the selectable model ${name} names the profile ${entry.profile}, which is not defined`,
        });
      } else if (profile.prices === undefined) {
        issues.addIssue({
          code: 'custom',
          path: ['selectable', name, 'profile'],
          message: `the selectable model ${name} names the profile ${entry.profile}, which sets no prices`,
        });
      }
    }
  })
  .transform((config): ModelsConfig => ({
    profiles: Object.fromEntries(
      Object.entries(config.profiles).map(([id, profile]) => [id, toProfile(id, profile)]),
    ),
    roles: {
      ...Object.fromEntries(
        Object.entries(config.roles).filter(([, profileID]) => profileID !== undefined),
      ),
      conversation: config.roles.conversation ?? '',
    },
    selectable: Object.entries(config.selectable).map(([name, entry]): SelectableModel => ({
      name,
      profile: entry.profile,
      description: entry.description,
      isAsked: entry.ask ?? false,
    })),
    limits: config.limits,
  }));

function toProfile(id: string, input: z.infer<typeof profileSchema>): ModelProfile {
  return {
    id,
    baseURL: input.base_url,
    credential: input.credential,
    authHeader: input.auth_header,
    model: input.model,
    effort: input.effort,
    providerPin: input.provider_pin ?? null,
    contextTokens: input.context_tokens ?? null,

    // The CLI writes 5-minute entries on an API-key or bearer profile unless told otherwise.
    cacheTTL: input.cache_ttl ?? '5m',
    prices: input.prices ?? null,
  };
}
