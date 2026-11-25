import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const takeoverEnds = ['user', 'assistant', 'idle', 'restart'] as const;

export const takeoverEndedCodec = defineRecordCodec(
  'computer.takeover_ended',
  z.object({
    shortID: z.string(),
    by: z.enum(takeoverEnds),
    durationSeconds: z.number(),
  }),
);

// The erasable fields: each site the browser showed during the hold, in order and in scheme and host
// alone, every tab open at the hand-back, whether the browser restarted, and the window in focus at
// the hand-back. A record from before tabs were listed has none of them.
const browserNow = z.object({ kind: z.literal('browser'), tab: z.string(), text: z.string() });
const terminalNow = z.object({ kind: z.literal('terminal'), text: z.string() });
const otherNow = z.object({ kind: z.literal('other'), title: z.string().optional() });
const tabSchema = z.object({ tab: z.string(), origin: z.string().nullable() });
const nowSchema = z.discriminatedUnion('kind', [browserNow, terminalNow, otherNow]);

export const takeoverEndedFieldsSchema = z.object({
  origins: z.array(z.string()),
  tabs: z.array(tabSchema).default([]),
  isRestarted: z.boolean().default(false),
  now: nowSchema.nullable(),
});
