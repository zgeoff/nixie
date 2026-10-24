import { expect, mock, test } from 'bun:test';
import { HttpResponse, http } from 'msw';
import { createOpenerPicker } from './create-opener-picker.ts';
import { server } from './mocks/node.ts';

test('it asks clef-flash to choose the opener for the transcript and returns its choice', async () => {
  const recordRequest = mock((body: unknown, authorization: string | null) => ({ authorization, body }));
  server.use(
    http.post(
      'https://api.cloudflare.com/client/v4/accounts/:accountID/ai/run/@cf/cloudflare/clef-flash',
      async ({ request }) => {
        recordRequest(await request.json(), request.headers.get('authorization'));
        return HttpResponse.json({
          errors: [],
          messages: [],
          result: {
            answers: {
              opener: {
                choice: 'check',
                confidence: 0.353,
                probabilities: { check: 0.72, okay: 0.02, question: 0.04, see: 0.02, sure: 0.2 },
                type: 'choice',
              },
            },
            model: 'clef-flash',
            usage: { input_tokens: 180, output_tokens: 0 },
          },
          success: true,
        });
      },
    ),
  );

  const answer = await createOpenerPicker({
    accountID: 'account-7',
    token: 'token-7',
    transport: fetch,
  }).pickOpener('what is the weather in lyon tomorrow');

  expect(answer).toStrictEqual({ confidence: 0.353, opener: 'check' });
  expect(recordRequest).toHaveBeenCalledTimes(1);
  expect(recordRequest).toHaveBeenCalledWith(
    {
      model: 'clef-flash',
      questions: {
        opener: {
          criteria: {
            check: expect.stringMatching(/^"Let me check\." \S/),
            okay: expect.stringMatching(/^"Okay\." \S/),
            question: expect.stringMatching(/^"Good question\." \S/),
            see: expect.stringMatching(/^"Hmm, let me see\." \S/),
            sure: expect.stringMatching(/^"Sure\." \S/),
          },
          instructions: expect.any(String),
          type: 'choice',
        },
      },
      state: 'A person said to a voice assistant: "what is the weather in lyon tomorrow"',
    },
    'Bearer token-7',
  );
});

test('it sends no authorization header when a broker holds the key', async () => {
  const recordAuthorization = mock((authorization: string | null) => authorization);
  server.use(
    http.post(
      'https://api.cloudflare.com/client/v4/accounts/:accountID/ai/run/@cf/cloudflare/clef-flash',
      ({ request }) => {
        recordAuthorization(request.headers.get('authorization'));
        return HttpResponse.json({
          result: {
            answers: { opener: { choice: 'sure', confidence: 0.6, probabilities: {}, type: 'choice' } },
            model: 'clef-flash',
          },
          success: true,
        });
      },
    ),
  );

  await createOpenerPicker({ accountID: 'account-7', token: '', transport: fetch }).pickOpener(
    'give me a dinner idea',
  );

  expect(recordAuthorization.mock.calls).toStrictEqual([[null]]);
});

test('it rejects an HTTP error with its status and body', () => {
  server.use(
    http.post(
      'https://api.cloudflare.com/client/v4/accounts/:accountID/ai/run/@cf/cloudflare/clef-flash',
      () => HttpResponse.json({ errors: [{ code: 7003, message: 'rate limited' }], success: false }, { status: 429 }),
    ),
  );

  expect(
    createOpenerPicker({ accountID: 'account-7', token: '', transport: fetch }).pickOpener('hello'),
  ).rejects.toThrow(/^clef: HTTP 429 .*rate limited/);
});

test('it rejects a choice outside the approved openers', () => {
  server.use(
    http.post(
      'https://api.cloudflare.com/client/v4/accounts/:accountID/ai/run/@cf/cloudflare/clef-flash',
      () =>
        HttpResponse.json({
          result: {
            answers: { opener: { choice: 'done', confidence: 0.9, probabilities: {}, type: 'choice' } },
            model: 'clef-flash',
          },
          success: true,
        }),
    ),
  );

  expect(
    createOpenerPicker({ accountID: 'account-7', token: '', transport: fetch }).pickOpener('hello'),
  ).rejects.toMatchObject({ issues: [{ path: ['result', 'answers', 'opener', 'choice'] }] });
});
