import { expect, onTestFinished, test } from 'bun:test';
import type { BoundSession, SessionEvent } from '@heynixie/coding';
import { waitForCondition } from '@heynixie/testing';
import { buildATCAdapter } from './build-atc-adapter';
import { buildMemoryCursorStore, startFakeATCGateway } from './test-utils';
import type { FakeATCGatewayOptions } from './test-utils';

function setupTest(
  options: FakeATCGatewayOptions & { adapterToken?: string; adapterURL?: string } = {},
) {
  const gateway = startFakeATCGateway(options);

  onTestFinished(() => gateway.stop());

  const logged: { event: string; fields: unknown }[] = [];
  const cursors = buildMemoryCursorStore();

  const buildAdapter = () =>
    buildATCAdapter({
      url: options.adapterURL ?? gateway.url,
      token: options.adapterToken ?? gateway.token,
      cursors,
      ...(options.now === undefined ? {} : { now: options.now }),
      targets: [{ daemon: 'cloud', target: 'cloud' }],
      log: (event, fields) => {
        logged.push({ event, fields });
      },
      waitMs: 50,
      stateReadMs: 20,
    });

  const adapter = buildAdapter();

  const readPages = async (
    cursor: string | null,
    pages: number,
    bound: readonly BoundSession[] = [],
  ) => {
    const controller = new AbortController();

    const collected: { cursor: string; events: readonly SessionEvent[] }[] = [];

    for await (const page of adapter.events(cursor, controller.signal, () =>
      Promise.resolve(bound),
    )) {
      collected.push(page);

      if (collected.length === pages) {
        controller.abort();
      }
    }

    return collected;
  };

  return { gateway, adapter, buildAdapter, logged, readPages };
}

test('it spawns a session with the brief, the target and the key, after it reads the trail cursor', async () => {
  const ctx = setupTest();

  const brief = {
    name: 'Login fix',
    prompt: 'Fix the login test.',
    repo: { url: 'https://example.net/acme/app.git', ref: 'main' },
    target: { daemon: 'cloud', target: 'cloud' },
    agent: 'coder',
  };

  const reply = await ctx.adapter.start(brief, 'action-1');

  expect(reply).toStrictEqual({
    status: 'ok',
    value: {
      session: { id: expect.stringMatching(/^cloud\.3f9a1c2e\./u) },
      state: 'running',
      fromCursor: 'g0',
    },
  });

  expect(ctx.gateway.calls.map((call) => call.procedure)).toStrictEqual([
    'events.read',
    'session.spawn',
  ]);

  expect(ctx.gateway.calls[1]?.args).toStrictEqual({
    name: 'Login fix',
    prompt: 'Fix the login test.',
    agent: 'coder',
    daemon: 'cloud',
    target: 'cloud',
    workspace: { kind: 'git', url: 'https://example.net/acme/app.git', ref: 'main' },
    trustClonedWorkspace: true,
    idempotencyKey: 'action-1',
  });
});

test('it gives the first answer to a spawn that a key repeats, and starts one session', async () => {
  const ctx = setupTest();

  const brief = {
    name: 'Login fix',
    prompt: 'Fix the login test.',
    repo: { url: 'https://example.net/acme/app.git', ref: 'main' },
    target: { daemon: 'cloud', target: 'cloud' },
    agent: 'coder',
  };

  const first = await ctx.adapter.start(brief, 'action-1');
  const again = await ctx.adapter.start(brief, 'action-1');

  expect(again).toStrictEqual(first);
  expect(ctx.gateway.sessions.size).toBe(1);
});

test('it keeps the cursor of a start whose spawn answer was lost, so the replay catches up from it', async () => {
  const ctx = setupTest();

  const brief = {
    name: 'Login fix',
    prompt: 'Fix the login test.',
    repo: { url: 'https://example.net/acme/app.git', ref: 'main' },
    target: { daemon: 'cloud', target: 'cloud' },
  };

  ctx.gateway.failNext('session.spawn', { kind: 'code', code: 'daemon_unavailable' });

  const lost = await ctx.adapter.start(brief, 'action-1');

  ctx.gateway.emit({
    session: 'cloud.3f9a1c2e.a',
    kind: 'note',
    at: 1,
    detail: 'x',
    label: 'progress',
    text: 'Early.',
  });

  const replay = await ctx.adapter.start(brief, 'action-1');

  expect([lost.status, replay.status === 'ok' ? replay.value.fromCursor : null]).toStrictEqual([
    'unknown',
    'g0',
  ]);
});

test('it replays a start on an adapter built again from the cursor of the first, so the catch-up skips no note', async () => {
  const ctx = setupTest();

  const brief = {
    name: 'Login fix',
    prompt: 'Fix the login test.',
    repo: { url: 'https://example.net/acme/app.git', ref: 'main' },
    target: { daemon: 'cloud', target: 'cloud' },
  };

  ctx.gateway.failNext('session.spawn', { kind: 'lost' });

  const lost = await ctx.adapter.start(brief, 'action-1');

  const [sessionID] = [...ctx.gateway.sessions.keys()];

  ctx.gateway.emit({
    session: sessionID ?? '',
    kind: 'note',
    at: 1,
    detail: 'x',
    label: 'progress',
    text: 'Early.',
  });

  const restarted = ctx.buildAdapter();

  const replay = await restarted.start(brief, 'action-1');

  const fromCursor = replay.status === 'ok' ? replay.value.fromCursor : null;

  const pages = await ctx.readPages(fromCursor, 1);

  expect([
    lost.status,
    ctx.gateway.sessions.size,
    fromCursor,
    pages[0]?.events.map((event) => event.kind),
  ]).toStrictEqual(['unknown', 1, 'g0', ['note']]);
});

test('it reads a new cursor for the next key after a refused spawn', async () => {
  const ctx = setupTest();

  const brief = {
    name: 'Login fix',
    prompt: 'Fix the login test.',
    repo: { url: 'https://example.net/acme/app.git', ref: 'main' },
    target: { daemon: 'cloud', target: 'cloud' },
  };

  ctx.gateway.failNext('session.spawn', { kind: 'code', code: 'bad_args' });

  const refused = await ctx.adapter.start(brief, 'action-1');

  ctx.gateway.emit({ session: 'cloud.3f9a1c2e.a', kind: 'note', at: 1, detail: 'x' });

  const next = await ctx.buildAdapter().start(brief, 'action-1');

  expect([refused.status, next.status === 'ok' ? next.value.fromCursor : null]).toStrictEqual([
    'refused',
    'g1',
  ]);
});

test('it gives the unknown outcome to a start whose cursor read failed, so the next attempt keeps the key', async () => {
  const ctx = setupTest();

  const brief = {
    name: 'Login fix',
    prompt: 'Fix the login test.',
    repo: { url: 'https://example.net/acme/app.git', ref: 'main' },
    target: { daemon: 'cloud', target: 'cloud' },
  };

  ctx.gateway.failNext('events.read', { kind: 'code', code: 'daemon_unavailable' });

  const reply = await ctx.adapter.start(brief, 'action-1');

  expect(reply).toStrictEqual({ status: 'unknown', reason: 'daemon_unavailable' });
});

test('it lists only the sessions of a configured target', async () => {
  const ctx = setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a', name: 'Billing', state: 'needs_you' });
  ctx.gateway.addSession({ id: 'laptop.77aa00bb.b', daemon: 'laptop', targetID: 'local' });

  const reply = await ctx.adapter.list();

  expect(reply).toStrictEqual({
    status: 'ok',
    value: [
      {
        session: { id: 'cloud.3f9a1c2e.a' },
        target: { daemon: 'cloud', target: 'cloud' },
        name: 'Billing',
        cwd: '/work/cloud.3f9a1c2e.a',
        state: 'waiting',
      },
    ],
  });
});

test('it joins a running session with the cursor of the trail and sends the session nothing', async () => {
  const ctx = setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a' });

  const reply = await ctx.adapter.join({ id: 'cloud.3f9a1c2e.a' });

  expect(reply).toStrictEqual({
    status: 'ok',
    value: { session: { id: 'cloud.3f9a1c2e.a' }, state: 'running', fromCursor: 'g0' },
  });

  expect(ctx.gateway.calls.map((call) => call.procedure)).toStrictEqual([
    'session.get',
    'events.read',
  ]);
});

test('it refuses to join a session on a target that the config no longer lists', async () => {
  const ctx = setupTest();

  ctx.gateway.addSession({ id: 'laptop.77aa00bb.b', daemon: 'laptop', targetID: 'local' });

  const reply = await ctx.adapter.join({ id: 'laptop.77aa00bb.b' });

  expect(reply).toStrictEqual({ status: 'refused', canClear: false, reason: 'no_such_session' });
});

test('it refuses to join a session that atc does not know', async () => {
  const ctx = setupTest();

  const reply = await ctx.adapter.join({ id: 'cloud.3f9a1c2e.none' });

  expect(reply).toStrictEqual({
    status: 'refused',
    canClear: false,
    reason: 'no_such_session',
  });
});

test('it reads the state, the question, the last reply and the prompt when asked', async () => {
  const ctx = setupTest();

  ctx.gateway.addSession({
    id: 'cloud.3f9a1c2e.a',
    state: 'needs_you',
    pending: 'Claude needs your permission',
    result: 'Fixed the cookie.',
    prompt: 'Fix the login.',
  });

  const reply = await ctx.adapter.read({ id: 'cloud.3f9a1c2e.a' }, { prompt: true, tailTurns: 0 });

  expect(reply).toStrictEqual({
    status: 'ok',
    value: {
      state: 'waiting',
      question: 'Claude needs your permission',
      lastReply: 'Fixed the cookie.',
      prompt: 'Fix the login.',
      tail: [],
    },
  });
});

test('it builds the tail from the transcript pages, grouped into turns, and keeps the newest', async () => {
  const ctx = setupTest();

  ctx.gateway.addSession({
    id: 'cloud.3f9a1c2e.a',
    rows: [
      { role: 'user', text: 'one' },
      { role: 'assistant', text: 'first reply' },
      { role: 'user', text: 'two' },
      { role: 'assistant', text: 'working', tools: [{ name: 'Edit', input: 'a.ts' }] },
      { role: 'assistant', text: 'done' },
    ],
  });

  const reply = await ctx.adapter.read({ id: 'cloud.3f9a1c2e.a' }, { prompt: false, tailTurns: 1 });

  expect(reply).toMatchObject({
    status: 'ok',
    value: { tail: [{ user: 'two', assistant: 'working\n\ndone', tools: ['Edit: a.ts'] }] },
  });
});

test('it gives an unsupported tail for an agent with no transcript reader', async () => {
  const ctx = setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a', hasTranscript: false });

  const reply = await ctx.adapter.read({ id: 'cloud.3f9a1c2e.a' }, { prompt: false, tailTurns: 2 });

  expect(reply).toMatchObject({ status: 'ok', value: { tail: 'unsupported' } });
});

test('it types a steer into a session that runs', async () => {
  const ctx = setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a' });

  const reply = await ctx.adapter.steer({ id: 'cloud.3f9a1c2e.a' }, 'Check the cookie.');

  expect(reply).toStrictEqual({ status: 'ok', value: { typed: true } });

  expect(ctx.gateway.calls.at(-1)).toStrictEqual({
    procedure: 'session.submit',
    args: { session: 'cloud.3f9a1c2e.a', text: 'Check the cookie.' },
  });
});

test('it refuses a steer to a session that waits on a menu, and types nothing', async () => {
  const ctx = setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a', state: 'needs_you' });

  const reply = await ctx.adapter.steer({ id: 'cloud.3f9a1c2e.a' }, 'Go on.');

  expect(reply).toStrictEqual({ status: 'refused', canClear: false, reason: 'menu_open' });
  expect(ctx.gateway.calls.map((call) => call.procedure)).toStrictEqual(['session.get']);
});

test('it sends a note under its key and gives the message ID back', async () => {
  const ctx = setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a' });

  const reply = await ctx.adapter.message({ id: 'cloud.3f9a1c2e.a' }, 'FYI.', 'action-2');

  expect(reply).toStrictEqual({ status: 'ok', value: { messageRef: 'm1' } });
});

test('it stops a session', async () => {
  const ctx = setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a' });

  const reply = await ctx.adapter.stop({ id: 'cloud.3f9a1c2e.a' });

  expect(reply).toStrictEqual({
    status: 'ok',
    value: { stopped: true },
  });
});

test.each([
  {
    label: 'a note to a session in its first minute',
    tool: 'message',
    code: 'unsupported',
    ageMs: 5000,
    expected: { status: 'refused', canClear: true, reason: 'unsupported' },
  },
  {
    label: 'a note to a session after its first minute',
    tool: 'message',
    code: 'unsupported',
    ageMs: 120_000,
    expected: { status: 'refused', canClear: false, reason: 'unsupported' },
  },
] as const)('it refuses $label with canClear $expected.canClear', async (row) => {
  const clock = { now: 1_000_000 };
  const ctx = setupTest({ now: () => clock.now });

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a', createdAt: clock.now - row.ageMs });
  ctx.gateway.failNext('session.message', { kind: 'code', code: row.code });

  const reply = await ctx.adapter.message({ id: 'cloud.3f9a1c2e.a' }, 'FYI.', 'action-3');

  expect(reply).toStrictEqual(row.expected);
});

test('it gives an unknown outcome to a keyed call that atc answers with daemon_unavailable', async () => {
  const ctx = setupTest();

  const brief = {
    name: 'Login fix',
    prompt: 'Fix the login test.',
    repo: { url: 'https://example.net/acme/app.git', ref: 'main' },
    target: { daemon: 'cloud', target: 'cloud' },
    agent: 'coder',
  };

  ctx.gateway.failNext('session.spawn', { kind: 'code', code: 'daemon_unavailable' });

  const reply = await ctx.adapter.start(brief, 'action-1');

  expect(reply).toStrictEqual({
    status: 'unknown',
    reason: 'daemon_unavailable',
  });
});

test('it gives a refusal that may clear to a call with no key that atc answers with daemon_unavailable', async () => {
  const ctx = setupTest();

  ctx.gateway.failNext('session.kill', { kind: 'code', code: 'daemon_unavailable' });

  const reply = await ctx.adapter.stop({ id: 'cloud.3f9a1c2e.a' });

  expect(reply).toStrictEqual({
    status: 'refused',
    canClear: true,
    reason: 'daemon_unavailable',
  });
});

test('it gives a refusal that may clear to a call with no key that a failing gateway answers with an error', async () => {
  const ctx = setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a' });
  ctx.gateway.failNext('session.kill', { kind: 'http', status: 500 });

  const reply = await ctx.adapter.stop({ id: 'cloud.3f9a1c2e.a' });

  expect(reply).toStrictEqual({ status: 'refused', canClear: true, reason: 'gateway_failed' });
});

test('it gives an unknown outcome to a keyed call that a failing gateway answers with an error', async () => {
  const ctx = setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a' });
  ctx.gateway.failNext('session.message', { kind: 'http', status: 500 });

  const reply = await ctx.adapter.message({ id: 'cloud.3f9a1c2e.a' }, 'FYI.', 'action-4');

  expect(reply).toStrictEqual({ status: 'unknown', reason: 'gateway_failed' });
});

test('it gives a refusal that may clear to a gateway that nothing listens on, and no empty list', async () => {
  const ctx = setupTest();

  await ctx.gateway.stop();

  const reply = await ctx.adapter.list();

  expect(reply).toStrictEqual({ status: 'refused', canClear: true, reason: 'unreachable' });
});

test('it gives a refusal that may clear to a token that the gateway rejects', async () => {
  const ctx = setupTest({ adapterToken: 'wrong' });

  const reply = await ctx.adapter.list();

  expect(reply).toStrictEqual({ status: 'refused', canClear: true, reason: 'bearer_refused' });
});

test('it refuses a call on a gateway of another contract major, and sends no procedure', async () => {
  const ctx = setupTest({ major: 99 });

  const reply = await ctx.adapter.list();

  expect(reply).toStrictEqual({ status: 'refused', canClear: true, reason: 'protocol_mismatch' });
  expect(ctx.gateway.calls).toStrictEqual([]);
});

test('it refuses a call whose scope the token lacks, and the refusal cannot clear', async () => {
  const ctx = setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a' });
  ctx.gateway.failNext('session.kill', { kind: 'code', code: 'insufficient_scope' });

  const reply = await ctx.adapter.stop({ id: 'cloud.3f9a1c2e.a' });

  expect(reply).toStrictEqual({ status: 'refused', canClear: false, reason: 'insufficient_scope' });
});

test('it refuses a call that only the daemon owner may make, and the refusal cannot clear', async () => {
  const ctx = setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a' });
  ctx.gateway.failNext('session.kill', { kind: 'code', code: 'unauthorized' });

  const reply = await ctx.adapter.stop({ id: 'cloud.3f9a1c2e.a' });

  expect(reply).toStrictEqual({ status: 'refused', canClear: false, reason: 'unauthorized' });
});

test.each([
  { state: 'down', canClear: true },
  { state: 'unauthorized', canClear: false },
  { state: 'mismatched', canClear: false },
] as const)('it refuses a list that is empty because its daemon is $state', async (row) => {
  const ctx = setupTest();

  ctx.gateway.setDaemonState(row.state);

  const reply = await ctx.adapter.list();

  expect(reply).toStrictEqual({
    status: 'refused',
    canClear: row.canClear,
    reason: `daemon_${row.state}`,
  });
});

test('it lists the sessions it can reach and logs a daemon that is not up', async () => {
  const ctx = setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a', name: 'Billing' });
  ctx.gateway.setDaemonState('down');

  const reply = await ctx.adapter.list();

  expect([reply.status, ctx.logged.map((entry) => entry.event)]).toStrictEqual([
    'ok',
    ['coding.atc_daemon_not_up'],
  ]);
});

test('it reads only the cursor at its first events read, and keeps no event', async () => {
  const ctx = setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a' });

  ctx.gateway.emit({
    session: 'cloud.3f9a1c2e.a',
    kind: 'note',
    at: 1,
    detail: 'x',
    label: 'progress',
    text: 'x',
  });

  const pages = await ctx.readPages(null, 1);

  expect(pages).toStrictEqual([{ cursor: 'g1', events: [] }]);
});

test('it builds answers and notes from the trail, with the key of the daemon cursor, and a state event for the session', async () => {
  const ctx = setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a', state: 'done' });

  ctx.gateway.emit(
    {
      session: 'cloud.3f9a1c2e.a',
      kind: 'note',
      at: Date.UTC(2026, 10, 25),
      detail: 'prev',
      label: 'blocked',
      text: 'Need the API key.',
      complete: true,
    },
    {
      session: 'cloud.3f9a1c2e.a',
      kind: 'message-answered',
      at: Date.UTC(2026, 10, 25),
      detail: 'prev',
      message: 'm1',
      text: 'Yes.',
    },
    { session: 'cloud.3f9a1c2e.a', kind: 'turn-done', at: Date.UTC(2026, 10, 25), detail: null },
  );

  const pages = await ctx.readPages('g0', 1, [{ id: 'cloud.3f9a1c2e.a', state: 'running' }]);

  expect(pages).toStrictEqual([
    {
      cursor: 'g3',
      events: [
        {
          kind: 'note',
          label: 'blocked',
          text: 'Need the API key.',
          session: 'cloud.3f9a1c2e.a',
          eventKey: 'cloud.3f9a1c2e|d1',
          at: '2026-11-25T00:00:00.000Z',
        },
        {
          kind: 'answered',
          messageRef: 'm1',
          answer: 'Yes.',
          session: 'cloud.3f9a1c2e.a',
          eventKey: 'cloud.3f9a1c2e|d2',
          at: '2026-11-25T00:00:00.000Z',
        },
        {
          kind: 'state',
          state: 'idle',
          question: null,
          session: 'cloud.3f9a1c2e.a',
          eventKey: expect.stringMatching(/^cloud\.3f9a1c2e\.a\|state\|idle\|/u),
          at: expect.any(String),
        },
      ],
    },
  ]);
});

test.each([
  { label: 'an incomplete answer', fields: { complete: false } },
  { label: 'an answer whose text failed to load', fields: { textError: 'timeout' } },
])('it keeps the preview of $label and ends it with a line that says atc cut it', async (row) => {
  const ctx = setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a' });

  ctx.gateway.emit({
    session: 'cloud.3f9a1c2e.a',
    kind: 'message-answered',
    at: 1,
    detail: 'The first 600 characters',
    message: 'm1',
    ...row.fields,
  });

  const [page] = await ctx.readPages('g0', 1);

  expect(page?.events[0]).toMatchObject({
    kind: 'answered',
    answer: 'The first 600 characters\n[atc cut this text]',
  });
});

test('it drops a trail event of a kind it does not know, and a note with a label it does not know', async () => {
  const ctx = setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a', state: 'exited' });

  ctx.gateway.emit(
    { session: '', kind: 'daemon-restarted', at: 1, detail: null },
    { session: 'cloud.3f9a1c2e.a', kind: 'note', at: 1, detail: 'x', label: 'chatter', text: 'x' },
  );

  const [page] = await ctx.readPages('g0', 1, [{ id: 'cloud.3f9a1c2e.a', state: 'running' }]);

  expect(page?.events.map((event) => event.kind)).toStrictEqual(['state']);
});

test('it yields a state event only when a session state changed, and reads a session that went missing as gone', async () => {
  const ctx = setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a' });

  await ctx.adapter.join({ id: 'cloud.3f9a1c2e.a' });

  const session = ctx.gateway.sessions.get('cloud.3f9a1c2e.a');

  if (session !== undefined) {
    session.state = 'done';
  }

  const bound: BoundSession[] = [{ id: 'cloud.3f9a1c2e.a', state: 'running' }];

  const changed = await ctx.readPages('g0', 2, bound);

  ctx.gateway.sessions.delete('cloud.3f9a1c2e.a');

  const gone = await ctx.readPages('g0', 2, bound);

  expect([
    changed
      .flatMap((page) => page.events)
      .map((event) => [event.kind, 'state' in event ? event.state : null]),
    gone
      .flatMap((page) => page.events)
      .map((event) => [event.kind, 'state' in event ? event.state : null]),
  ]).toStrictEqual([[['state', 'idle']], [['state', 'gone']]]);
});

test('it reads the next page at once while the gateway says more events wait, and yields only a page with events or the page that caught up', async () => {
  const ctx = setupTest();

  for (let index = 0; index < 205; index += 1) {
    ctx.gateway.emit({ session: '', kind: 'other', at: 1, detail: null });
  }

  const pages = await ctx.readPages('g0', 1);

  expect(pages.map((page) => page.cursor)).toStrictEqual(['g205']);
});

test('it yields a note on a later page when the first page holds only events it drops', async () => {
  const ctx = setupTest();

  for (let index = 0; index < 205; index += 1) {
    ctx.gateway.emit({ session: '', kind: 'other', at: 1, detail: null });
  }

  ctx.gateway.emit({
    session: 'cloud.3f9a1c2e.a',
    kind: 'note',
    at: 1,
    detail: 'x',
    label: 'progress',
    text: 'Halfway.',
  });

  const [page] = await ctx.readPages('g0', 1);

  expect(page?.events.map((event) => event.kind)).toStrictEqual(['note']);
});

test('it reads the state of a bound session that the trail never names, from the first read after a restart', async () => {
  const ctx = setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a', state: 'done' });

  const [page] = await ctx.readPages('g0', 1, [{ id: 'cloud.3f9a1c2e.a', state: 'running' }]);

  expect(page?.events).toStrictEqual([
    {
      kind: 'state',
      state: 'idle',
      question: null,
      session: 'cloud.3f9a1c2e.a',
      eventKey: expect.stringMatching(/^cloud\.3f9a1c2e\.a\|state\|idle\|/u),
      at: expect.any(String),
    },
  ]);
});

test('it reads no state of a session that no task binds', async () => {
  const ctx = setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a' });

  ctx.gateway.emit({
    session: 'cloud.3f9a1c2e.a',
    kind: 'note',
    at: 1,
    detail: 'x',
    label: 'progress',
    text: 'Halfway.',
  });

  await ctx.readPages('g0', 1);

  expect(ctx.gateway.calls.map((call) => call.procedure)).toStrictEqual([
    'events.read',
    'note.get',
  ]);
});

test('it reads the state of a bound session once, and again only after the state read interval, when its first read failed', async () => {
  const ctx = setupTest({ now: () => 1000 });

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a' });
  ctx.gateway.failNext('session.get', { kind: 'code', code: 'daemon_unavailable' });

  await ctx.readPages('g0', 1, [{ id: 'cloud.3f9a1c2e.a', state: 'running' }]);

  const reads = ctx.gateway.calls.filter((call) => call.procedure === 'session.get');

  expect(reads).toHaveLength(1);
});

test('it fails an events read when the gateway answers with an error', () => {
  const ctx = setupTest();

  ctx.gateway.failNext('events.read', { kind: 'code', code: 'daemon_unavailable' });

  expect(ctx.readPages('g0', 1)).rejects.toThrow(/daemon_unavailable/u);
});

test('it yields a note that reaches the trail after the read caught up, from the event stream', async () => {
  const ctx = setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a' });

  const pending = ctx.readPages('g0', 2, [{ id: 'cloud.3f9a1c2e.a', state: 'running' }]);

  await waitForCondition(() =>
    ctx.gateway.calls.some((call) => call.procedure === 'events.stream'),
  );

  ctx.gateway.emit({
    session: 'cloud.3f9a1c2e.a',
    kind: 'note',
    at: 1,
    detail: 'x',
    label: 'progress',
    text: 'Halfway there.',
  });

  const pages = await pending;

  expect(pages[1]).toStrictEqual({
    cursor: 'g1',
    events: [
      {
        kind: 'note',
        label: 'progress',
        text: 'Halfway there.',
        session: 'cloud.3f9a1c2e.a',
        eventKey: 'cloud.3f9a1c2e|d1',
        at: '1970-01-01T00:00:00.001Z',
      },
    ],
  });
});

test('it reads a session that waits on a question with a long reply and a tail of turns', async () => {
  const ctx = setupTest();

  ctx.gateway.addSession({
    id: 'cloud.3f9a1c2e.a',
    state: 'needs_you',
    pending: 'Which branch should I rebase on?',
    result: 'r'.repeat(3000),
    prompt: 'Refactor billing.',
    rows: [
      { role: 'user', text: 'Refactor billing.' },
      { role: 'assistant', text: 'Reading.', tools: [{ name: 'Read', input: 'billing.ts' }] },
      { role: 'user', text: 'Go on.' },
      { role: 'assistant', text: 'Which branch?' },
    ],
  });

  const reply = await ctx.adapter.read({ id: 'cloud.3f9a1c2e.a' }, { prompt: true, tailTurns: 2 });

  expect(reply).toStrictEqual({
    status: 'ok',
    value: {
      state: 'waiting',
      question: 'Which branch should I rebase on?',
      lastReply: 'r'.repeat(3000),
      prompt: 'Refactor billing.',
      tail: [
        { user: 'Refactor billing.', assistant: 'Reading.', tools: ['Read: billing.ts'] },
        { user: 'Go on.', assistant: 'Which branch?', tools: [] },
      ],
    },
  });
});

test('it fails an events read when the gateway refuses the event stream', () => {
  const ctx = setupTest();

  ctx.gateway.failNext('events.stream', { kind: 'code', code: 'insufficient_scope' });

  expect(ctx.readPages('g0', 2)).rejects.toMatchObject({ code: 'insufficient_scope' });
});

test('it pages the transcript from its start when it holds more rows than one page', async () => {
  const ctx = setupTest();

  const rows = Array.from({ length: 450 }, (_unused, index) => ({
    role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
    text: `row ${String(index)}`,
  }));

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a', rows });

  const reply = await ctx.adapter.read({ id: 'cloud.3f9a1c2e.a' }, { prompt: false, tailTurns: 1 });

  expect([
    reply,
    ctx.gateway.calls.filter((call) => call.procedure === 'session.read').length,
  ]).toStrictEqual([
    {
      status: 'ok',
      value: expect.objectContaining({
        tail: [{ user: 'row 448', assistant: 'row 449', tools: [] }],
      }),
    },
    3,
  ]);
});
