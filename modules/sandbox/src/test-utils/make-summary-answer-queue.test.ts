import { expect, test } from 'bun:test';
import { makeSummaryAnswerQueue } from './make-summary-answer-queue';

test('it answers each summary call with the next answer in order', async () => {
  const answer = makeSummaryAnswerQueue([
    [{ type: 'failed', reason: 'error', detail: 'the first call ended with no summary' }],
    [{ type: 'failed', reason: 'error', detail: 'the second call ended with no summary' }],
  ]);

  const frame = {
    type: 'summarize',
    profile: {
      model: 'claude-test',
      baseURL: 'https://models.example.test',
      effort: 'medium',
      authHeader: 'x-api-key',
      contextTokens: null,
      cacheTTL: '5m',
    },
    resume: {
      sessionID: '5d1e7a90-2c4b-4f8e-9a3d-6b0c1e2f3a41',
      messageID: '8f2a6c13-4b7d-4e9f-a1c2-3d5e7f9b0c52',
    },
    systemPrompt: 'You plan the garden beds.',
    instruction: 'Summarize the session.',
  } as const;

  const first = await answer(frame);
  const second = await answer(frame);

  expect([first, second]).toStrictEqual([
    [{ type: 'failed', reason: 'error', detail: 'the first call ended with no summary' }],
    [{ type: 'failed', reason: 'error', detail: 'the second call ended with no summary' }],
  ]);
});

test('it throws on a summary call past the last answer', () => {
  const answer = makeSummaryAnswerQueue([]);

  expect(() =>
    answer({
      type: 'summarize',
      profile: {
        model: 'claude-test',
        baseURL: 'https://models.example.test',
        effort: 'medium',
        authHeader: 'x-api-key',
        contextTokens: null,
        cacheTTL: '5m',
      },
      resume: {
        sessionID: '5d1e7a90-2c4b-4f8e-9a3d-6b0c1e2f3a41',
        messageID: '8f2a6c13-4b7d-4e9f-a1c2-3d5e7f9b0c52',
      },
      systemPrompt: 'You plan the garden beds.',
      instruction: 'Summarize the session.',
    }),
  ).toThrow('a summary call came after the last answer in the queue');
});
