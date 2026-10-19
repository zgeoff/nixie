import { expect, test } from 'bun:test';
import { decodeTurnFrame, encodeTurnFrame, guestFrameSchema } from '@heynixie/wire';
import { buildMockSummarizeFrame, buildMockTurnFrame } from '@heynixie/wire/test-utils';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import type { SandboxSpec } from '../types';
import { buildMockSandboxSpec } from './build-mock-sandbox-spec';
import { buildStubGuestSandboxes } from './build-stub-guest-sandboxes';
import { runGuestFrame } from './run-guest-frame';
import type { StubGuestToolCaller } from './run-stub-guest-turn';
import { setupTestRecorder } from './setup-test-recorder';

const env = { HOME: '/home/nixie' };

async function setupTest(options: { readonly callTool?: StubGuestToolCaller } = {}) {
  const recorder = await setupTestRecorder();

  const stub = buildStubGuestSandboxes({
    recorder: recorder.recorder,
    countTokens: (text) => Math.ceil(text.length / 4),
    ...(options.callTool === undefined ? {} : { callTool: options.callTool }),
  });

  const spec = buildMockSandboxSpec({ kind: 'conversation', owner: 'conversation' });

  return { recorder, stub, spec };
}

test('it ends a turn at a chain entry that the next turn resumes from', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);
  const first = await runGuestFrame(sandbox, buildMockTurnFrame());

  invariant(first.ended !== null);

  const second = await runGuestFrame(sandbox, buildMockTurnFrame({ resume: first.ended.boundary }));

  invariant(second.ended !== null);

  expect(second.ended.boundary.sessionID).not.toBe(first.ended.boundary.sessionID);
});

test('it reads the inbox messages and replies with the queued reply, then with the default', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  ctx.stub.addReplies({ text: 'APPLE' });

  const input = [{ uuid: '6e697869-0000-8000-8000-000000000002', text: 'Say a fruit.' }];

  const queued = await runGuestFrame(sandbox, buildMockTurnFrame({ input }));
  const defaulted = await runGuestFrame(sandbox, buildMockTurnFrame({ input }));

  expect(queued.frames.map((frame) => frame.type)).toStrictEqual(['read', 'assistant', 'ended']);

  expect(queued.frames.slice(0, 2)).toMatchObject([
    { type: 'read', uuids: ['6e697869-0000-8000-8000-000000000002'] },
    { type: 'assistant', text: 'APPLE', toolUses: [] },
  ]);

  expect(defaulted.frames[1]).toMatchObject({ type: 'assistant', text: 'Hello.' });
});

test('it fails a turn that resumes a session the sandbox does not hold', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  const resume = { sessionID: crypto.randomUUID(), messageID: crypto.randomUUID() };

  const run = await runGuestFrame(sandbox, buildMockTurnFrame({ resume }));

  expect(run.frames).toStrictEqual([
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
  const first = await runGuestFrame(sandbox, buildMockTurnFrame());

  invariant(first.ended !== null);

  const resume = { sessionID: first.ended.boundary.sessionID, messageID: crypto.randomUUID() };

  const run = await runGuestFrame(sandbox, buildMockTurnFrame({ resume }));

  expect(run.frames).toStrictEqual([
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
  const run = await runGuestFrame(sandbox, buildMockTurnFrame(), {});

  expect(run.frames).toStrictEqual([
    { type: 'failed', reason: 'error', detail: 'the conversation guest needs HOME' },
  ]);
});

test('it removes every session but the one a turn resumes', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);
  const first = await runGuestFrame(sandbox, buildMockTurnFrame());

  invariant(first.ended !== null);

  const second = await runGuestFrame(sandbox, buildMockTurnFrame({ resume: first.ended.boundary }));

  invariant(second.ended !== null);

  await runGuestFrame(sandbox, buildMockTurnFrame({ resume: second.ended.boundary }));

  const run = await runGuestFrame(sandbox, buildMockTurnFrame({ resume: first.ended.boundary }));

  expect(run.frames).toMatchObject([{ type: 'failed', reason: 'session_missing' }]);
});

test('it grows the context size with each turn and reports the profile window', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  const profile = { contextTokens: 100_000 };
  const text = 'x'.repeat(400);

  const first = await runGuestFrame(
    sandbox,
    buildMockTurnFrame({ profile, input: [{ uuid: crypto.randomUUID(), text }] }),
  );

  invariant(first.ended !== null);

  const second = await runGuestFrame(
    sandbox,
    buildMockTurnFrame({
      profile,
      resume: first.ended.boundary,
      input: [{ uuid: crypto.randomUUID(), text }],
    }),
  );

  expect(first.ended.context).toStrictEqual({ size: 102, window: 100_000 });
  expect(second.ended?.context).toStrictEqual({ size: 204, window: 100_000 });
});

test('it reports a window of 200,000 tokens for a profile with no context cap', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);
  const run = await runGuestFrame(sandbox, buildMockTurnFrame());

  expect(run.ended?.context?.window).toBe(200_000);
});

test('it ends the next turn at the context size a test sets, and the turn after it from there', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  ctx.stub.setContextSize(142_000);

  const first = await runGuestFrame(sandbox, buildMockTurnFrame());

  invariant(first.ended !== null);

  const second = await runGuestFrame(sandbox, buildMockTurnFrame({ resume: first.ended.boundary }));

  expect(first.ended.context?.size).toBe(142_000);
  expect(second.ended?.context?.size).toBeWithin(142_000, 142_200);
});

test('it ends a turn that overflows the window at the point it resumed, as an error', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);
  const first = await runGuestFrame(sandbox, buildMockTurnFrame());

  invariant(first.ended !== null);

  ctx.stub.addReplies({ overflow: 'prompt_too_long' });

  const run = await runGuestFrame(sandbox, buildMockTurnFrame({ resume: first.ended.boundary }));

  expect(run.frames.map((frame) => frame.type)).toStrictEqual(['assistant', 'ended']);

  expect(run.frames.at(-1)).toMatchObject({
    type: 'ended',
    boundary: first.ended.boundary,
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

  const run = await runGuestFrame(sandbox, buildMockTurnFrame({ tools: { token: 'step-token' } }));

  expect(run.frames.map((frame) => frame.type)).toStrictEqual([
    'read',
    'assistant',
    'assistant',
    'ended',
  ]);

  expect(run.frames[1]).toMatchObject({
    type: 'assistant',
    text: '',
    toolUses: [{ name: 'mcp__nixie__notes_read' }],
  });

  expect(run.frames[2]).toMatchObject({ type: 'assistant', text: 'It says oat milk.' });

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

test('it ends a turn that overflows after a tool use at the tool result the next turn resumes from', async () => {
  const ctx = await setupTest({ callTool: () => Promise.resolve('Buy oat milk.') });
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  ctx.stub.addReplies(
    { toolUse: { name: 'mcp__nixie__notes_read', input: {} } },
    { overflow: 'prompt_too_long' },
  );

  const run = await runGuestFrame(sandbox, buildMockTurnFrame());

  invariant(run.ended !== null);

  const assistantIDs = run.frames.flatMap((frame) =>
    frame.type === 'assistant' ? [frame.messageID] : [],
  );

  expect(assistantIDs).toHaveLength(2);
  expect(run.ended).toMatchObject({ isError: true, terminalReason: 'prompt_too_long' });
  expect(assistantIDs).not.toContain(run.ended.boundary.messageID);

  const next = await runGuestFrame(sandbox, buildMockTurnFrame({ resume: run.ended.boundary }));

  invariant(next.ended !== null);

  expect(next.ended.isError).toBeUndefined();
});

test('it fails a turn whose reply asks for a tool when the guest has no route to the tools', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  ctx.stub.addReplies({ toolUse: { name: 'mcp__nixie__notes_read', input: {} } });

  const run = await runGuestFrame(sandbox, buildMockTurnFrame());

  expect(run.frames).toStrictEqual([
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

  const first = await runGuestFrame(sandbox, buildMockTurnFrame());

  invariant(first.ended !== null);

  const run = await runGuestFrame(
    sandbox,
    buildMockSummarizeFrame({ resume: first.ended.boundary }),
  );

  expect(run.frames).toStrictEqual([
    {
      type: 'summarized',
      boundary: { sessionID: expect.toBeString(), messageID: expect.toBeString() },
      text: 'Summary of the session: 2 entries, the last reply was "The gauge reads 3.2 m.".',
      usage: expect.toBeObject(),
    },
  ]);
});

test('it writes the summary as a fork that the next turn resumes from its boundary', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);
  const first = await runGuestFrame(sandbox, buildMockTurnFrame());

  invariant(first.ended !== null);

  const summary = await runGuestFrame(
    sandbox,
    buildMockSummarizeFrame({ resume: first.ended.boundary }),
  );

  const summarized = summary.frames.find((frame) => frame.type === 'summarized');

  invariant(summarized);

  const run = await runGuestFrame(sandbox, buildMockTurnFrame({ resume: summarized.boundary }));

  expect(run.frames.map((frame) => frame.type)).toStrictEqual(['read', 'assistant', 'ended']);
});

test('it writes the fork as the resumed transcript, then the instruction, then the summary', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  ctx.stub.addReplies({ text: 'The gauge reads 3.2 m.' });

  const first = await runGuestFrame(
    sandbox,
    buildMockTurnFrame({ input: [{ uuid: crypto.randomUUID(), text: 'Read the gauge.' }] }),
  );

  invariant(first.ended !== null);

  const summary = await runGuestFrame(
    sandbox,
    buildMockSummarizeFrame({
      resume: first.ended.boundary,
      instruction: 'Write a summary of this session.',
    }),
  );

  const summarized = summary.frames.find((frame) => frame.type === 'summarized');

  invariant(summarized);

  const [fork] = await sandbox.copyOut([
    `/home/nixie/.claude/projects/-home-nixie-conversation/${summarized.boundary.sessionID}.jsonl`,
  ]);

  invariant(fork !== undefined);

  const entries = new TextDecoder()
    .decode(fork.content)
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => z.object({ role: z.string(), text: z.string() }).parse(JSON.parse(line)));

  expect(entries).toStrictEqual([
    { role: 'user', text: 'Read the gauge.' },
    { role: 'assistant', text: 'The gauge reads 3.2 m.' },
    { role: 'user', text: 'Write a summary of this session.' },
    {
      role: 'assistant',
      text: 'Summary of the session: 2 entries, the last reply was "The gauge reads 3.2 m.".',
    },
  ]);
});

test('it fails a turn that resumes a malformed transcript, and ends its output', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  const sessionID = crypto.randomUUID();

  await sandbox.copyIn([
    {
      path: `/home/nixie/.claude/projects/-home-nixie-conversation/${sessionID}.jsonl`,
      content: new TextEncoder().encode('not a transcript\n'),
    },
  ]);

  const resume = { sessionID, messageID: crypto.randomUUID() };

  const run = await runGuestFrame(sandbox, buildMockTurnFrame({ resume }));

  expect(run.frames).toStrictEqual([
    { type: 'failed', reason: 'error', detail: expect.toStartWith('SyntaxError') },
  ]);
});

test('it fails a summary of a session the sandbox does not hold', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  const frame = buildMockSummarizeFrame();

  const run = await runGuestFrame(sandbox, frame);

  expect(run.frames).toStrictEqual([
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
  const first = await runGuestFrame(sandbox, buildMockTurnFrame());

  invariant(first.ended !== null);

  const purge = await runGuestFrame(sandbox, { type: 'purge' });

  const resumed = await runGuestFrame(
    sandbox,
    buildMockTurnFrame({ resume: first.ended.boundary }),
  );

  expect(purge.frames).toStrictEqual([{ type: 'purged' }]);
  expect(resumed.frames).toMatchObject([{ type: 'failed', reason: 'session_missing' }]);
  expect(ctx.stub.purged).toStrictEqual([sandbox.id]);
});

test('it loses the sessions of the sandbox a test removes them from, and keeps the sessions of another', async () => {
  const ctx = await setupTest();
  const lost = await ctx.stub.adapter.create({ ...ctx.spec, owner: 'lost-owner' });
  const kept = await ctx.stub.adapter.create(ctx.spec);
  const onLost = await runGuestFrame(lost, buildMockTurnFrame());
  const onKept = await runGuestFrame(kept, buildMockTurnFrame());

  invariant(onLost.ended !== null);
  invariant(onKept.ended !== null);

  ctx.stub.removeSessions('lost-owner');

  const run = await runGuestFrame(lost, buildMockTurnFrame({ resume: onLost.ended.boundary }));

  expect(run.frames).toMatchObject([{ type: 'failed', reason: 'session_missing' }]);

  const resumed = await runGuestFrame(kept, buildMockTurnFrame({ resume: onKept.ended.boundary }));

  invariant(resumed.ended !== null);

  expect(resumed.ended.boundary.sessionID).not.toBe(onKept.ended.boundary.sessionID);
});

test('it starts a replacement sandbox without the sessions of the one it replaces', async () => {
  const ctx = await setupTest();
  const old = await ctx.stub.adapter.create(ctx.spec);
  const first = await runGuestFrame(old, buildMockTurnFrame());

  invariant(first.ended !== null);

  const replacement = await ctx.stub.adapter.create(ctx.spec);

  const run = await runGuestFrame(
    replacement,
    buildMockTurnFrame({ resume: first.ended.boundary }),
  );

  expect(run.frames).toMatchObject([{ type: 'failed', reason: 'session_missing' }]);
});

test('it carries a session into a sandbox through the host copy, and the next turn resumes it', async () => {
  const ctx = await setupTest();
  const from = await ctx.stub.adapter.create(ctx.spec);
  const to = await ctx.stub.adapter.create(ctx.spec);
  const first = await runGuestFrame(from, buildMockTurnFrame());

  invariant(first.ended !== null);

  const projectsDir = '/home/nixie/.claude/projects';

  const [file] = await from.collectFiles(projectsDir);

  invariant(file !== undefined);

  const copied = await from.copyOut([`${projectsDir}/${file}`]);

  await to.copyIn(copied.map((entry) => ({ path: `${entry.path}.copy`, content: entry.content })));
  await to.applyMove(`${projectsDir}/${file}.copy`, `${projectsDir}/${file}`);

  const resumed = await runGuestFrame(to, buildMockTurnFrame({ resume: first.ended.boundary }));

  invariant(resumed.ended !== null);

  expect(resumed.ended.boundary.sessionID).not.toBe(first.ended.boundary.sessionID);
});

test("it gives the command's HOME as both forms of the guest's home", async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);
  const home = await sandbox.resolveHome({ HOME: '/home/nixie' });

  expect(home).toStrictEqual({
    copyPath: '/home/nixie',
    ownPath: '/home/nixie',
  });
});

test('it refuses the home of a guest command with no HOME', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  expect(sandbox.resolveHome({})).rejects.toThrow('the guest command sets no HOME');
});

test("it gives a guest command with no HOME the guest's root, which is the sandbox's folder under the host root", async () => {
  const ctx = await setupTest();

  const stub = buildStubGuestSandboxes({
    recorder: ctx.recorder.recorder,
    countTokens: (text) => Math.ceil(text.length / 4),
    hostRoot: '/srv/sandboxes',
  });

  const sandbox = await stub.adapter.create(ctx.spec);
  const home = await sandbox.resolveHome({});

  expect(home).toStrictEqual({ copyPath: '/', ownPath: `/srv/sandboxes/${sandbox.id}` });
});

test('it runs a turn with no HOME under the host root, in the project folder of the guest root', async () => {
  const ctx = await setupTest();

  const stub = buildStubGuestSandboxes({
    recorder: ctx.recorder.recorder,
    countTokens: (text) => Math.ceil(text.length / 4),
    hostRoot: '/srv/sandboxes',
  });

  const sandbox = await stub.adapter.create(ctx.spec);
  const run = await runGuestFrame(sandbox, buildMockTurnFrame(), {});

  invariant(run.ended !== null);

  const listed = await sandbox.collectFiles('/.claude/projects');

  expect(listed).toStrictEqual([
    `-srv-sandboxes-${sandbox.id}-conversation/${run.ended.boundary.sessionID}.jsonl`,
  ]);
});

test('it lists every file under a directory at any depth, relative to it', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  await sandbox.copyIn([
    { path: '/home/nixie/work/a.txt', content: new TextEncoder().encode('a') },
    { path: '/home/nixie/work/deep/b.txt', content: new TextEncoder().encode('b') },
    { path: '/home/nixie/workshop/c.txt', content: new TextEncoder().encode('c') },
  ]);

  const listed = await sandbox.collectFiles('/home/nixie/work');

  expect(listed).toIncludeSameMembers(['a.txt', 'deep/b.txt']);
});

test('it lists no file deeper than the depth bound', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  await sandbox.copyIn([
    { path: '/home/nixie/work/a.txt', content: new TextEncoder().encode('a') },
    { path: '/home/nixie/work/one/b.txt', content: new TextEncoder().encode('b') },
    { path: '/home/nixie/work/one/two/c.txt', content: new TextEncoder().encode('c') },
  ]);

  const listed = await sandbox.collectFiles('/home/nixie/work', { maxDepth: 2 });

  expect(listed).toIncludeSameMembers(['a.txt', 'one/b.txt']);
});

test('it lists no file under a directory the sandbox does not hold', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);
  const listed = await sandbox.collectFiles('/home/nixie/.claude/projects');

  expect(listed).toStrictEqual([]);
});

test('it moves a file over the one at the target, leaving none at the source', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  await sandbox.copyIn([
    { path: '/home/nixie/new.txt', content: new TextEncoder().encode('new') },
    { path: '/home/nixie/old.txt', content: new TextEncoder().encode('old') },
  ]);

  await sandbox.applyMove('/home/nixie/new.txt', '/home/nixie/old.txt');

  const [moved] = await sandbox.copyOut(['/home/nixie/old.txt']);
  const listed = await sandbox.collectFiles('/home/nixie');

  expect(new TextDecoder().decode(moved?.content)).toBe('new');
  expect(listed).toStrictEqual(['old.txt']);
});

test('it refuses to move a file the sandbox does not hold', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  expect(sandbox.applyMove('/home/nixie/a.txt', '/home/nixie/b.txt')).rejects.toThrow(
    "ENOENT: no such file or directory, rename '/home/nixie/a.txt' -> '/home/nixie/b.txt'",
  );
});

test('it refuses to move a file onto a directory, and keeps the file', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  await sandbox.copyIn([
    { path: '/home/nixie/a.txt', content: new TextEncoder().encode('a') },
    { path: '/home/nixie/dir/b.txt', content: new TextEncoder().encode('b') },
  ]);

  const failure = await sandbox.applyMove('/home/nixie/a.txt', '/home/nixie/dir').then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toStrictEqual(
    new Error(
      "EISDIR: illegal operation on a directory, rename '/home/nixie/a.txt' -> '/home/nixie/dir'",
    ),
  );

  const listed = await sandbox.collectFiles('/home/nixie');

  expect(listed).toIncludeSameMembers(['a.txt', 'dir/b.txt']);
});

test('it fails each copy out of a sandbox a test makes fail, with the reason given', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  ctx.stub.failCopyOut(ctx.spec.owner, 'EACCES: permission denied');

  expect(sandbox.copyOut(['/home/nixie/.claude/projects/x/y.jsonl'])).rejects.toThrow(
    'EACCES: permission denied',
  );
});

test('it refuses every command', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  expect(sandbox.exec({ argv: ['true'], env, cwd: '/' })).rejects.toThrow(
    'the stub sandbox runs no command',
  );
});

test('it refuses a spawn, a list and a move on a sleeping sandbox until it wakes', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  expect(sandbox.suspension.kind).toBe('memory');

  if (sandbox.suspension.kind !== 'memory') {
    throw new Error('the stub sandbox sleeps');
  }

  await sandbox.copyIn([{ path: '/home/nixie/a.txt', content: new TextEncoder().encode('a') }]);
  await sandbox.suspension.sleep();

  const refused = await Promise.allSettled([
    sandbox.spawn({ argv: ['guest'], env, maxMessageBytes: 1024 }),
    sandbox.collectFiles('/home/nixie'),
    sandbox.applyMove('/home/nixie/a.txt', '/home/nixie/b.txt'),
  ]);

  await sandbox.suspension.wake();

  const woken = await sandbox.collectFiles('/home/nixie');

  expect(refused.map((result) => result.status)).toStrictEqual([
    'rejected',
    'rejected',
    'rejected',
  ]);

  expect(woken).toStrictEqual(['a.txt']);

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

  const first = await runGuestFrame(sandbox, turn);

  invariant(first.ended !== null);

  const summarize = buildMockSummarizeFrame({ resume: first.ended.boundary });

  await runGuestFrame(sandbox, summarize);
  await runGuestFrame(sandbox, { type: 'purge' });

  expect(ctx.stub.received).toStrictEqual([
    { sandboxID: sandbox.id, frame: turn },
    { sandboxID: sandbox.id, frame: summarize },
    { sandboxID: sandbox.id, frame: { type: 'purge' } },
  ]);

  expect(ctx.stub.turns).toStrictEqual([turn]);
  expect(ctx.stub.summaries).toStrictEqual([summarize]);
});

test('it finds the files that hold a text, and none once a purge removed them', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  await runGuestFrame(
    sandbox,
    buildMockTurnFrame({ input: [{ uuid: crypto.randomUUID(), text: 'the blue flowerpot' }] }),
  );

  const held = ctx.stub.collectFilesWithText('blue flowerpot');

  await runGuestFrame(sandbox, { type: 'purge' });

  expect(held).toStrictEqual([expect.toEndWith('.jsonl')]);
  expect(ctx.stub.collectFilesWithText('blue flowerpot')).toStrictEqual([]);
});

test('it answers each inbox message of a turn in its own call, with a result for each, in one session', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  ctx.stub.addReplies({ text: 'APPLE' }, { text: 'BANANA' });

  const input = [
    { uuid: '6e697869-0000-8000-8000-000000000001', text: 'Say a fruit.' },
    { uuid: '6e697869-0000-8000-8000-000000000002', text: 'Another.' },
  ];

  const run = await runGuestFrame(sandbox, buildMockTurnFrame({ input }));

  expect(run.frames).toMatchObject([
    { type: 'read', uuids: ['6e697869-0000-8000-8000-000000000001'] },
    { type: 'assistant', text: 'APPLE' },
    { type: 'ended' },
    { type: 'read', uuids: ['6e697869-0000-8000-8000-000000000002'] },
    { type: 'assistant', text: 'BANANA' },
    { type: 'ended' },
  ]);

  const [first, second] = run.frames.filter((frame) => frame.type === 'ended');

  expect(first?.boundary.sessionID).toBe(second?.boundary.sessionID);
  expect(first?.boundary.messageID).not.toBe(second?.boundary.messageID);
});

test('it answers a live message that arrives during a tool call, in the same session', async () => {
  const live = { uuid: '6e697869-0000-8000-8000-000000000009', text: 'Also, the milk.' };
  const release = Promise.withResolvers<string>();

  const ctx = await setupTest({ callTool: () => release.promise });
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  ctx.stub.addReplies(
    { toolUse: { name: 'mcp__nixie__notes_read', input: {} } },
    { text: 'It says oat milk.' },
    { text: 'Noted the milk.' },
  );

  const stream = await sandbox.spawn({ argv: ['guest'], env, maxMessageBytes: 1 << 20 });

  // the turn runs up to its tool call within the send, and waits there on the release
  await stream.send(encodeTurnFrame(buildMockTurnFrame()));
  await stream.send(encodeTurnFrame({ type: 'message', message: live }));

  release.resolve('Buy oat milk.');

  const messages = await Array.fromAsync(stream.messages);

  const frames = messages.map((message) => decodeTurnFrame(guestFrameSchema, message));

  expect(frames.map((frame) => frame.type)).toStrictEqual([
    'read',
    'assistant',
    'assistant',
    'ended',
    'read',
    'assistant',
    'ended',
  ]);

  expect(frames).toContainEqual({ type: 'read', uuids: [live.uuid] });

  expect(
    frames.some((frame) => frame.type === 'assistant' && frame.text === 'Noted the milk.'),
  ).toBe(true);

  const [first, second] = frames.filter((frame) => frame.type === 'ended');

  expect(first?.boundary.sessionID).toBe(second?.boundary.sessionID);
});

test('it writes no transcript from a turn the host stopped during a tool call, so a purge after the stop holds', async () => {
  const release = Promise.withResolvers<string>();

  const ctx = await setupTest({ callTool: () => release.promise });
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  ctx.stub.addReplies({ toolUse: { name: 'mcp__nixie__notes_read', input: {} } });

  const stream = await sandbox.spawn({ argv: ['guest'], env, maxMessageBytes: 1 << 20 });

  const turn = buildMockTurnFrame({
    input: [{ uuid: crypto.randomUUID(), text: 'the blue flowerpot' }],
  });

  // the turn runs up to its tool call within the send, and waits there on the release
  await stream.send(encodeTurnFrame(turn));

  const stopping = stream.stop();

  await runGuestFrame(sandbox, { type: 'purge' });

  release.resolve('Buy oat milk.');

  const exited = await stopping;

  expect(exited.signal).toBe('SIGTERM');
  expect(ctx.stub.collectFilesWithText('blue flowerpot')).toStrictEqual([]);
});

test('it keeps the frames and transcript of an input that completed before a stop', async () => {
  const release = Promise.withResolvers<string>();

  const ctx = await setupTest({ callTool: () => release.promise });
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  ctx.stub.addReplies(
    { text: 'APPLE' },
    { toolUse: { name: 'mcp__nixie__notes_read', input: {} } },
  );

  const stream = await sandbox.spawn({ argv: ['guest'], env, maxMessageBytes: 1 << 20 });

  const input = [
    { uuid: '6e697869-0000-8000-8000-000000000001', text: 'Say a fruit.' },
    { uuid: '6e697869-0000-8000-8000-000000000002', text: 'Read my notes.' },
  ];

  await stream.send(encodeTurnFrame(buildMockTurnFrame({ input })));

  // the first input's three frames arrive while the second waits at its tool call
  const messages = stream.messages[Symbol.asyncIterator]();
  const sent = [await messages.next(), await messages.next(), await messages.next()];

  await stream.stop();

  const after = await messages.next();

  expect(
    sent.map((read) => {
      invariant(read.done !== true);

      return decodeTurnFrame(guestFrameSchema, read.value);
    }),
  ).toMatchObject([
    { type: 'read', uuids: ['6e697869-0000-8000-8000-000000000001'] },
    { type: 'assistant', text: 'APPLE' },
    { type: 'ended' },
  ]);

  expect(after.done).toBe(true);
  expect(ctx.stub.collectFilesWithText('APPLE')).toStrictEqual([expect.toEndWith('.jsonl')]);
  expect(ctx.stub.collectFilesWithText('Read my notes.')).toStrictEqual([]);
});

test('it keeps the inputs that completed before a later input fails, and resumes from them', async () => {
  const ctx = await setupTest();
  const sandbox = await ctx.stub.adapter.create(ctx.spec);

  ctx.stub.addReplies(
    { text: 'APPLE' },
    { toolUse: { name: 'mcp__nixie__notes_read', input: {} } },
  );

  const input = [
    { uuid: '6e697869-0000-8000-8000-000000000001', text: 'Say a fruit.' },
    { uuid: '6e697869-0000-8000-8000-000000000002', text: 'Read my notes.' },
  ];

  const run = await runGuestFrame(sandbox, buildMockTurnFrame({ input }));

  expect(run.frames).toMatchObject([
    { type: 'read', uuids: ['6e697869-0000-8000-8000-000000000001'] },
    { type: 'assistant', text: 'APPLE' },
    { type: 'ended' },
    { type: 'failed', reason: 'error' },
  ]);

  invariant(run.ended !== null);

  const next = await runGuestFrame(sandbox, buildMockTurnFrame({ resume: run.ended.boundary }));

  invariant(next.ended !== null);

  expect(next.ended.isError).toBeUndefined();
});
