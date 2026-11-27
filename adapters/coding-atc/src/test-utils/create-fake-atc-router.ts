import { FLEET_CONTRACT, toGatewaySessionID } from '@atcx/contract';
import { ORPCError, implement } from '@orpc/server';
import type { FakeATCEvent, FakeATCSession, FakeATCState } from './fake-atc-state';

export interface FakeATCContext {
  // the call carries the contract major that the fake serves
  readonly isMajorMatching: boolean;
}

// The fleet router of a fake atc-gateway. Its handlers return the contract's own types, so a field
// that atc renames or adds as required fails the type check here.
export function createFakeATCRouter(state: FakeATCState) {
  const os = implement(FLEET_CONTRACT).$context<FakeATCContext>();

  return os.router({
    daemons: { list: os.daemons.list.handler(refuseUnimplemented) },
    agents: { list: os.agents.list.handler(refuseUnimplemented) },
    dirs: { list: os.dirs.list.handler(refuseUnimplemented) },
    message: { get: os.message.get.handler(refuseUnimplemented) },
    note: { get: os.note.get.handler((call) => readNote(state, call.input.note)) },
    answer: { get: os.answer.get.handler((call) => readAnswer(state, call.input.answer)) },
    events: {
      read: os.events.read.handler((call) => readEvents(state, call.input)),
      stream: os.events.stream.handler((call) =>
        streamEvents(state, call.input.cursor, call.signal),
      ),
    },
    session: {
      list: os.session.list.handler(() => ({
        sessions: [...state.sessions.values()].map((session) => toEntry(session)),
        daemons: [{ name: 'cloud', state: state.daemonState }],
      })),
      get: os.session.get.handler((call) => {
        const session = findSession(state, call.input.session);

        return {
          session: toEntry(session),
          prompt: session.prompt,
          lastActivityAt: state.now(),
          pending: session.pending === null ? null : { message: session.pending },
          result: session.result,
          sessionRecord: null,
        };
      }),
      spawn: os.session.spawn.handler((call) => spawn(state, call.input)),
      read: os.session.read.handler((call) => {
        const session = findSession(state, call.input.session);

        if (!session.hasTranscript) {
          throw buildError('unsupported');
        }

        const from = call.input.cursor === undefined ? 0 : Number(call.input.cursor);
        const rows = session.rows.slice(from, from + call.input.limit);

        return {
          rows: rows.map((row) => ({ ...row, tools: row.tools ?? [], at: null })),
          cursor: String(from + rows.length),
          more: from + call.input.limit < session.rows.length,
        };
      }),
      submit: os.session.submit.handler((call) => {
        findSession(state, call.input.session);

        return {};
      }),
      message: os.session.message.handler((call) => sendMessage(state, call.input)),
      kill: os.session.kill.handler((call) => {
        const session = findSession(state, call.input.session);
        const wasLive = session.state !== 'exited';

        session.state = 'exited';
        session.harness = 'exited';

        return { stopped: wasLive };
      }),
      update: os.session.update.handler(refuseUnimplemented),
      ack: os.session.ack.handler(refuseUnimplemented),
      forget: os.session.forget.handler(refuseUnimplemented),
      adopt: os.session.adopt.handler(refuseUnimplemented),
      screen: os.session.screen.handler(refuseUnimplemented),
      menu: os.session.menu.handler(refuseUnimplemented),
      choose: os.session.choose.handler(refuseUnimplemented),
      scope: { add: os.session.scope.add.handler(refuseUnimplemented) },
      auth: { rebind: os.session.auth.rebind.handler(refuseUnimplemented) },
    },
  });
}

// An error that the fleet contract names, as the gateway sends it.
export function buildError(code: string, message: string = code): ORPCError<string, unknown> {
  return new ORPCError(code, { defined: true, message });
}

function refuseUnimplemented(): never {
  throw buildError('unknown_method');
}

function readNote(state: FakeATCState, handle: string) {
  const index = Number(handle.slice('note-'.length)) - 1;
  const event = readTextEvent(state, index);

  return {
    note: handle,
    at: event.at,
    session: event.session,
    name: null,
    label: event.label ?? '',
    text: event.text ?? '',
    complete: event.complete ?? true,
  };
}

function readTextEvent(state: FakeATCState, index: number): FakeATCEvent {
  const event = state.trail[index];

  if (event === undefined) {
    throw buildError('bad_args', 'no such note or answer');
  }

  if (event.textError !== undefined) {
    throw buildError('internal', event.textError);
  }

  return event;
}

function readAnswer(state: FakeATCState, handle: string) {
  const index = Number(handle.slice('answer-'.length)) - 1;
  const event = readTextEvent(state, index);

  return {
    answer: handle,
    at: event.at,
    session: event.session,
    name: null,
    message: event.message ?? '',
    text: event.text ?? '',
    complete: event.complete ?? true,
  };
}

interface EventsInput {
  readonly cursor?: string | undefined;
  readonly limit: number;
  readonly waitMs: number;
}

async function readEvents(state: FakeATCState, input: EventsInput) {
  if (input.cursor === undefined) {
    const first = Math.max(0, state.trail.length - input.limit);

    return {
      events: state.trail.slice(first).map((event, index) => toTrailEvent(event, first + index)),
      cursor: `g${String(state.trail.length)}`,
      more: false,
      unavailable: [],
      started: [],
      truncated: [],
    };
  }

  const after = Number(input.cursor.slice(1));
  const deadline = Date.now() + input.waitMs;

  while (state.trail.length <= after && Date.now() < deadline) {
    await Bun.sleep(5);
  }

  const page = state.trail.slice(after, after + input.limit);

  return {
    events: page.map((event, index) => toTrailEvent(event, after + index)),
    cursor: `g${String(after + page.length)}`,
    more: after + page.length < state.trail.length,
    unavailable: [],
    started: [],
    truncated: [],
  };
}

const incarnation = '3f9a1c2e';

function toTrailEvent(event: FakeATCEvent, index: number) {
  return {
    cursor: `g${String(index + 1)}`,
    at: event.at,
    session: event.session,
    name: null,
    kind: event.kind,
    detail: event.detail,
    ...(event.message === undefined ? {} : { message: event.message }),
    ...(event.label === undefined ? {} : { label: event.label }),
    ...(event.kind === 'note' ? { note: `note-${String(index + 1)}` } : {}),
    ...(event.kind === 'message-answered' ? { answer: `answer-${String(index + 1)}` } : {}),
    origin: { daemon: 'cloud', incarnation, cursor: `d${String(index + 1)}` },
  };
}

async function* streamEvents(
  state: FakeATCState,
  cursor: string | undefined,
  signal?: AbortSignal,
) {
  let index = cursor === undefined ? state.trail.length : Number(cursor.slice(1));

  for (;;) {
    if (signal?.aborted === true) {
      return;
    }

    const event = state.trail[index];

    if (event === undefined) {
      await Bun.sleep(5);

      continue;
    }

    yield { kind: 'event' as const, event: toTrailEvent(event, index) };
    index += 1;
  }
}

function toEntry(session: FakeATCSession) {
  return {
    id: toGatewaySessionID(session.id),
    name: session.name,
    cwd: session.cwd,
    state: session.state,
    unread: false,
    lastMsg: '',
    agent: 'coder',
    pinned: false,
    lastAttachedAt: 0,
    repoRoot: session.cwd,
    namedBy: 'auto' as const,
    createdAt: session.createdAt,
    kind: 'pty' as const,
    alive: session.state !== 'exited',
    canEject: false,
    locator: { daemon: session.daemon, incarnation, targetID: session.targetID },
    lifecycle: {
      desired: 'run' as const,
      vm: 'none' as const,
      harness: session.harness,
      attachment: 'local' as const,
    },
  };
}

function findSession(state: FakeATCState, id: string): FakeATCSession {
  const session = state.sessions.get(id);

  if (session === undefined) {
    throw buildError('no_such_session');
  }

  return session;
}

interface SpawnInput {
  readonly idempotencyKey: string;
  readonly daemon?: string | undefined;
  readonly name: string;
  readonly prompt: string;
  readonly target?: string | undefined;
}

function spawn(state: FakeATCState, input: SpawnInput) {
  const first = state.sessions.get(state.spawnKeys.get(input.idempotencyKey) ?? '');

  if (first !== undefined) {
    return { session: toEntry(first) };
  }

  state.nextID += 1;

  const daemon = input.daemon ?? 'cloud';

  const session: FakeATCSession = {
    id: `${daemon}.${incarnation}.00000000-0000-4000-8000-${String(state.nextID).padStart(12, '0')}`,
    name: input.name,
    cwd: `/work/${input.name}`,
    daemon,
    targetID: input.target ?? daemon,
    state: 'running',
    harness: 'running',
    createdAt: state.now(),
    prompt: input.prompt,
    pending: null,
    result: null,
    hasTranscript: true,
    rows: [],
  };

  state.sessions.set(session.id, session);
  state.spawnKeys.set(input.idempotencyKey, session.id);

  return { session: toEntry(session) };
}

interface MessageInput {
  readonly session: string;
  readonly text: string;
  readonly idempotencyKey: string;
}

function sendMessage(state: FakeATCState, input: MessageInput) {
  findSession(state, input.session);

  const first = state.messageKeys.get(input.idempotencyKey);

  if (first !== undefined) {
    return { message: first, status: 'queued' as const };
  }

  const message = `m${String(state.messages.size + 1)}`;

  state.messages.set(message, { session: input.session, text: input.text });
  state.messageKeys.set(input.idempotencyKey, message);

  return { message, status: 'queued' as const };
}
