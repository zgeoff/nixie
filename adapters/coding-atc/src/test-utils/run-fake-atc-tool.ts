import type { FakeATCSession, FakeATCState } from './fake-atc-state';

export type FakeToolResult =
  | { readonly data: Readonly<Record<string, unknown>> }
  | { readonly code: string };

type Args = Readonly<Record<string, unknown>>;

type Handler = (state: FakeATCState, args: Args) => Promise<FakeToolResult>;

const handlers = new Map<string, Handler>([
  ['atc_events_read', readEvents],
  ['atc_session_spawn', spawn],
  ['atc_sessions_list', listSessions],
  ['atc_session_get', getSession],
  ['atc_transcript_read', readTranscript],
  ['atc_terminal_type', typeLine],
  ['atc_message_send', sendMessage],
  ['atc_session_stop', stopSession],
]);

// What atc-gateway answers to one tool call, for the tools the adapter uses.
export async function runFakeATCTool(
  state: FakeATCState,
  tool: string,
  args: Args,
): Promise<FakeToolResult> {
  state.calls.push({ tool, args });

  const failure = state.failures.get(tool)?.shift();

  if (failure?.kind === 'code') {
    return { code: failure.code };
  }

  const handler = handlers.get(tool);
  const result = handler === undefined ? { code: 'unknown_tool' } : await handler(state, args);

  return failure?.kind === 'lost' ? { code: 'outcome_unknown' } : result;
}

const incarnation = '3f9a1c2e';

async function readEvents(state: FakeATCState, args: Args): Promise<FakeToolResult> {
  const limit = Number(args['limit'] ?? 50);
  const waitMs = Number(args['waitMs'] ?? 0);
  const cursor = args['cursor'];

  if (typeof cursor !== 'string') {
    const first = Math.max(0, state.trail.length - limit);
    const latest = state.trail.slice(first);

    return {
      data: {
        events: latest.map((event, index) => toTrailEvent(event, first + index)),
        cursor: `g${String(state.trail.length)}`,
        more: false,
      },
    };
  }

  const after = Number(cursor.slice(1));
  const deadline = Date.now() + waitMs;

  while (state.trail.length <= after && Date.now() < deadline) {
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
  }

  const page = state.trail.slice(after, after + limit);

  return {
    data: {
      events: page.map((event, index) => toTrailEvent(event, after + index)),
      cursor: `g${String(after + page.length)}`,
      more: after + page.length < state.trail.length,
    },
  };
}

function toTrailEvent(
  event: FakeATCState['trail'][number],
  index: number,
): Record<string, unknown> {
  return {
    cursor: `g${String(index + 1)}`,
    origin: { daemon: 'cloud', incarnation, cursor: `d${String(index + 1)}` },
    ...event,
  };
}

function spawn(state: FakeATCState, args: Args): Promise<FakeToolResult> {
  const key = `spawn|${String(args['idempotencyKey'])}`;
  const first = state.answersByKey.get(key);

  if (first !== undefined) {
    return Promise.resolve({ data: first });
  }

  state.nextID += 1;

  const session: FakeATCSession = {
    id: `${String(args['daemon'])}.${incarnation}.00000000-0000-4000-8000-${String(state.nextID).padStart(12, '0')}`,
    name: String(args['name']),
    cwd: `/work/${String(args['name'])}`,
    daemon: String(args['daemon']),
    targetID: String(args['target']),
    state: 'running',
    harness: 'running',
    createdAt: state.now(),
    prompt: String(args['prompt']),
    pending: null,
    result: null,
    hasTranscript: true,
    rows: [],
  };

  state.sessions.set(session.id, session);

  const answer = toEntry(session);

  state.answersByKey.set(key, answer);

  return Promise.resolve({ data: answer });
}

function toEntry(session: FakeATCSession): Record<string, unknown> {
  return {
    id: session.id,
    name: session.name,
    cwd: session.cwd,
    state: session.state,
    createdAt: session.createdAt,
    locator: { daemon: session.daemon, targetID: session.targetID },
    lifecycle: { harness: session.harness },
  };
}

function listSessions(state: FakeATCState): Promise<FakeToolResult> {
  return Promise.resolve({
    data: { sessions: [...state.sessions.values()].map((session) => toEntry(session)) },
  });
}

function getSession(state: FakeATCState, args: Args): Promise<FakeToolResult> {
  return withSession(state, args, (session) => ({
    data: {
      session: toEntry(session),
      prompt: session.prompt,
      pending: session.pending === null ? null : { message: session.pending },
      result: session.result,
    },
  }));
}

function withSession(
  state: FakeATCState,
  args: Args,
  use: (session: FakeATCSession) => FakeToolResult,
): Promise<FakeToolResult> {
  const session = state.sessions.get(String(args['session']));
  const result: FakeToolResult = session === undefined ? { code: 'no_such_session' } : use(session);

  return Promise.resolve(result);
}

function readTranscript(state: FakeATCState, args: Args): Promise<FakeToolResult> {
  return withSession(state, args, (session) => {
    if (!session.hasTranscript) {
      return { code: 'unsupported' };
    }

    const from = typeof args['cursor'] === 'string' ? Number(args['cursor']) : 0;
    const limit = Number(args['limit'] ?? 50);
    const rows = session.rows.slice(from, from + limit);

    return {
      data: { rows, cursor: String(from + rows.length), more: from + limit < session.rows.length },
    };
  });
}

function typeLine(state: FakeATCState, args: Args): Promise<FakeToolResult> {
  return withSession(state, args, () => ({ data: { written: true } }));
}

function sendMessage(state: FakeATCState, args: Args): Promise<FakeToolResult> {
  return withSession(state, args, () => {
    const key = `message|${String(args['idempotencyKey'])}`;
    const first = state.answersByKey.get(key);

    if (first !== undefined) {
      return { data: first };
    }

    const message = `m${String(state.messages.size + 1)}`;

    state.messages.set(message, { session: String(args['session']), text: String(args['text']) });

    const answer = { message, status: 'queued' };

    state.answersByKey.set(key, answer);

    return { data: answer };
  });
}

function stopSession(state: FakeATCState, args: Args): Promise<FakeToolResult> {
  return withSession(state, args, (session) => {
    const wasLive = session.state !== 'exited';

    session.state = 'exited';
    session.harness = 'exited';

    return { data: { stopped: wasLive } };
  });
}
