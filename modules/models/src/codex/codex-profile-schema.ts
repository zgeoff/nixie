import { codexEfforts } from '@heynixie/wire';
import { z } from 'zod';
import { modelPricesSchema } from '../agent/model-prices-schema';
import type { CodexProfile } from './codex-harness-definition';

const credentialSchema = z
  .string()
  .regex(/^deployment:[\w-]+$/u, 'a credential reference reads deployment:<name>');

// The strict object refuses auth_header: the broker always sends a Codex profile's secret as a
// bearer header.
export const codexProfileSchema = z
  .strictObject({
    harness: z.literal('codex'),
    base_url: z.url({ protocol: /^https?$/u }),
    credential: credentialSchema,
    model: z.string().min(1),
    effort: z.enum(codexEfforts),
    prices: modelPricesSchema.optional(),

    // the profile's requests go to the model gateway's plan route of the same ID
    chatgpt_login: z.boolean().default(false),
  })
  .superRefine((input, ctx) => {
    if (input.chatgpt_login && !isChatGPTBaseURL(input.base_url)) {
      ctx.addIssue({
        code: 'custom',
        path: ['base_url'],
        message: `a profile with chatgpt_login sets base_url to ${chatgptBaseURL}`,
      });
    }
  })
  .transform((input): Omit<CodexProfile, 'id'> => ({
    harness: input.harness,
    baseURL: input.base_url,
    credential: input.credential,
    model: input.model,
    effort: input.effort,
    prices: input.prices ?? null,
    chatgptLogin: input.chatgpt_login,
  }));

const chatgptBaseURL = 'https://chatgpt.com';

// the sandbox's path starts after the origin, so the broker's grant on this host covers it
function isChatGPTBaseURL(baseURL: string): boolean {
  return baseURL === chatgptBaseURL || baseURL === `${chatgptBaseURL}/`;
}
