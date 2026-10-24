import { expect, test } from 'bun:test';
import { HttpResponse, http } from 'msw';
import { createDecisionModel } from './create-decision-model.ts';
import { decisionStore } from './mocks/decision-store.ts';
import { server } from './mocks/node.ts';

test('it asks clef-flash about the transcript and returns its probability', async () => {
  decisionStore.answers.set('clef', 0.82);

  const answer = await createDecisionModel('clef', {
    accountID: 'account-7',
    token: 'token-7',
    transport: fetch,
  }).readEndProbability('book a table for two');

  expect(answer).toStrictEqual({
    model: 'clef-flash',
    probability: 0.82,
    usage: { input_tokens: 220, output_tokens: 0 },
  });
  expect(decisionStore.requests).toStrictEqual([
    {
      authorization: 'Bearer token-7',
      body: {
        model: 'clef-flash',
        questions: { ended: { instructions: expect.any(String), type: 'noul' } },
        state: expect.stringContaining('"book a table for two"'),
      },
      model: 'clef',
      url: 'https://api.cloudflare.com/client/v4/accounts/account-7/ai/run/@cf/cloudflare/clef-flash',
    },
  ]);
});

test('it asks jev with no authorization header when a broker holds the key', async () => {
  decisionStore.answers.set('jev', 0.28);

  const answer = await createDecisionModel('jev', { token: '', transport: fetch }).readEndProbability(
    'remind me to water the',
  );

  expect(answer).toStrictEqual({
    model: 'jev-1.14.0',
    probability: 0.28,
    usage: { input_tokens: 350, output_tokens: 20 },
  });
  expect(decisionStore.requests).toStrictEqual([
    {
      authorization: null,
      body: {
        model: 'jev-latest',
        questions: { ended: { instructions: expect.any(String), type: 'noul' } },
        state: expect.stringContaining('"remind me to water the"'),
      },
      model: 'jev',
      url: 'https://api.typesafe.ai/v1/systemone',
    },
  ]);
});

test('it rejects with the status and body of a refused request', () => {
  server.use(
    http.post('https://api.typesafe.ai/v1/systemone', () =>
      HttpResponse.json({ error: 'rate limited' }, { status: 429 }),
    ),
  );

  expect(
    createDecisionModel('jev', { token: '', transport: fetch }).readEndProbability('play the next song'),
  ).rejects.toThrow(/^jev: HTTP 429 \{"error":"rate limited"\}$/);
});

test('it rejects a clef-flash answer whose probability lies outside 0 to 1', () => {
  server.use(
    http.post(
      'https://api.cloudflare.com/client/v4/accounts/:accountID/ai/run/@cf/cloudflare/clef-flash',
      () =>
        HttpResponse.json({
          result: { answers: { ended: { noul: 1.4, type: 'noul' } }, model: 'clef-flash' },
          success: true,
        }),
    ),
  );

  expect(
    createDecisionModel('clef', { accountID: 'account-7', token: 'token-7', transport: fetch }).readEndProbability(
      'turn the heating up',
    ),
  ).rejects.toMatchObject({ issues: [expect.objectContaining({ path: ['result', 'answers', 'ended', 'noul'] })] });
});
