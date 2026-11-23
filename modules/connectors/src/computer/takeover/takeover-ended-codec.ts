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
// alone, and the window in focus at the hand-back. A restart has no sites and no window.
const browserNow = z.object({ kind: z.literal('browser'), tab: z.string(), text: z.string() });
const terminalNow = z.object({ kind: z.literal('terminal'), text: z.string() });
const otherNow = z.object({ kind: z.literal('other') });
const nowSchema = z.discriminatedUnion('kind', [browserNow, terminalNow, otherNow]);

export const takeoverEndedFieldsSchema = z.object({
  origins: z.array(z.string()),
  now: nowSchema.nullable(),
});
