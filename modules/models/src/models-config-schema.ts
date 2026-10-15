import { z } from 'zod';
import { getCLIContextWindow } from './get-cli-context-window';
import type { ModelProfile, ModelsConfig } from './types';

const profileIDSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/u, 'a profile ID is a lowercase slug');

const priceSchema = z.number().nonnegative();

const pricesSchema = z.strictObject({
  input: priceSchema,
  cache_write: priceSchema,
  cached_input: priceSchema,
  output: priceSchema,
});

// Slice 1 resolves only references into the secrets file; another backend arrives with the
// credential store.
const credentialSchema = z
  .string()
  .regex(/^deployment:[\w-]+$/u, 'a credential reference reads deployment:<name>');

// The CLI's auto-compact window takes a plain integer in this range and clamps any other value, so
// nixie refuses one at start instead.
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
    prices: pricesSchema.optional(),
  })

  // With auto-compaction off the CLI ignores the cap and refuses a call only against the window it
  // assumes for the model, so nixie refuses at start a cap past that window.
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

// The models section of the deployment configuration: each profile by its ID, and the profile
// each role uses. It refuses an unset conversation role, so a missing model stops nixie at start
// and never shows up as a failed turn, and a role that names no profile.
export const modelsConfigSchema = z
  .strictObject({ profiles: z.record(profileIDSchema, profileSchema), roles: rolesSchema })
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
    prices:
      input.prices === undefined
        ? null
        : {
            input: input.prices.input,
            cacheWrite: input.prices.cache_write,
            cachedInput: input.prices.cached_input,
            output: input.prices.output,
          },
  };
}
