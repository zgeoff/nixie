import { expect, test } from 'bun:test';
import { buildCallCost } from '@heynixie/models/prices';
import type { ModelAPI } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import claudeCLIMessages from '../fixtures/claude-cli-messages.json';
import claudeCLIPinnedProvider from '../fixtures/claude-cli-pinned-provider.json';
import codexCLIResponses from '../fixtures/codex-cli-responses.json';
import type { ProxyRoute } from '../types';
import { buildReplyEstimate } from './build-reply-estimate';

function setupTest() {
  return {
    buildRoute: (fields: Partial<ProxyRoute> = {}): ProxyRoute => ({
      api: 'anthropic-messages',
      upstream: 'http://model.test',
      model: 'model-small',
      providerPin: null,
      prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      maxOutputTokens: null,
      ...fields,
    }),
  };
}

test.each([
  ['a route whose 1-hour cache write is its highest rate', {}, 1000],
  [
    'a route with long prompt rates and a body past its boundary',
    {
      prices: {
        input: 3,
        cacheWrite: 3.75,
        cacheWrite1h: 6,
        cachedInput: 0.3,
        output: 15,
        longPrompt: {
          overTokens: 200_000,
          input: 6,
          cacheWrite: 7.5,
          cacheWrite1h: 12,
          cachedInput: 0.6,
          output: 22.5,
        },
      },
    },
    300_000,
  ],
])(
  'it never estimates below the largest reply the request allows, for %s',
  (_case, routeFields, byteLength) => {
    const ctx = setupTest();
    const route = ctx.buildRoute(routeFields);

    const estimate = buildReplyEstimate({
      route,
      api: 'anthropic-messages',
      body: { max_tokens: 8000 },
      byteLength,
    });

    // the whole input in the costliest class, and every allowed output token
    const largest = buildCallCost(
      {
        uncachedInputTokens: 0,
        cacheWrite5mTokens: 0,
        cacheWrite1hTokens: byteLength + 4096,
        cacheReadTokens: 0,
        outputTokens: 8000,
      },
      route.prices,
    );

    invariant(estimate.kind === 'bounded', 'the request sets its output bound');

    expect(estimate.tokens).toBe(byteLength + 4096 + 8000);
    expect(largest).toBeLessThanOrEqual(estimate.dollars);
  },
);

test('it prices the input at the highest input rate and the output at the highest output rate', () => {
  const ctx = setupTest();

  const estimate = buildReplyEstimate({
    route: ctx.buildRoute({
      prices: {
        input: 3,
        cacheWrite: 3.75,
        cacheWrite1h: 6,
        cachedInput: 0.3,
        output: 15,
        longPrompt: {
          overTokens: 200_000,
          input: 6,
          cacheWrite: 7.5,
          cacheWrite1h: 12,
          cachedInput: 0.6,
          output: 22.5,
        },
      },
    }),
    api: 'anthropic-messages',
    body: { max_tokens: 1000 },
    byteLength: 904,
  });

  // 5,000 input tokens at $12 and 1,000 output tokens at $22.50, per million
  expect(estimate).toStrictEqual({
    kind: 'bounded',
    inputTokens: 5000,
    outputTokens: 1000,
    dollars: 0.0825,
    tokens: 6000,
  });
});

test('it takes the output bound of a Responses body with no max_output_tokens from the route', () => {
  const ctx = setupTest();

  const estimate = buildReplyEstimate({
    route: ctx.buildRoute({ api: 'openai-responses', maxOutputTokens: 32_000 }),
    api: 'openai-responses',
    body: { model: 'model-o', input: 'Review the plan.' },
    byteLength: 100,
  });

  expect(estimate).toMatchObject({ kind: 'bounded', outputTokens: 32_000 });
});

test('it takes the output bound from max_output_tokens when a Responses body sets it', () => {
  const ctx = setupTest();

  const estimate = buildReplyEstimate({
    route: ctx.buildRoute({ api: 'openai-responses', maxOutputTokens: 32_000 }),
    api: 'openai-responses',
    body: { model: 'model-o', max_output_tokens: 500 },
    byteLength: 100,
  });

  expect(estimate).toMatchObject({ kind: 'bounded', outputTokens: 500 });
});

test('it takes the route bound when a body sets a max_tokens that is not a positive integer', () => {
  const ctx = setupTest();

  const estimate = buildReplyEstimate({
    route: ctx.buildRoute({ maxOutputTokens: 64_000 }),
    api: 'anthropic-messages',
    body: { max_tokens: 0 },
    byteLength: 100,
  });

  expect(estimate).toMatchObject({ kind: 'bounded', outputTokens: 64_000 });
});

test('it leaves a Messages body with no bound on the output unbounded, with the field max_tokens', () => {
  const ctx = setupTest();

  const estimate = buildReplyEstimate({
    route: ctx.buildRoute(),
    api: 'anthropic-messages',
    body: { model: 'model-small', messages: [] },
    byteLength: 100,
  });

  expect(estimate).toStrictEqual({ kind: 'unbounded', field: 'max_tokens' });
});

test.each([
  ['an MCP server list', { mcp_servers: [{ name: 'files' }] }, 'mcp_servers'],
  ['a container', { container: 'container_1' }, 'container'],
  [
    'an image by URL in a message',
    {
      messages: [
        {
          role: 'user',
          content: [{ type: 'image', source: { type: 'url', url: 'https://img.test/a.png' } }],
        },
      ],
    },
    'messages.content.source',
  ],
  [
    'a document by file ID in a message',
    {
      messages: [
        { role: 'user', content: [{ type: 'document', source: { type: 'file', file_id: 'f' } }] },
      ],
    },
    'messages.content.source',
  ],
  [
    'an image by file ID in a tool result',
    {
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 't1',
              content: [{ type: 'image', source: { type: 'file', file_id: 'file_1' } }],
            },
          ],
        },
      ],
    },
    'messages.content.source',
  ],
])('it leaves a Messages request with %s unbounded, with its field', (_case, fields, field) => {
  const ctx = setupTest();

  const estimate = buildReplyEstimate({
    route: ctx.buildRoute(),
    api: 'anthropic-messages',
    body: { model: 'model-small', max_tokens: 1000, messages: [], ...fields },
    byteLength: 100,
  });

  expect(estimate).toStrictEqual({ kind: 'unbounded', field });
});

test('it keeps a Messages request with a base64 image, a text document and a null container bounded', () => {
  const ctx = setupTest();

  const estimate = buildReplyEstimate({
    route: ctx.buildRoute(),
    api: 'anthropic-messages',
    body: {
      model: 'model-small',
      max_tokens: 1000,
      container: null,
      mcp_servers: [],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
            { type: 'document', source: { type: 'text', media_type: 'text/plain', data: 'hi' } },
            { type: 'tool_use', id: 't1', name: 'look', input: { source: { type: 'url' } } },
          ],
        },
      ],
    },
    byteLength: 100,
  });

  expect(estimate.kind).toBe('bounded');
});

test.each([
  ['a previous response ID', { previous_response_id: 'resp_1' }, 'previous_response_id'],
  ['a conversation', { conversation: 'conv_1' }, 'conversation'],
  ['a stored prompt', { prompt: { id: 'pmpt_1' } }, 'prompt'],
  [
    'an item reference',
    { input: [{ type: 'item_reference', id: 'msg_1' }] },
    'input.item_reference',
  ],
  [
    'an image by file ID',
    {
      input: [{ role: 'user', content: [{ type: 'input_image', file_id: 'file_1' }] }],
    },
    'input.file_id',
  ],
  [
    'an image by URL',
    {
      input: [
        {
          role: 'user',
          content: [{ type: 'input_image', image_url: 'https://img.test/a.png' }],
        },
      ],
    },
    'input.image_url',
  ],
  [
    'a file by URL',
    {
      input: [
        { role: 'user', content: [{ type: 'input_file', file_url: 'https://f.test/a.pdf' }] },
      ],
    },
    'input.file_url',
  ],
  [
    'an input item that is itself an image by file ID',
    { input: [{ type: 'input_image', file_id: 'file_1' }] },
    'input.file_id',
  ],
])('it leaves a Responses request with %s unbounded, with its field', (_case, fields, field) => {
  const ctx = setupTest();

  const estimate = buildReplyEstimate({
    route: ctx.buildRoute({ api: 'openai-responses', maxOutputTokens: 1000 }),
    api: 'openai-responses',
    body: { model: 'model-o', input: [], ...fields },
    byteLength: 100,
  });

  expect(estimate).toStrictEqual({ kind: 'unbounded', field });
});

test('it keeps a Responses request with an image as a data URL bounded', () => {
  const ctx = setupTest();

  const estimate = buildReplyEstimate({
    route: ctx.buildRoute({ api: 'openai-responses', maxOutputTokens: 1000 }),
    api: 'openai-responses',
    body: {
      model: 'model-o',
      previous_response_id: null,
      input: [
        {
          role: 'user',
          content: [{ type: 'input_image', image_url: 'data:image/png;base64,AAAA' }],
        },
      ],
    },
    byteLength: 100,
  });

  expect(estimate.kind).toBe('bounded');
});

test.each([
  ['the Claude CLI Messages body', claudeCLIMessages, 'anthropic-messages'],
  ['the Claude CLI body with a pinned provider', claudeCLIPinnedProvider, 'anthropic-messages'],
  ['the Codex CLI Responses body', codexCLIResponses, 'openai-responses'],
] as const satisfies readonly (readonly [string, unknown, ModelAPI])[])(
  'it bounds %s, so a real client never leaves the count marked lost',
  (_case, body, api) => {
    const ctx = setupTest();

    const estimate = buildReplyEstimate({
      route: ctx.buildRoute({ api, maxOutputTokens: 64_000 }),
      api,
      body,
      byteLength: JSON.stringify(body).length,
    });

    expect(estimate.kind).toBe('bounded');
  },
);
