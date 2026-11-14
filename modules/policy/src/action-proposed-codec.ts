import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { effectNames } from './effect-names';

export const actionProposedCodec = defineRecordCodec(
  'policy.action_proposed',
  z.object({
    proposalID: z.string(),
    shortID: z.string(),
    callSequence: z.number(),
    tool: z.string(),
    effects: z.enum(effectNames).array(),
    actionHash: z.string(),
    cause: z.enum([
      'direct_request',
      'repeat',
      'outside_steering',
      'always_ask',
      'ask_rule',
      'no_rule',
    ]),
  }),
);
