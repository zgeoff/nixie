import { expect, onTestFinished, test } from 'bun:test';
import type { BoundSession, SessionEvent } from '@heynixie/coding';
import { buildATCAdapter } from './build-atc-adapter';
import { buildMemoryCursorStore, startFakeATCGateway } from './test-utils';
import type { FakeATCGatewayOptions } from './test-utils';

async function setupTest(options: FakeATCGatewayOptions & { adapterToken?: string } = {}) {
  const gateway = await startFakeATCGateway(options);

  onTestFinished(() => gateway.stop());

  const logged: { event: string; fields: unknown }[] = [];
  const cursors = buildMemoryCursorStore();

  const buildAdapter = () =>
    buildATCAdapter({
      url: gateway.url,
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
  const ctx = await setupTest();

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

  expect(ctx.gateway.calls.map((call) => call.tool)).toStrictEqual([
    'atc_events_read',
    'atc_session_spawn',
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
  const ctx = await setupTest();

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
  const ctx = await setupTest();

  const brief = {
    name: 'Login fix',
    prompt: 'Fix the login test.',
    repo: { url: 'https://example.net/acme/app.git', ref: 'main' },
    target: { daemon: 'cloud', target: 'cloud' },
  };

  ctx.gateway.failNext('atc_session_spawn', { kind: 'code', code: 'daemon_unavailable' });

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
  const ctx = await setupTest();

  const brief = {
    name: 'Login fix',
    prompt: 'Fix the login test.',
    repo: { url: 'https://example.net/acme/app.git', ref: 'main' },
    target: { daemon: 'cloud', target: 'cloud' },
  };

  ctx.gateway.failNext('atc_session_spawn', { kind: 'lost' });

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
  const ctx = await setupTest();

  const brief = {
    name: 'Login fix',
    prompt: 'Fix the login test.',
    repo: { url: 'https://example.net/acme/app.git', ref: 'main' },
    target: { daemon: 'cloud', target: 'cloud' },
  };

  ctx.gateway.failNext('atc_session_spawn', { kind: 'code', code: 'bad_args' });

  const refused = await ctx.adapter.start(brief, 'action-1');

  ctx.gateway.emit({ session: 'cloud.3f9a1c2e.a', kind: 'note', at: 1, detail: 'x' });

  const next = await ctx.buildAdapter().start(brief, 'action-1');

  expect([refused.status, next.status === 'ok' ? next.value.fromCursor : null]).toStrictEqual([
    'refused',
    'g1',
  ]);
});

test('it gives the unknown outcome to a start whose cursor read failed, so the next attempt keeps the key', async () => {
  const ctx = await setupTest();

  const brief = {
    name: 'Login fix',
    prompt: 'Fix the login test.',
    repo: { url: 'https://example.net/acme/app.git', ref: 'main' },
    target: { daemon: 'cloud', target: 'cloud' },
  };

  ctx.gateway.failNext('atc_events_read', { kind: 'code', code: 'daemon_unavailable' });

  const reply = await ctx.adapter.start(brief, 'action-1');

  expect(reply).toStrictEqual({ status: 'unknown', reason: 'daemon_unavailable' });
});

test('it lists only the sessions of a configured target', async () => {
  const ctx = await setupTest();

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
  const ctx = await setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a' });

  const reply = await ctx.adapter.join({ id: 'cloud.3f9a1c2e.a' });

  expect(reply).toStrictEqual({
    status: 'ok',
    value: { session: { id: 'cloud.3f9a1c2e.a' }, state: 'running', fromCursor: 'g0' },
  });

  expect(ctx.gateway.calls.map((call) => call.tool)).toStrictEqual([
    'atc_session_get',
    'atc_events_read',
  ]);
});

test('it refuses to join a session on a target that the config no longer lists', async () => {
  const ctx = await setupTest();

  ctx.gateway.addSession({ id: 'laptop.77aa00bb.b', daemon: 'laptop', targetID: 'local' });

  const reply = await ctx.adapter.join({ id: 'laptop.77aa00bb.b' });

  expect(reply).toStrictEqual({ status: 'refused', canClear: false, reason: 'no_such_session' });
});

test('it refuses to join a session that atc does not know', async () => {
  const ctx = await setupTest();
  const reply = await ctx.adapter.join({ id: 'cloud.3f9a1c2e.none' });

  expect(reply).toStrictEqual({
    status: 'refused',
    canClear: false,
    reason: 'no_such_session',
  });
});

test('it reads the state, the question, the last reply and the prompt when asked', async () => {
  const ctx = await setupTest();

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
  const ctx = await setupTest();

  ctx.gateway.addSession({
    id: 'cloud.3f9a1c2e.a',
    rows: [
      { role: 'user', text: 'one' },
      { role: 'assistant', text: 'first reply' },
      { role: 'user', text: 'two' },
      { role: 'assistant', text: 'working', tools: [{ name: 'Edit', summary: 'a.ts' }] },
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
  const ctx = await setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a', hasTranscript: false });

  const reply = await ctx.adapter.read({ id: 'cloud.3f9a1c2e.a' }, { prompt: false, tailTurns: 2 });

  expect(reply).toMatchObject({ status: 'ok', value: { tail: 'unsupported' } });
});

test('it types a steer into a session that runs', async () => {
  const ctx = await setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a' });

  const reply = await ctx.adapter.steer({ id: 'cloud.3f9a1c2e.a' }, 'Check the cookie.');

  expect(reply).toStrictEqual({ status: 'ok', value: { typed: true } });

  expect(ctx.gateway.calls.at(-1)).toStrictEqual({
    tool: 'atc_terminal_type',
    args: { session: 'cloud.3f9a1c2e.a', text: 'Check the cookie.' },
  });
});

test('it refuses a steer to a session that waits on a menu, and types nothing', async () => {
  const ctx = await setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a', state: 'needs_you' });

  const reply = await ctx.adapter.steer({ id: 'cloud.3f9a1c2e.a' }, 'Go on.');

  expect(reply).toStrictEqual({ status: 'refused', canClear: false, reason: 'menu_open' });
  expect(ctx.gateway.calls.map((call) => call.tool)).toStrictEqual(['atc_session_get']);
});

test('it sends a note under its key and gives the message ID back', async () => {
  const ctx = await setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a' });

  const reply = await ctx.adapter.message({ id: 'cloud.3f9a1c2e.a' }, 'FYI.', 'action-2');

  expect(reply).toStrictEqual({ status: 'ok', value: { messageRef: 'm1' } });
});

test('it stops a session', async () => {
  const ctx = await setupTest();

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

  const ctx = await setupTest({ now: () => clock.now });

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a', createdAt: clock.now - row.ageMs });
  ctx.gateway.failNext('atc_message_send', { kind: 'code', code: row.code });

  const reply = await ctx.adapter.message({ id: 'cloud.3f9a1c2e.a' }, 'FYI.', 'action-3');

  expect(reply).toStrictEqual(row.expected);
});

test('it gives an unknown outcome to a keyed call that atc answers with daemon_unavailable', async () => {
  const ctx = await setupTest();

  const brief = {
    name: 'Login fix',
    prompt: 'Fix the login test.',
    repo: { url: 'https://example.net/acme/app.git', ref: 'main' },
    target: { daemon: 'cloud', target: 'cloud' },
    agent: 'coder',
  };

  ctx.gateway.failNext('atc_session_spawn', { kind: 'code', code: 'daemon_unavailable' });

  const reply = await ctx.adapter.start(brief, 'action-1');

  expect(reply).toStrictEqual({
    status: 'unknown',
    reason: 'daemon_unavailable',
  });
});

test('it gives a refusal that may clear to a call with no key that atc answers with daemon_unavailable', async () => {
  const ctx = await setupTest();

  ctx.gateway.failNext('atc_session_stop', { kind: 'code', code: 'daemon_unavailable' });

  const reply = await ctx.adapter.stop({ id: 'cloud.3f9a1c2e.a' });

  expect(reply).toStrictEqual({
    status: 'refused',
    canClear: true,
    reason: 'daemon_unavailable',
  });
});

test('it gives an unknown outcome to a call that the gateway lost after the request left', async () => {
  const ctx = await setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a' });
  ctx.gateway.failNext('atc_session_stop', { kind: 'http', status: 500 });

  const reply = await ctx.adapter.stop({ id: 'cloud.3f9a1c2e.a' });

  expect(reply).toStrictEqual({
    status: 'unknown',
    reason: 'connection_lost',
  });
});

test('it gives a refusal that may clear to a token that the gateway rejects', async () => {
  const ctx = await setupTest({ adapterToken: 'wrong' });
  const reply = await ctx.adapter.list();

  expect(reply).toStrictEqual({
    status: 'refused',
    canClear: true,
    reason: 'unauthorized',
  });
});

test('it sends nothing past the initialize to a gateway on a version the table lacks', async () => {
  const ctx = await setupTest({ version: 'atc-gateway/8.0.0' });
  const reply = await ctx.adapter.list();

  expect(reply).toStrictEqual({
    status: 'refused',
    canClear: true,
    reason: 'unsupported_gateway',
  });

  expect(ctx.gateway.calls).toStrictEqual([]);
});

test('it reads only the cursor at its first events read, and keeps no event', async () => {
  const ctx = await setupTest();

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
  const ctx = await setupTest();

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
  const ctx = await setupTest();

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
  const ctx = await setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a', state: 'exited' });

  ctx.gateway.emit(
    { session: '', kind: 'daemon-restarted', at: 1, detail: null },
    { session: 'cloud.3f9a1c2e.a', kind: 'note', at: 1, detail: 'x', label: 'chatter', text: 'x' },
  );

  const [page] = await ctx.readPages('g0', 1, [{ id: 'cloud.3f9a1c2e.a', state: 'running' }]);

  expect(page?.events.map((event) => event.kind)).toStrictEqual(['state']);
});

test('it yields a state event only when a session state changed, and reads a session that went missing as gone', async () => {
  const ctx = await setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a' });

  await ctx.adapter.join({ id: 'cloud.3f9a1c2e.a' });

  const session = ctx.gateway.sessions.get('cloud.3f9a1c2e.a');

  if (session !== undefined) {
    session.state = 'done';
  }

  const bound: BoundSession[] = [{ id: 'cloud.3f9a1c2e.a', state: 'running' }];

  const changed = await ctx.readPages('g0', 3, bound);

  ctx.gateway.sessions.delete('cloud.3f9a1c2e.a');

  const gone = await ctx.readPages('g0', 3, bound);

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
  const ctx = await setupTest();

  for (let index = 0; index < 205; index += 1) {
    ctx.gateway.emit({ session: '', kind: 'other', at: 1, detail: null });
  }

  const pages = await ctx.readPages('g0', 1);

  expect(pages.map((page) => page.cursor)).toStrictEqual(['g205']);
});

test('it yields a note on a later page when the first page holds only events it drops', async () => {
  const ctx = await setupTest();

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
  const ctx = await setupTest();

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
  const ctx = await setupTest();

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

  expect(ctx.gateway.calls.map((call) => call.tool)).toStrictEqual(['atc_events_read']);
});

test('it waits for the state read interval after a state read that failed, and does not read again at once', async () => {
  const ctx = await setupTest({ now: () => 1000 });

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.a' });
  ctx.gateway.failNext('atc_session_get', { kind: 'code', code: 'daemon_unavailable' });

  await ctx.readPages('g0', 2, [{ id: 'cloud.3f9a1c2e.a', state: 'running' }]);

  const reads = ctx.gateway.calls.filter((call) => call.tool === 'atc_events_read');

  expect(reads.map((call) => call.args['waitMs'])).toStrictEqual([0, 20]);
});

test('it fails an events read when the gateway answers with an error', async () => {
  const ctx = await setupTest();

  ctx.gateway.failNext('atc_events_read', { kind: 'code', code: 'daemon_unavailable' });

  await expect(ctx.readPages('g0', 1)).rejects.toThrow(/daemon_unavailable/u);
});
