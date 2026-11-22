import { expect, test } from 'bun:test';
import { startTestImages } from '@heynixie/connectors/test-utils';
import { readRecords } from '@heynixie/log';
import { network } from '@heynixie/mock-server';
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

  network.use(
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

  network.use(
    http.post(`${openAIImagesAPIURL}/images/edits`, async (info) => {
      const boundary = /boundary=(?<boundary>.+)$/u.exec(
        info.request.headers.get('content-type') ?? '',
      )?.groups?.['boundary'];

      const body = await info.request.clone().text();

      // each part: a header block, a blank line, its bytes, then the line break before the next
      const parts = body.split(`--${boundary}`).slice(1, -1);

      for (const part of parts) {
        const [head = '', ...rest] = part.split('\r\n\r\n');
        const content = rest.join('\r\n\r\n').replace(/\r\n$/u, '');
        const name = /name="(?<name>[^"]+)"/u.exec(head)?.groups?.['name'];

        if (name === 'image[]') {
          sizes.push(content.length);
        } else if (name === 'model' || name === 'prompt' || name === 'size') {
          fields[name] = content;
        }
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

  network.use(
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

  network.use(
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

  network.use(
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

  network.use(
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

  network.use(http.post(`${openAIImagesAPIURL}/images/generations`, () => HttpResponse.error()));

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
  network.use(http.post(`${openAIImagesAPIURL}/images/generations`, () => HttpResponse.json({})));

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

  network.use(
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
