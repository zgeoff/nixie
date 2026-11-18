import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { rewriteModelRequest } from './rewrite-model-request';

test.each(['messages', 'count_tokens'] as const)(
  "it drops the CLI blocks and keeps nixie's block with its cache marker on a %s request",
  (endpoint) => {
    const kept = { type: 'text', text: 'You are nixie.', cache_control: { type: 'ephemeral' } };

    const body = JSON.stringify({
      model: 'glm-test-1',
      system: [
        { type: 'text', text: 'x-test-billing-header: cc_version=0.0.0;' },
        { type: 'text', text: 'You are a CLI agent.', cache_control: { type: 'ephemeral' } },
        kept,
      ],
      messages: [],
    });

    const result = rewriteModelRequest(endpoint, body, {
      model: 'glm-test-1',
      systemPrompt: 'You are nixie.',
      providerPin: null,
    });

    expect(result).toStrictEqual({
      ok: true,
      body: JSON.stringify({ model: 'glm-test-1', system: [kept], messages: [] }),
    });
  },
);

test("it keeps the whole tail when nixie's prompt spans several blocks", () => {
  const first = { type: 'text', text: 'You are nixie.' };

  const second = {
    type: 'text',
    text: 'Keep the pantry list.',
    cache_control: { type: 'ephemeral' },
  };

  const body = JSON.stringify({
    model: 'glm-test-1',
    system: [{ type: 'text', text: 'You are a CLI agent.' }, first, second],
  });

  const result = rewriteModelRequest('messages', body, {
    model: 'glm-test-1',
    systemPrompt: 'You are nixie.\n\nKeep the pantry list.',
    providerPin: null,
  });

  expect(result).toStrictEqual({
    ok: true,
    body: JSON.stringify({ model: 'glm-test-1', system: [first, second] }),
  });
});

test('it adds the provider order to a messages request when the profile pins a provider', () => {
  const kept = { type: 'text', text: 'You are nixie.' };

  const body = JSON.stringify({
    model: 'glm-test-1',
    system: [{ type: 'text', text: 'You are a CLI agent.' }, kept],
  });

  const result = rewriteModelRequest('messages', body, {
    model: 'glm-test-1',
    systemPrompt: 'You are nixie.',
    providerPin: 'z-ai',
  });

  expect(result).toStrictEqual({
    ok: true,
    body: JSON.stringify({
      model: 'glm-test-1',
      system: [kept],
      provider: { order: ['z-ai'], allow_fallbacks: false },
    }),
  });
});

test('it sends back a reply that ends with a redacted_thinking block unchanged on the next request', () => {
  const kept = { type: 'text', text: 'You are nixie.' };

  const messages = [
    { role: 'user', content: [{ type: 'text', text: 'How tall is the lighthouse?' }] },
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'The lighthouse is 42 metres tall.', citations: [] },
        { type: 'redacted_thinking', data: 'test.reasoning:c2lnbmF0dXJlLW9mLXRoZS1saWdodGhvdXNl' },
      ],
    },
    { role: 'user', content: [{ type: 'text', text: 'And how old is it?' }] },
  ];

  const body = JSON.stringify({
    model: 'glm-test-1',
    system: [{ type: 'text', text: 'You are a CLI agent.' }, kept],
    messages,
  });

  const result = rewriteModelRequest('messages', body, {
    model: 'glm-test-1',
    systemPrompt: 'You are nixie.',
    providerPin: 'z-ai',
  });

  invariant(result.ok);

  expect(z.object({ messages: z.unknown() }).parse(JSON.parse(result.body)).messages).toStrictEqual(
    messages,
  );
});

test('it adds no provider order to a token count', () => {
  const kept = { type: 'text', text: 'You are nixie.' };

  const body = JSON.stringify({
    model: 'glm-test-1',
    system: [{ type: 'text', text: 'You are a CLI agent.' }, kept],
  });

  const result = rewriteModelRequest('count_tokens', body, {
    model: 'glm-test-1',
    systemPrompt: 'You are nixie.',
    providerPin: 'z-ai',
  });

  expect(result).toStrictEqual({
    ok: true,
    body: JSON.stringify({ model: 'glm-test-1', system: [kept] }),
  });
});

test.each([
  ['a body that is not JSON', 'not json'],
  ['a system prompt that is a string', JSON.stringify({ system: 'You are nixie.' })],
  ['a body with no system prompt', JSON.stringify({ model: 'glm-test-1', messages: [] })],
  [
    'a system block that is not text',
    JSON.stringify({
      system: [
        { type: 'image', source: {} },
        { type: 'text', text: 'You are nixie.' },
      ],
    }),
  ],
])('it refuses %s', (_label, body) => {
  const result = rewriteModelRequest('messages', body, {
    model: 'glm-test-1',
    systemPrompt: 'You are nixie.',
    providerPin: null,
  });

  expect(result).toStrictEqual({
    ok: false,
    error:
      "nixie refused a model request to glm-test-1: its system prompt is not a list of text blocks, so nixie cannot show that the CLI's blocks are gone",
  });
});

test("it refuses a request whose system blocks end in no tail that equals nixie's prompt", () => {
  const body = JSON.stringify({
    system: [
      { type: 'text', text: 'x-test-billing-header: cc_version=0.0.0;' },
      { type: 'text', text: 'You are a CLI agent.' },
      { type: 'text', text: 'You are somebody else.' },
    ],
  });

  const result = rewriteModelRequest('messages', body, {
    model: 'glm-test-1',
    systemPrompt: 'You are nixie.',
    providerPin: null,
  });

  expect(result).toStrictEqual({
    ok: false,
    error:
      "nixie refused a model request to glm-test-1: no tail of its 3 system blocks equals nixie's system prompt, so nixie cannot show that the CLI's blocks are gone",
  });
});
