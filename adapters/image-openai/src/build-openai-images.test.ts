import { expect, test } from 'bun:test';
import { startTestImages } from '@heynixie/connectors/test-utils';
import { readRecords } from '@heynixie/log';
import { mockServer } from '@heynixie/mock-server';
import { HttpResponse, http } from 'msw';
import { buildOpenAIImages } from './build-openai-images';
import { openAIImagesAPIURL } from './mocks/openai-images-api-url';

function setupTest() {
  const pixel =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

  const provider = buildOpenAIImages({ apiKey: 'sk-test-key-a', apiURL: openAIImagesAPIURL });

  return {
    pixel,
    provider,
    signal: new AbortController().signal,
  };
}

test('it draws a new image from the generations endpoint, with the key in a header', async () => {
  const ctx = setupTest();
  const seen: { auth: string | null; body: unknown; url: string }[] = [];

  mockServer.use(
    http.post(`${openAIImagesAPIURL}/images/generations`, async (info) => {
      seen.push({
        auth: info.request.headers.get('authorization'),
        body: await info.request.clone().json(),
        url: info.request.url,
      });

      return HttpResponse.json({ data: [{ b64_json: ctx.pixel }] });
    }),
  );

  const reply = await ctx.provider.draw({
    model: 'model-a',
    prompt: 'a small cove',
    size: '1536x1024',
    references: [],
    signal: ctx.signal,
  });

  expect(seen).toStrictEqual([
    {
      auth: 'Bearer sk-test-key-a',
      body: { model: 'model-a', prompt: 'a small cove', size: '1536x1024', n: 1 }, // oxlint-disable-line eslint/id-length
      url: `${openAIImagesAPIURL}/images/generations`,
    },
  ]);

  expect(reply).toStrictEqual({
    kind: 'image',
    mediaType: 'image/png',
    bytes: Buffer.from(ctx.pixel, 'base64'),
  });
});

test('it sends the source and then each reference to the edits endpoint', async () => {
  const ctx = setupTest();
  const sizes: number[] = [];
  const fields: Record<string, string> = {};

  mockServer.use(
    http.post(`${openAIImagesAPIURL}/images/edits`, async (info) => {
      const form = await info.request.clone().formData();

      for (const file of form.getAll('image[]')) {
        const size = file instanceof File ? file.size : -1;

        sizes.push(size);
      }

      for (const field of ['model', 'prompt', 'size']) {
        const value = form.get(field);

        fields[field] = typeof value === 'string' ? value : '';
      }

      return HttpResponse.json({ data: [{ b64_json: ctx.pixel }] });
    }),
  );

  await ctx.provider.draw({
    model: 'model-a',
    prompt: 'move the boat',
    size: '1024x1024',
    source: { mediaType: 'image/png', bytes: new Uint8Array(3) },
    references: [{ mediaType: 'image/png', bytes: new Uint8Array(5) }],
    signal: ctx.signal,
  });

  expect({ sizes, fields }).toStrictEqual({
    sizes: [3, 5],
    fields: { model: 'model-a', prompt: 'move the boat', size: '1024x1024' },
  });
});

test('it returns a moderation block of the prompt as an unbilled refusal', async () => {
  const ctx = setupTest();

  mockServer.use(
    http.post(`${openAIImagesAPIURL}/images/generations`, () =>
      HttpResponse.json(
        {
          error: {
            type: 'image_generation_user_error',
            code: 'moderation_blocked',
            message: 'Your request was rejected by the safety system.',
            moderation_details: { moderation_stage: 'input', categories: ['violence'] },
          },
        },
        { status: 400 },
      ),
    ),
  );

  const reply = await ctx.provider.draw({
    model: 'model-a',
    prompt: 'a scene',
    size: '1024x1024',
    references: [],
    signal: ctx.signal,
  });

  expect(reply).toStrictEqual({
    kind: 'refused',
    reason: 'safety',
    message: 'Your request was rejected by the safety system.',
    isBilled: false,
  });
});

test('it returns a moderation block of the output as a billed refusal', async () => {
  const ctx = setupTest();

  mockServer.use(
    http.post(`${openAIImagesAPIURL}/images/generations`, () =>
      HttpResponse.json(
        {
          error: {
            code: 'moderation_blocked',
            message: 'The image was blocked.',
            moderation_details: { moderation_stage: 'output' },
          },
        },
        { status: 400 },
      ),
    ),
  );

  const reply = await ctx.provider.draw({
    model: 'model-a',
    prompt: 'a scene',
    size: '1024x1024',
    references: [],
    signal: ctx.signal,
  });

  expect(reply).toMatchObject({ kind: 'refused', isBilled: true });
});

test('it returns another error status as an unbilled failure that names the status', async () => {
  const ctx = setupTest();

  mockServer.use(
    http.post(`${openAIImagesAPIURL}/images/generations`, () =>
      HttpResponse.json({ error: { message: 'The server had an error.' } }, { status: 500 }),
    ),
  );

  const reply = await ctx.provider.draw({
    model: 'model-a',
    prompt: 'a scene',
    size: '1024x1024',
    references: [],
    signal: ctx.signal,
  });

  expect(reply).toStrictEqual({
    kind: 'failed',
    reason: 'OpenAI answered 500: The server had an error.',
    isBilled: false,
  });
});

test('it returns a reply with no image as a billed failure', async () => {
  const ctx = setupTest();

  mockServer.use(
    http.post(`${openAIImagesAPIURL}/images/generations`, () => HttpResponse.json({ data: [] })),
  );

  const reply = await ctx.provider.draw({
    model: 'model-a',
    prompt: 'a scene',
    size: '1024x1024',
    references: [],
    signal: ctx.signal,
  });

  expect(reply).toMatchObject({ kind: 'failed', isBilled: true });
});

test('it returns an unreachable host as an unbilled failure', async () => {
  const ctx = setupTest();

  mockServer.use(http.post(`${openAIImagesAPIURL}/images/generations`, () => HttpResponse.error()));

  const reply = await ctx.provider.draw({
    model: 'model-a',
    prompt: 'a scene',
    size: '1024x1024',
    references: [],
    signal: ctx.signal,
  });

  expect(reply).toMatchObject({ kind: 'failed', isBilled: false });
});

test('it throws when the time limit aborts the call, so the tool can tell a timeout from a failure', () => {
  const ctx = setupTest();

  const controller = new AbortController();

  controller.abort();

  mockServer.use(
    http.post(`${openAIImagesAPIURL}/images/generations`, () => HttpResponse.json({})),
  );

  const drawn = ctx.provider.draw({
    model: 'model-a',
    prompt: 'a scene',
    size: '1024x1024',
    references: [],
    signal: controller.signal,
  });

  expect(drawn).rejects.toThrow('time limit');
});

test('it never lets the key reach a reply, a result or the log when the API echoes it', async () => {
  const ctx = setupTest();

  mockServer.use(
    http.post(`${openAIImagesAPIURL}/images/generations`, (info) =>
      HttpResponse.json(
        {
          error: {
            message: `Incorrect API key provided: ${info.request.headers.get('authorization') ?? ''}`,
          },
        },
        { status: 401 },
      ),
    ),
  );

  const images = await startTestImages({ providers: { main: ctx.provider, second: ctx.provider } });
  const reply = await images.call('image.draw', { prompt: 'a scene' });
  const records = await readRecords(images.log, { afterSequence: 0, limit: 1000 });

  expect(JSON.stringify([reply, records])).not.toContain('sk-test-key-a');
});
