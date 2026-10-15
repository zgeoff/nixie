import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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
import { startStubHTTPToolServer } from './test-utils/start-stub-http-tool-server';
import { startStubModel } from './test-utils/start-stub-model';

async function setupTest() {
  const home = await mkdtemp(join(tmpdir(), 'nixie-guest-'));

  onTestFinished(() => rm(home, { recursive: true, force: true }));

  const model = startStubModel();

  onTestFinished(() => model.stop());

  const decode = makeFrameDecoder(1024 * 1024);
  const frames: GuestFrame[] = [];

  return {
    home,
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

test('it answers a turn whose tool server connection failed at start, after one reconnect', async () => {
  const ctx = await setupTest();

  const turn = buildMockTurnFrame({ profile: { baseURL: ctx.model.url } });

  const tools = await startStubHTTPToolServer();

  onTestFinished(() => tools.stop());

  tools.dropConnections();
  ctx.model.addReplies({ text: 'Hello.' });

  await runConversationGuest({
    input: [encodeFrame(encodeTurnFrame(turn))],
    write: ctx.write,
    env: ctx.env,
    buildToolServer: () => tools.config,

    // the guest pauses only once the CLI reports the server failed, and the route then takes the
    // reconnect
    waitBeforeReconnect: tools.acceptConnections,
  });

  expect(ctx.frames.map((frame) => frame.type)).toStrictEqual(['read', 'assistant', 'ended']);

  expect(ctx.model.requests.filter((request) => request.path === '/v1/messages')).toMatchObject([
    { body: { tools: [{ name: 'mcp__nixie__note_read' }] } },
  ]);

  expect(tools.resets()).toBeGreaterThanOrEqual(1);
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
    waitBeforeReconnect: () => Promise.resolve(),
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
    {
      type: 'failed',
      reason: 'error',
      detail: 'Error: the first host frame must start a turn or purge the session',
    },
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

test('it removes every session transcript and the working directory on a purge frame', async () => {
  const ctx = await setupTest();

  const turn = buildMockTurnFrame({ profile: { baseURL: ctx.model.url } });

  ctx.model.addReplies({ text: 'Hello.' });

  await runConversationGuest({
    input: [encodeFrame(encodeTurnFrame(turn))],
    write: ctx.write,
    env: ctx.env,
    buildToolServer: () => buildStubToolServer().config,
  });

  const before = await readdir(ctx.home);

  await runConversationGuest({
    input: [encodeFrame(encodeTurnFrame({ type: 'purge' }))],
    write: ctx.write,
    env: ctx.env,
  });

  const after = await readdir(ctx.home);

  expect(before).toIncludeAllMembers(['.claude', 'conversation']);
  expect(after).not.toIncludeAnyMembers(['.claude', 'conversation']);
  expect(ctx.frames.at(-1)).toStrictEqual({ type: 'purged' });
});

test('it never removes a file in the guest home outside the session state on a purge frame', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.home, 'keep.txt'), 'not session state');

  await runConversationGuest({
    input: [encodeFrame(encodeTurnFrame({ type: 'purge' }))],
    write: ctx.write,
    env: ctx.env,
  });

  const kept = await readFile(join(ctx.home, 'keep.txt'), 'utf8');

  expect(kept).toBe('not session state');
  expect(ctx.frames).toStrictEqual([{ type: 'purged' }]);
});
