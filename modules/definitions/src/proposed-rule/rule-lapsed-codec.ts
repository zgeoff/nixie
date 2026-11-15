import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const ruleLapsedCodec = defineRecordCodec(
  'rules.rule_lapsed',
  z.object({ proposalID: z.string(), groupHash: z.string(), quietUntil: z.number() }),
);
