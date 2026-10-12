import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GuestFrame } from '@heynixie/wire';
import {
  decodeTurnFrame,
  encodeFrame,
  encodeTurnFrame,
  guestFrameSchema,
  makeFrameDecoder,
} from '@heynixie/wire';
import { buildMockMessageFrame, buildMockTurnFrame } from '@heynixie/wire/test-utils';
import { runConversationGuest } from './run-conversation-guest';
import { buildStubToolServer } from './test-utils/build-stub-tool-server';
import { startStubModel } from './test-utils/start-stub-model';

async function setupTest() {
  const home = await mkdtemp(join(tmpdir(), 'nixie-guest-'));

  onTestFinished(() => rm(home, { recursive: true, force: true }));

  const model = startStubModel();

  onTestFinished(() => model.stop());

  const decode = makeFrameDecoder(1024 * 1024);
  const frames: GuestFrame[] = [];

  return {
    model,
    frames,

    // the guest's own environment: its home, its path, and the placeholder the grant replaces
    env: { HOME: home, PATH: process.env['PATH'] ?? '', ANTHROPIC_API_KEY: 'imp-placeholder' },
    write: (bytes: Uint8Array) => {
      frames.push(...decode(bytes).map((message) => decodeTurnFrame(guestFrameSchema, message)));
      return Promise.resolve();
    },
  };
}

test('it runs the turn the first frame starts and writes its frames framed', async () => {
  const ctx = await setupTest();
  const turn = buildMockTurnFrame({ profile: { baseURL: ctx.model.url } });

  ctx.model.addReplies({ text: 'Hello.' });
  await runConversationGuest({
    input: [encodeFrame(encodeTurnFrame(turn))],
    write: ctx.write,
    env: ctx.env,
    buildToolServer: () => buildStubToolServer().config,
  });

  expect(ctx.frames.map((frame) => frame.type)).toStrictEqual(['read', 'assistant', 'ended']);
});

test('it reaches the run tool endpoint over HTTP with the run bearer token', async () => {
  const ctx = await setupTest();
  const seen: (string | null)[] = [];
  const endpoint = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: (request) => {
      seen.push(request.headers.get('authorization'));
      return new Response('unauthorized', { status: 401 });
    },
  });

  onTestFinished(() => endpoint.stop(true));

  const turn = buildMockTurnFrame({
    profile: { baseURL: ctx.model.url },
    tools: { url: `http://127.0.0.1:${endpoint.port}`, token: 'run-token' },
  });

  await runConversationGuest({
    input: [encodeFrame(encodeTurnFrame(turn))],
    write: ctx.write,
    env: ctx.env,
  });

  expect(seen).toContain('Bearer run-token');
  expect(ctx.frames).toMatchObject([{ type: 'failed', reason: 'tools_not_connected' }]);
});

test('it answers a first frame that starts no turn with a failed frame', async () => {
  const ctx = await setupTest();
  const message = buildMockMessageFrame();

  await runConversationGuest({
    input: [encodeFrame(encodeTurnFrame(message))],
    write: ctx.write,
    env: ctx.env,
  });

  expect(ctx.frames).toStrictEqual([
    { type: 'failed', reason: 'error', detail: 'Error: the first host frame must start a turn' },
  ]);
});

test('it answers a turn frame that arrives while a turn runs with a failed frame', async () => {
  const ctx = await setupTest();
  const turn = buildMockTurnFrame({ profile: { baseURL: ctx.model.url } });

  ctx.model.addReplies({ text: 'Hello.' });
  await runConversationGuest({
    input: [encodeFrame(encodeTurnFrame(turn)), encodeFrame(encodeTurnFrame(turn))],
    write: ctx.write,
    env: ctx.env,
    buildToolServer: () => buildStubToolServer().config,
  });

  expect(ctx.frames).toStrictEqual([
    { type: 'failed', reason: 'error', detail: 'Error: a turn is already running' },
  ]);
});
