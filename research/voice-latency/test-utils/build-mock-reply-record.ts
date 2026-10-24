import type { ReplyRecord } from '../reply-record.ts';

// A turn that played one clip with no gap, at fixed times; a test overrides the fields it reads.
export function buildMockReplyRecord(overrides: Partial<ReplyRecord> = {}): ReplyRecord {
  return {
    candidate: 'haiku-clauses',
    clips: [{ audioMs: 2000, readyMs: 1200, text: 'Sure, pack a warm layer.', textMs: 1000, ttsMs: 150 }],
    costUSD: 0.001,
    endpointMs: 510,
    firstAudioMs: 1200,
    firstTextMs: 1000,
    fullAudioMs: 1200,
    fullTextMs: 1100,
    gapMs: 0,
    gapToleranceMs: 150,
    gaps: 0,
    isError: false,
    line: 0,
    model: 'claude-haiku-5-5',
    needsTool: false,
    playEndMs: 3200,
    recording: 'r0-l0.wav',
    round: 0,
    speechMs: 2800,
    sttMs: 30,
    subtype: 'success',
    text: 'Sure, pack a warm layer.',
    toolCalls: [],
    transcript: 'what should i pack',
    ...overrides,
  };
}
