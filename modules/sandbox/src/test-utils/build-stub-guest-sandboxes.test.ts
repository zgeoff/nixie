import { expect, test } from 'bun:test';
import type { GuestFrame, HostFrame } from '@heynixie/wire';
import { decodeTurnFrame, encodeTurnFrame, guestFrameSchema } from '@heynixie/wire';
import { buildMockSummarizeFrame, buildMockTurnFrame } from '@heynixie/wire/test-utils';
import invariant from 'tiny-invariant';
import type { SandboxSpec } from '../types';
import { buildMockSandboxSpec } from './build-mock-sandbox-spec';
import { buildStubGuestSandboxes } from './build-stub-guest-sandboxes';
import type { StubGuestToolCaller } from './run-stub-guest-turn';
import { setupTestRecorder } from './setup-test-recorder';

const env = { HOME: '/home/nixie' };

async function setupTest(options: { readonly callTool?: StubGuestToolCaller } = {}) {
  const recorder = await setupTestRecorder();

  const stub = buildStubGuestSandboxes({
    recorder: recorder.recorder,
    ...(options.callTool === undefined ? {} : { callTool: options.callTool }),
  });

  const spec = buildMockSandboxSpec({ kind: 'conversation', owner: 'conversation' });

  return {
    recorder,
    stub,
    spec,

    // runs one guest on the sandbox: it sends the frame and returns every frame the guest answers with
    runGuest: async (
      sandbox: Awaited<ReturnType<typeof stub.adapter.create>>,
      frame: HostFrame,
      guestEnv: Readonly<Record<string, string>> = env,
    ): Promise<readonly GuestFrame[]> => {
      const stream = await sandbox.spawn({
        argv: ['guest'],
        env: guestEnv,
        maxMessageBytes: 1 << 20,
      });

      await stream.send(encodeTurnFrame(frame));

      const messages = await Array.fromAsync(stream.messages);

      return messages.map((message) => decodeTurnFrame(guestFrameSchema, message));
    },

    // runs one guest and returns its ended frame, which a turn that works always sends
    runEnded: async (
      sandbox: Awaited<ReturnType<typeof stub.adapter.create>>,
      frame: HostFrame,
    ): Promise<Extract<GuestFrame, { type: 'ended' }>> => {
      const stream = await sandbox.spawn({ argv: ['guest'], env, maxMessageBytes: 1 << 20 });

      await stream.send(encodeTurnFrame(frame));

      const messages = await Array.fromAsync(stream.messages);

      const ended = messages
        .map((message) => decodeTurnFrame(guestFrameSchema, message))
        .find((guestFrame) => guestFrame.type === 'ended');

      invariant(ended);

      return ended;
    },
  };
}

test('it ends a turn at a chain entry that the next turn resumes from', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);
  const first = await ctx.runEnded(sandbox, buildMockTurnFrame());
  const second = await ctx.runEnded(sandbox, buildMockTurnFrame({ resume: first.boundary }));

  expect(second.boundary.sessionID).not.toBe(first.boundary.sessionID);
});

test('it reads the inbox messages and replies with the queued reply, then with the default', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  ctx.stub.addReplies({ text: 'APPLE' });

  const input = [{ uuid: '6e697869-0000-8000-8000-000000000002', text: 'Say a fruit.' }];

  const queued = await ctx.runGuest(sandbox, buildMockTurnFrame({ input }));
  const defaulted = await ctx.runGuest(sandbox, buildMockTurnFrame({ input }));

  expect(queued.map((frame) => frame.type)).toStrictEqual(['read', 'assistant', 'ended']);

  expect(queued.slice(0, 2)).toMatchObject([
    { type: 'read', uuids: ['6e697869-0000-8000-8000-000000000002'] },
    { type: 'assistant', text: 'APPLE', toolUses: [] },
  ]);

  expect(defaulted[1]).toMatchObject({ type: 'assistant', text: 'Hello.' });
});

test('it fails a turn that resumes a session the sandbox does not hold', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  const resume = { sessionID: crypto.randomUUID(), messageID: crypto.randomUUID() };

  const frames = await ctx.runGuest(sandbox, buildMockTurnFrame({ resume }));

  expect(frames).toStrictEqual([
    {
      type: 'failed',
      reason: 'session_missing',
      detail: `No conversation found with session ID: ${resume.sessionID}`,
    },
  ]);
});

test('it fails a turn that resumes a chain entry the session does not hold', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);
  const first = await ctx.runEnded(sandbox, buildMockTurnFrame());

  const resume = { sessionID: first.boundary.sessionID, messageID: crypto.randomUUID() };

  const frames = await ctx.runGuest(sandbox, buildMockTurnFrame({ resume }));

  expect(frames).toStrictEqual([
    {
      type: 'failed',
      reason: 'error',
      detail: `No message found with message.uuid of: ${resume.messageID}`,
    },
  ]);
});

test('it fails a turn on a guest with no HOME', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);
  const frames = await ctx.runGuest(sandbox, buildMockTurnFrame(), {});

  expect(frames).toStrictEqual([
    { type: 'failed', reason: 'error', detail: 'the conversation guest needs HOME' },
  ]);
});

test('it removes every session but the one a turn resumes', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);
  const first = await ctx.runEnded(sandbox, buildMockTurnFrame());
  const second = await ctx.runEnded(sandbox, buildMockTurnFrame({ resume: first.boundary }));

  await ctx.runGuest(sandbox, buildMockTurnFrame({ resume: second.boundary }));

  const frames = await ctx.runGuest(sandbox, buildMockTurnFrame({ resume: first.boundary }));

  expect(frames).toMatchObject([{ type: 'failed', reason: 'session_missing' }]);
});

test('it grows the context size with each turn and reports the profile window', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  const profile = { contextTokens: 100_000 };
  const text = 'x'.repeat(400);

  const first = await ctx.runEnded(
    sandbox,
    buildMockTurnFrame({ profile, input: [{ uuid: crypto.randomUUID(), text }] }),
  );

  const second = await ctx.runEnded(
    sandbox,
    buildMockTurnFrame({
      profile,
      resume: first.boundary,
      input: [{ uuid: crypto.randomUUID(), text }],
    }),
  );

  expect(first.context).toStrictEqual({ size: 102, window: 100_000 });
  expect(second.context).toStrictEqual({ size: 204, window: 100_000 });
});

test('it reports a window of 200,000 tokens for a profile with no context cap', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);
  const ended = await ctx.runEnded(sandbox, buildMockTurnFrame());

  expect(ended.context?.window).toBe(200_000);
});

test('it ends the next turn at the context size a test sets, and the turn after it from there', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  ctx.stub.setContextSize(142_000);

  const first = await ctx.runEnded(sandbox, buildMockTurnFrame());
  const second = await ctx.runEnded(sandbox, buildMockTurnFrame({ resume: first.boundary }));

  expect(first.context?.size).toBe(142_000);
  expect(second.context?.size).toBeWithin(142_000, 142_200);
});

test('it ends a turn that overflows the window at the point it resumed, as an error', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);
  const first = await ctx.runEnded(sandbox, buildMockTurnFrame());

  ctx.stub.addReplies({ overflow: 'prompt_too_long' });

  const frames = await ctx.runGuest(sandbox, buildMockTurnFrame({ resume: first.boundary }));

  expect(frames.map((frame) => frame.type)).toStrictEqual(['assistant', 'ended']);

  expect(frames.at(-1)).toMatchObject({
    type: 'ended',
    boundary: first.boundary,
    isError: true,
    terminalReason: 'prompt_too_long',
  });
});

test('it calls the tool a reply asks for and replies after it, in the same turn', async () => {
  const calls: unknown[] = [];

  const ctx = await setupTest({
    callTool: (call) => {
      calls.push(call);

      return Promise.resolve('Buy oat milk.');
    },
  });

  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  ctx.stub.addReplies(
    { toolUse: { name: 'mcp__nixie__notes_read', input: {} } },
    { text: 'It says oat milk.' },
  );

  const frames = await ctx.runGuest(
    sandbox,
    buildMockTurnFrame({ tools: { token: 'step-token' } }),
  );

  expect(frames.map((frame) => frame.type)).toStrictEqual([
    'read',
    'assistant',
    'assistant',
    'ended',
  ]);

  expect(frames[1]).toMatchObject({
    type: 'assistant',
    text: '',
    toolUses: [{ name: 'mcp__nixie__notes_read' }],
  });

  expect(frames[2]).toMatchObject({ type: 'assistant', text: 'It says oat milk.' });

  expect(calls).toStrictEqual([
    {
      sandboxID: sandbox.id,
      owner: 'conversation',
      token: 'step-token',
      name: 'notes_read',
      input: {},
    },
  ]);
});

test('it fails a turn whose reply asks for a tool when the guest has no route to the tools', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  ctx.stub.addReplies({ toolUse: { name: 'mcp__nixie__notes_read', input: {} } });

  const frames = await ctx.runGuest(sandbox, buildMockTurnFrame());

  expect(frames).toStrictEqual([
    {
      type: 'failed',
      reason: 'error',
      detail: 'Error: the stub guest has no route to the tools',
    },
  ]);
});

test('it summarizes the session at the resume point from its own transcript, at a new chain entry', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  ctx.stub.addReplies({ text: 'The gauge reads 3.2 m.' });

  const first = await ctx.runEnded(sandbox, buildMockTurnFrame());
  const frames = await ctx.runGuest(sandbox, buildMockSummarizeFrame({ resume: first.boundary }));

  expect(frames).toStrictEqual([
    {
      type: 'summarized',
      boundary: { sessionID: expect.toBeString(), messageID: expect.toBeString() },
      text: 'Summary of the session: 2 entries, the last reply was "The gauge reads 3.2 m.".',
      usage: expect.toBeObject(),
    },
  ]);
});

test('it fails a summary of a session the sandbox does not hold', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  const frame = buildMockSummarizeFrame();

  const frames = await ctx.runGuest(sandbox, frame);

  expect(frames).toStrictEqual([
    {
      type: 'failed',
      reason: 'session_missing',
      detail: `No conversation found with session ID: ${frame.resume.sessionID}`,
    },
  ]);
});

test('it removes the sessions on a purge and answers purged', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);
  const first = await ctx.runEnded(sandbox, buildMockTurnFrame());
  const purge = await ctx.runGuest(sandbox, { type: 'purge' });
  const resumed = await ctx.runGuest(sandbox, buildMockTurnFrame({ resume: first.boundary }));

  expect(purge).toStrictEqual([{ type: 'purged' }]);
  expect(resumed).toMatchObject([{ type: 'failed', reason: 'session_missing' }]);
  expect(ctx.stub.purged).toStrictEqual([sandbox.id]);
});

test('it loses the sessions of the sandbox a test removes them from, and keeps the sessions of another', async () => {
  const ctx = await setupTest();
  const lost = await ctx.stub.adapter.create(ctx.spec);
  const kept = await ctx.stub.adapter.create(ctx.spec);
  const onLost = await ctx.runEnded(lost, buildMockTurnFrame());
  const onKept = await ctx.runEnded(kept, buildMockTurnFrame());

  ctx.stub.removeSessions(lost.id);

  const frames = await ctx.runGuest(lost, buildMockTurnFrame({ resume: onLost.boundary }));

  expect(frames).toMatchObject([{ type: 'failed', reason: 'session_missing' }]);

  const resumed = await ctx.runEnded(kept, buildMockTurnFrame({ resume: onKept.boundary }));

  expect(resumed.boundary.sessionID).not.toBe(onKept.boundary.sessionID);
});

test('it starts a replacement sandbox without the sessions of the one it replaces', async () => {
  const ctx = await setupTest();
  const old = await ctx.stub.adapter.create(ctx.spec);
  const first = await ctx.runEnded(old, buildMockTurnFrame());
  const replacement = await ctx.stub.adapter.create(ctx.spec);
  const frames = await ctx.runGuest(replacement, buildMockTurnFrame({ resume: first.boundary }));

  expect(frames).toMatchObject([{ type: 'failed', reason: 'session_missing' }]);
});

test('it carries a session into a sandbox through the host copy, and the next turn resumes it', async () => {
  const ctx = await setupTest();
  const from = await ctx.stub.adapter.create(ctx.spec);
  const to = await ctx.stub.adapter.create(ctx.spec);
  const first = await ctx.runEnded(from, buildMockTurnFrame());

  const sessionID = first.boundary.sessionID;

  const layout = await from.exec({ argv: ['sh', '-c', 'script', 'sh', sessionID], env, cwd: '/' });

  const [guestHome, home, file] = new TextDecoder().decode(layout.stdout.bytes).split('\n');

  const copied = await from.copyOut([`${guestHome}/.claude/projects/${file?.slice(2)}`]);

  await to.copyIn(copied.map((entry) => ({ path: `${entry.path}.copy`, content: entry.content })));

  const published = await to.exec({
    argv: ['mv', '-f', '--', `${sessionID}.jsonl.copy`, `${sessionID}.jsonl`],
    env,
    cwd: `${guestHome}/.claude/projects/${file?.split('/')[1]}`,
  });

  expect({ guestHome, home, code: layout.code, published: published.code }).toStrictEqual({
    guestHome: '/home/nixie',
    home: '/home/nixie',
    code: 0,
    published: 0,
  });

  const resumed = await ctx.runEnded(to, buildMockTurnFrame({ resume: first.boundary }));

  expect(resumed.boundary.sessionID).not.toBe(first.boundary.sessionID);
});

test('it lists no session file for a sandbox that holds no transcript of the session', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  const layout = await sandbox.exec({
    argv: ['sh', '-c', 'script', 'sh', crypto.randomUUID()],
    env,
    cwd: '/',
  });

  expect(new TextDecoder().decode(layout.stdout.bytes)).toBe('/home/nixie\n/home/nixie\n');
});

test('it fails each copy out of a sandbox a test makes fail, with the reason given', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  ctx.stub.failCopyOut(sandbox.id, 'EACCES: permission denied');

  expect(sandbox.copyOut(['/home/nixie/.claude/projects/x/y.jsonl'])).rejects.toThrow(
    'EACCES: permission denied',
  );
});

test('it refuses a command it does not know', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);
  const result = await sandbox.exec({ argv: ['rm', '-rf', '/'], env, cwd: '/' });

  expect(result.code).toBe(1);
});

test('it refuses a spawn and an exec on a sleeping sandbox until it wakes', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  expect(sandbox.suspension.kind).toBe('memory');

  if (sandbox.suspension.kind !== 'memory') {
    throw new Error('the stub sandbox sleeps');
  }

  await sandbox.suspension.sleep();

  const refused = await Promise.allSettled([
    sandbox.exec({ argv: ['sh'], env, cwd: '/' }),
    sandbox.spawn({ argv: ['guest'], env, maxMessageBytes: 1024 }),
  ]);

  await sandbox.suspension.wake();

  const woken = await sandbox.exec({ argv: ['sh'], env, cwd: '/' });

  expect(refused.map((result) => result.status)).toStrictEqual(['rejected', 'rejected']);
  expect(woken.code).toBe(1);

  const records = await ctx.recorder.readSandboxRecords();

  expect(records.map((record) => record.kind)).toStrictEqual([
    'sandbox.created',
    'sandbox.slept',
    'sandbox.woken',
  ]);
});

test('it lists the sandboxes the recorder holds for an owner, and drops one it destroys', async () => {
  const ctx = await setupTest();
  const first = await ctx.stub.adapter.create(ctx.spec);
  const second = await ctx.stub.adapter.create(ctx.spec);

  await first.destroy();

  const listed = await ctx.stub.adapter.list(ctx.spec.owner);

  expect(listed.map((sandbox) => sandbox.id)).toStrictEqual([second.id]);
  expect(ctx.stub.readSandboxIDs()).toStrictEqual([second.id]);

  const records = await ctx.recorder.readSandboxRecords();

  expect(records.map((record) => record.kind)).toStrictEqual([
    'sandbox.created',
    'sandbox.created',
    'sandbox.destroyed',
  ]);
});

test('it refuses a spec the real adapters refuse', async () => {
  const ctx = await setupTest();

  const spec: SandboxSpec = { ...ctx.spec, owner: '' };

  expect(ctx.stub.adapter.create(spec)).rejects.toThrow('no owner');
});

test('it records every frame the guests receive, in order, with the sandbox they reached', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  const turn = buildMockTurnFrame();

  const first = await ctx.runEnded(sandbox, turn);

  const summarize = buildMockSummarizeFrame({ resume: first.boundary });

  await ctx.runGuest(sandbox, summarize);
  await ctx.runGuest(sandbox, { type: 'purge' });

  expect(ctx.stub.received).toStrictEqual([
    { sandboxID: sandbox.id, frame: turn },
    { sandboxID: sandbox.id, frame: summarize },
    { sandboxID: sandbox.id, frame: { type: 'purge' } },
  ]);

  expect(ctx.stub.turns).toStrictEqual([turn]);
  expect(ctx.stub.summaries).toStrictEqual([summarize]);
});
