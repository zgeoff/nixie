import { expect, mock, test } from 'bun:test';
import { countTextTokens } from '@heynixie/compaction';
import {
  buildMockSandboxSpec,
  buildStubGuestSandboxes,
  setupTestRecorder,
} from '@heynixie/sandbox/test-utils';
import invariant from 'tiny-invariant';
import { writeKeptSession } from './write-kept-session';

// The fake guest sandboxes, each with a disk of its own, so a file reaches the replacement only
// through the copy.
async function setupTest() {
  const recorder = await setupTestRecorder();

  const stub = buildStubGuestSandboxes({
    recorder: recorder.recorder,
    countTokens: countTextTokens,
  });

  const spec = buildMockSandboxSpec({ kind: 'conversation', owner: 'conversation' });

  return { recorder: recorder.recorder, adapter: stub.adapter, spec };
}

test("it carries the session under the project folder that the destination guest's own home names", async () => {
  const ctx = await setupTest();

  const stub = buildStubGuestSandboxes({
    recorder: ctx.recorder,
    countTokens: countTextTokens,
    hostRoot: '/srv/sandboxes',
  });

  const from = await stub.adapter.create(ctx.spec);
  const to = await stub.adapter.create(ctx.spec);

  const sessionID = crypto.randomUUID();

  await from.copyIn([
    {
      path: `/.claude/projects/-srv-sandboxes-${from.id}-conversation/${sessionID}.jsonl`,
      content: new TextEncoder().encode('{"uuid":"a"}\n'),
    },
  ]);

  await writeKeptSession({ from, to, command: { argv: ['guest'], env: {} }, sessionID });

  const landed = await to.collectFiles('/.claude/projects');

  const [transcript] = await to.copyOut([
    `/.claude/projects/-srv-sandboxes-${to.id}-conversation/${sessionID}.jsonl`,
  ]);

  expect(landed).toStrictEqual([`-srv-sandboxes-${to.id}-conversation/${sessionID}.jsonl`]);
  expect(new TextDecoder().decode(transcript?.content)).toBe('{"uuid":"a"}\n');
});

test('it carries the transcript and side folder into the replacement, with no staged copy left', async () => {
  const ctx = await setupTest();
  const from = await ctx.adapter.create(ctx.spec);
  const to = await ctx.adapter.create(ctx.spec);

  const sessionID = crypto.randomUUID();
  const otherID = crypto.randomUUID();

  await from.copyIn([
    {
      path: `/home/nixie/.claude/projects/-home-nixie-conversation/${sessionID}.jsonl`,
      content: new TextEncoder().encode('{"uuid":"a"}\n'),
    },
    {
      path: `/home/nixie/.claude/projects/-home-nixie-conversation/${sessionID}/subagents/agent-1.jsonl`,
      content: new TextEncoder().encode('{"uuid":"b"}\n'),
    },
    {
      path: `/home/nixie/.claude/projects/-home-nixie-conversation/${otherID}.jsonl`,
      content: new TextEncoder().encode('{"uuid":"c"}\n'),
    },
  ]);

  await writeKeptSession({
    from,
    to,
    command: { argv: ['guest'], env: { HOME: '/home/nixie' } },
    sessionID,
  });

  const landed = await to.collectFiles('/home/nixie/.claude/projects');

  const [transcript] = await to.copyOut([
    `/home/nixie/.claude/projects/-home-nixie-conversation/${sessionID}.jsonl`,
  ]);

  expect(landed).toIncludeSameMembers([
    `-home-nixie-conversation/${sessionID}.jsonl`,
    `-home-nixie-conversation/${sessionID}/subagents/agent-1.jsonl`,
  ]);

  expect(new TextDecoder().decode(transcript?.content)).toBe('{"uuid":"a"}\n');
});

test("it lists only the transcripts and the session's own side folder, and copies no other session's files", async () => {
  const ctx = await setupTest();
  const source = await ctx.adapter.create(ctx.spec);
  const to = await ctx.adapter.create(ctx.spec);

  const sessionID = crypto.randomUUID();
  const otherID = crypto.randomUUID();

  await source.copyIn([
    {
      path: `/home/nixie/.claude/projects/-home-nixie-conversation/${sessionID}.jsonl`,
      content: new TextEncoder().encode('{"uuid":"a"}\n'),
    },
    {
      path: `/home/nixie/.claude/projects/-home-nixie-conversation/${sessionID}/subagents/agent-1.jsonl`,
      content: new TextEncoder().encode('{"uuid":"b"}\n'),
    },
    {
      path: `/home/nixie/.claude/projects/-home-nixie-conversation/${otherID}.jsonl`,
      content: new TextEncoder().encode('{"uuid":"c"}\n'),
    },
    {
      path: `/home/nixie/.claude/projects/-home-nixie-conversation/${otherID}/subagents/agent-2.jsonl`,
      content: new TextEncoder().encode('{"uuid":"d"}\n'),
    },
    {
      path: `/home/nixie/.claude/projects/-home-nixie-other/${otherID}/subagents/agent-3.jsonl`,
      content: new TextEncoder().encode('{"uuid":"e"}\n'),
    },
  ]);

  const lists = mock(source.collectFiles);

  await writeKeptSession({
    from: { ...source, collectFiles: lists },
    to,
    command: { argv: ['guest'], env: { HOME: '/home/nixie' } },
    sessionID,
  });

  const landed = await to.collectFiles('/home/nixie/.claude/projects');

  expect(lists.mock.calls).toStrictEqual([
    ['/home/nixie/.claude/projects', { maxDepth: 2 }],
    [`/home/nixie/.claude/projects/-home-nixie-conversation/${sessionID}`],
  ]);

  expect(landed).toIncludeSameMembers([
    `-home-nixie-conversation/${sessionID}.jsonl`,
    `-home-nixie-conversation/${sessionID}/subagents/agent-1.jsonl`,
  ]);
});

test('it wakes a sleeping old sandbox before it lists the session', async () => {
  const ctx = await setupTest();
  const from = await ctx.adapter.create(ctx.spec);
  const to = await ctx.adapter.create(ctx.spec);

  const sessionID = crypto.randomUUID();

  await from.copyIn([
    {
      path: `/home/nixie/.claude/projects/-home-nixie-conversation/${sessionID}.jsonl`,
      content: new TextEncoder().encode('{"uuid":"a"}\n'),
    },
  ]);

  invariant(from.suspension.kind === 'memory');

  await from.suspension.sleep();

  await writeKeptSession({
    from,
    to,
    command: { argv: ['guest'], env: { HOME: '/home/nixie' } },
    sessionID,
  });

  const landed = await to.collectFiles('/home/nixie/.claude/projects');

  expect(landed).toStrictEqual([`-home-nixie-conversation/${sessionID}.jsonl`]);
});

test('it refuses to carry a session from a sandbox that holds no transcript of it', async () => {
  const ctx = await setupTest();
  const from = await ctx.adapter.create(ctx.spec);
  const to = await ctx.adapter.create(ctx.spec);

  const sessionID = crypto.randomUUID();

  await from.copyIn([
    {
      path: `/home/nixie/.claude/projects/-home-nixie-conversation/${sessionID}/subagents/agent-1.jsonl`,
      content: new TextEncoder().encode('{"uuid":"b"}\n'),
    },
  ]);

  const failure = await writeKeptSession({
    from,
    to,
    command: { argv: ['guest'], env: { HOME: '/home/nixie' } },
    sessionID,
  }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toStrictEqual(
    new Error(`the sandbox ${from.id} holds no transcript of session ${sessionID}`),
  );
});

test('it leaves no resumable transcript when the move of the staged copy fails', async () => {
  const ctx = await setupTest();
  const from = await ctx.adapter.create(ctx.spec);
  const to = await ctx.adapter.create(ctx.spec);

  const sessionID = crypto.randomUUID();

  await from.copyIn([
    {
      path: `/home/nixie/.claude/projects/-home-nixie-conversation/${sessionID}.jsonl`,
      content: new TextEncoder().encode('{"uuid":"a"}\n'),
    },
  ]);

  // a folder where the transcript goes, so the move onto it fails
  await to.copyIn([
    {
      path: `/home/nixie/.claude/projects/-home-nixie-conversation/${sessionID}.jsonl/held`,
      content: new TextEncoder().encode(''),
    },
  ]);

  const failure = await writeKeptSession({
    from,
    to,
    command: { argv: ['guest'], env: { HOME: '/home/nixie' } },
    sessionID,
  }).then(
    () => null,
    (error: unknown) => error,
  );

  const landed = await to.collectFiles('/home/nixie/.claude/projects');

  expect(failure).toMatchObject({ message: expect.toStartWith('EISDIR') });

  expect(landed).toIncludeSameMembers([
    `-home-nixie-conversation/${sessionID}.jsonl.copy`,
    `-home-nixie-conversation/${sessionID}.jsonl/held`,
  ]);
});
