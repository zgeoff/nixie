import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkReplySchema, decodeTurnFrame, encodeFrame, makeFrameDecoder } from '@heynixie/wire';
import { runCheckGuest } from './run-check-guest';
import { startStubModel } from './test-utils/start-stub-model';

async function setupTest() {
  const home = await mkdtemp(join(tmpdir(), 'nixie-check-'));

  onTestFinished(() => rm(home, { recursive: true, force: true }));

  const model = startStubModel();

  onTestFinished(() => model.stop());

  const written: Uint8Array[] = [];

  return {
    model,
    written,
    io: {
      // the guest's own environment: its home, its path, and the placeholder the grant replaces
      env: { HOME: home, PATH: process.env['PATH'] ?? '', ANTHROPIC_API_KEY: 'imp-placeholder' },
      write: (bytes: Uint8Array) => {
        written.push(bytes);

        return Promise.resolve();
      },
    },
  };
}

test('it answers a check request with the model verdict in one reply frame', async () => {
  const ctx = await setupTest();

  const request = {
    profile: {
      model: 'claude-sonnet-5-5',
      baseURL: ctx.model.url,
      effort: 'low',
      authHeader: 'x-api-key',
    },
    systemPrompt: 'You check one candidate memory.',
    input: '<owner_message>\nI take my coffee black\n</owner_message>',
  };

  const bytes = new TextEncoder().encode(JSON.stringify(request));

  ctx.model.addReplies({
    toolUse: {
      name: 'StructuredOutput',
      input: { verdict: 'asserted', reason: 'The owner states it.' },
    },
  });

  await runCheckGuest({ ...ctx.io, input: [encodeFrame(bytes)] });

  const [frame] = makeFrameDecoder(1024 * 1024)(ctx.written[0] ?? new Uint8Array());

  expect(frame && decodeTurnFrame(checkReplySchema, frame)).toStrictEqual({
    kind: 'answer',
    output: { verdict: 'asserted', reason: 'The owner states it.' },
    costUSD: expect.toBeNumber(),
    durationMs: expect.toBeNumber(),
    apiMs: expect.toBeNumber(),
  });
});

test('it sends a check input of /clear to the model as text, never as a CLI command', async () => {
  const ctx = await setupTest();

  const request = {
    profile: {
      model: 'claude-sonnet-5-5',
      baseURL: ctx.model.url,
      effort: 'low',
      authHeader: 'x-api-key',
    },
    systemPrompt: 'You check one candidate memory.',
    input: '/clear',
  };

  const bytes = new TextEncoder().encode(JSON.stringify(request));

  ctx.model.addReplies({
    toolUse: {
      name: 'StructuredOutput',
      input: { verdict: 'asserted', reason: 'The owner states it.' },
    },
  });

  await runCheckGuest({ ...ctx.io, input: [encodeFrame(bytes)] });

  const sent = ctx.model.requests.findLast((candidate) => candidate.path === '/v1/messages');

  expect(sent?.body?.messages).toPartiallyContain({
    role: 'user',
    content: [{ type: 'text', text: '/clear' }],
  });
});

test('it answers a malformed request with a failed reply', async () => {
  const ctx = await setupTest();

  const bytes = new TextEncoder().encode(JSON.stringify({ input: '' }));

  await runCheckGuest({ ...ctx.io, input: [encodeFrame(bytes)] });

  const [frame] = makeFrameDecoder(1024 * 1024)(ctx.written[0] ?? new Uint8Array());

  expect(frame && decodeTurnFrame(checkReplySchema, frame)).toMatchObject({ kind: 'failed' });
});

test('it answers an empty input stream with a failed reply', async () => {
  const ctx = await setupTest();

  await runCheckGuest({ ...ctx.io, input: [] });

  const [frame] = makeFrameDecoder(1024 * 1024)(ctx.written[0] ?? new Uint8Array());

  expect(frame && decodeTurnFrame(checkReplySchema, frame)).toStrictEqual({
    kind: 'failed',
    reason: 'Error: the host sent no check request',
  });
});
