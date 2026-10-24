import { z } from 'zod';

// One line of a reply run: a turn of one candidate, its timings from the end of the caller's speech,
// and each clip of audio it played. The runner writes it and the report reads it.
export const replyRecord = z.object({
  candidate: z.string(),
  clips: z.array(
    z.object({
      audioMs: z.number(),
      readyMs: z.number(),
      text: z.string(),
      textMs: z.number(),
      ttsMs: z.number(),
    }),
  ),
  costUSD: z.number(),
  endpointMs: z.number(),
  firstAudioMs: z.number().optional(),
  firstTextMs: z.number().optional(),
  fullAudioMs: z.number().optional(),
  fullTextMs: z.number(),
  gapMs: z.number(),
  gapToleranceMs: z.number(),
  gaps: z.number().int().nonnegative(),
  isError: z.boolean(),
  line: z.number().int().nonnegative(),
  load1: z.number().optional(),
  model: z.string(),
  needsTool: z.boolean(),
  opener: z.object({ confidence: z.number(), name: z.string(), readyMs: z.number() }).optional(),
  playEndMs: z.number(),
  recording: z.string(),
  round: z.number().int().nonnegative(),
  speechMs: z.number(),
  sttMs: z.number(),
  subtype: z.string(),
  text: z.string(),
  toolCalls: z.array(z.string()),
  transcript: z.string(),
  ttftStreamMs: z.number().optional(),
});

export type ReplyRecord = z.infer<typeof replyRecord>;
