import { expect, test } from 'bun:test';
import { startTestImages } from '@heynixie/connectors/test-utils';
import { readRecords } from '@heynixie/log';
import { mockServer } from '@heynixie/mock-server';
import { HttpResponse, http } from 'msw';
import { z } from 'zod';
import { buildGeminiImages } from './build-gemini-images';
import { geminiImagesAPIURL } from './mocks/gemini-images-api-url';

function setupTest() {
  const pixel =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

  return {
    pixel,
    provider: buildGeminiImages({ apiKey: 'gem-test-key-a', apiURL: geminiImagesAPIURL }),
    signal: new AbortController().signal,
  };
}

test('it sends the prompt, the source and each reference with the key in a header, and returns the image', async () => {
  const ctx = setupTest();
  const seen: { key: string | null; revision: string | null; body: unknown; url: string }[] = [];

  mockServer.use(
    http.post(`${geminiImagesAPIURL}/interactions`, async (info) => {
      const body = await info.request.clone().json();

      const format = z
        .object({ response_format: z.object({ mime_type: z.string() }) })
        .safeParse(body);

      if (format.data?.response_format.mime_type !== 'image/jpeg') {
        return HttpResponse.json(
          { error: { status: 'INVALID_ARGUMENT', message: 'Only image/jpeg is allowed.' } },
          { status: 400 },
        );
      }

      seen.push({
        key: info.request.headers.get('x-goog-api-key'),
        revision: info.request.headers.get('api-revision'),
        body,
        url: info.request.url,
      });

      return HttpResponse.json({
        steps: [{ type: 'model_output', content: [{ type: 'image', data: ctx.pixel }] }],
      });
    }),
  );

  const reply = await ctx.provider.draw({
    model: 'model-b',
    prompt: 'move the boat',
    size: '1536x1024',
    source: { mediaType: 'image/png', bytes: new Uint8Array([1, 2]) },
    references: [{ mediaType: 'image/png', bytes: new Uint8Array([3]) }],
    signal: ctx.signal,
  });

  expect(seen).toStrictEqual([
    {
      key: 'gem-test-key-a',
      revision: '2026-05-20',
      url: `${geminiImagesAPIURL}/interactions`,
      body: {
        model: 'model-b',
        input: [
          { type: 'text', text: 'move the boat' },
          { type: 'image', mime_type: 'image/png', data: 'AQI=' },
          { type: 'image', mime_type: 'image/png', data: 'Aw==' },
        ],
        response_format: {
          type: 'image',
          mime_type: 'image/jpeg',
          aspect_ratio: '3:2',
          image_size: '1K',
        },
      },
    },
  ]);

  expect(reply).toStrictEqual({
    kind: 'image',
    mediaType: 'image/jpeg',
    bytes: Buffer.from(ctx.pixel, 'base64'),
  });
});

test('it returns a reply that holds only words as a billed refusal that carries them', async () => {
  const ctx = setupTest();

  mockServer.use(
    http.post(`${geminiImagesAPIURL}/interactions`, () =>
      HttpResponse.json({
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'I cannot draw that.' }] }],
      }),
    ),
  );

  const reply = await ctx.provider.draw({
    model: 'model-b',
    prompt: 'a scene',
    size: '1024x1024',
    references: [],
    signal: ctx.signal,
  });

  expect(reply).toStrictEqual({
    kind: 'refused',
    reason: 'other',
    message: 'I cannot draw that.',
    isBilled: true,
  });
});

test('it returns a blocked prompt as an unbilled safety refusal', async () => {
  const ctx = setupTest();

  mockServer.use(
    http.post(`${geminiImagesAPIURL}/interactions`, () =>
      HttpResponse.json(
        { error: { status: 'INVALID_ARGUMENT', message: 'Prompt blocked for safety reasons.' } },
        { status: 400 },
      ),
    ),
  );

  const reply = await ctx.provider.draw({
    model: 'model-b',
    prompt: 'a scene',
    size: '1024x1024',
    references: [],
    signal: ctx.signal,
  });

  expect(reply).toStrictEqual({
    kind: 'refused',
    reason: 'safety',
    message: 'Prompt blocked for safety reasons.',
    isBilled: false,
  });
});

test('it returns another error status as an unbilled failure that names the status', async () => {
  const ctx = setupTest();

  mockServer.use(
    http.post(`${geminiImagesAPIURL}/interactions`, () =>
      HttpResponse.json({ error: { message: 'Overloaded.' } }, { status: 503 }),
    ),
  );

  const reply = await ctx.provider.draw({
    model: 'model-b',
    prompt: 'a scene',
    size: '1024x1024',
    references: [],
    signal: ctx.signal,
  });

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: 'Gemini answered 503: Overloaded.',
    isBilled: false,
  });
});

test('it throws when the time limit aborts the call, so the tool can tell a timeout from a failure', () => {
  const ctx = setupTest();

  const controller = new AbortController();

  controller.abort();
  mockServer.use(http.post(`${geminiImagesAPIURL}/interactions`, () => HttpResponse.json({})));

  const drawn = ctx.provider.draw({
    model: 'model-b',
    prompt: 'a scene',
    size: '1024x1024',
    references: [],
    signal: controller.signal,
  });

  expect(drawn).rejects.toThrow('time limit');
});

test('it never lets the key reach a result or the log when the API echoes it', async () => {
  const ctx = setupTest();

  mockServer.use(
    http.post(`${geminiImagesAPIURL}/interactions`, (info) =>
      HttpResponse.json(
        {
          error: {
            message: `Bad key ${info.request.headers.get('x-goog-api-key') ?? ''} was refused.`,
          },
        },
        { status: 403 },
      ),
    ),
  );

  const images = await startTestImages({ providers: { main: ctx.provider, second: ctx.provider } });
  const reply = await images.call('image.draw', { prompt: 'a scene' });
  const records = await readRecords(images.log, { afterSequence: 0, limit: 1000 });

  expect(JSON.stringify([reply, records])).not.toContain('gem-test-key-a');
});
