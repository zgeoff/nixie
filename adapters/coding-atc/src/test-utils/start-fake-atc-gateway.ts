import { GATEWAY_MAJOR_HEADER } from '@atcx/contract';
import { CONTRACT_MAJOR } from '@atcx/contract/light';
import { RPCHandler } from '@orpc/server/fetch';
import { buildError, createFakeATCRouter } from './create-fake-atc-router';
import type { FakeATCContext } from './create-fake-atc-router';
import type {
  FakeATCCall,
  FakeATCEvent,
  FakeATCFailure,
  FakeATCSession,
  FakeATCState,
} from './fake-atc-state';

export interface FakeATCGatewayOptions {
  // the major version of the contract the gateway serves
  readonly major?: number;
  readonly token?: string;
  readonly now?: () => number;
}

export interface FakeATCGateway {
  // the gateway's base URL; its fleet API is under `/rpc`
  readonly url: string;
  readonly token: string;
  readonly calls: readonly FakeATCCall[];
  readonly sessions: Map<string, FakeATCSession>;

  // adds a session that runs outside nixie, such as one the user started on a configured target
  readonly addSession: (seed: Partial<FakeATCSession> & { readonly id: string }) => FakeATCSession;

  // appends events to the trail
  readonly emit: (...events: readonly FakeATCEvent[]) => void;

  // the next call of the procedure, such as `session.spawn`, answers this failure, once
  readonly failNext: (procedure: string, failure: FakeATCFailure) => void;

  // how the gateway reports the daemon `cloud` from now on
  readonly setDaemonState: (daemonState: FakeATCState['daemonState']) => void;
  readonly stop: () => Promise<void>;
}

// A fake atc-gateway: a real HTTP server on a loopback port that serves atc's fleet contract over
// in-memory sessions and an event trail. It checks the bearer and the contract's major version as
// the real gateway does.
export function startFakeATCGateway(options: FakeATCGatewayOptions = {}): FakeATCGateway {
  const token = options.token ?? 'atcs_test_token';

  const state: FakeATCState = {
    sessions: new Map(),
    trail: [],
    calls: [],
    spawnKeys: new Map(),
    messageKeys: new Map(),
    failures: new Map(),
    messages: new Map(),
    daemonState: 'up',
    major: options.major ?? CONTRACT_MAJOR,
    nextID: 0,
    now: options.now ?? Date.now,
  };

  const handler = new RPCHandler<FakeATCContext>(createFakeATCRouter(state), {
    clientInterceptors: [
      async (call) => {
        const procedure = call.path.join('.');

        if (!call.context.isMajorMatching) {
          throw buildError(
            'protocol_mismatch',
            `this gateway serves contract major ${state.major}`,
          );
        }

        state.calls.push({ procedure, args: toArgs(call.input) });

        const failure = state.failures.get(procedure)?.shift();

        if (failure?.kind === 'code') {
          throw buildError(failure.code);
        }

        if (failure?.kind === 'hang') {
          await new Promise<never>(() => {});
        }

        const answer = await call.next();

        if (failure?.kind === 'lost') {
          throw buildError('outcome_unknown');
        }

        return answer;
      },
    ],
  });

  const answerRequest = async (request: Request): Promise<Response> => {
    if (request.headers.get('authorization') !== `Bearer ${token}`) {
      return new Response('unauthorized', { status: 401 });
    }

    const status = readHTTPFailure(state, request);

    if (status !== null) {
      return new Response('failed', { status });
    }

    const major = request.headers.get(GATEWAY_MAJOR_HEADER);

    const result = await handler.handle(request, {
      prefix: '/rpc',
      context: { isMajorMatching: major === String(state.major) },
    });

    return result.matched ? result.response : new Response(null, { status: 404 });
  };

  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    idleTimeout: 0,
    fetch: answerRequest,
  });

  return {
    url: `http://127.0.0.1:${String(server.port)}`,
    token,
    calls: state.calls,
    sessions: state.sessions,
    addSession: (seed) => {
      const session: FakeATCSession = {
        name: seed.id,
        cwd: `/work/${seed.id}`,
        daemon: 'cloud',
        targetID: 'cloud',
        state: 'running',
        harness: 'running',
        createdAt: state.now(),
        prompt: null,
        pending: null,
        result: null,
        hasTranscript: true,
        rows: [],
        ...seed,
      };

      state.sessions.set(session.id, session);

      return session;
    },
    emit: (...events) => {
      state.trail.push(...events);
    },
    failNext: (procedure, failure) => {
      state.failures.set(procedure, [...(state.failures.get(procedure) ?? []), failure]);
    },
    setDaemonState: (daemonState) => {
      state.daemonState = daemonState;
    },
    stop: async () => {
      await server.stop(true);
    },
  };
}

function toArgs(input: unknown): Readonly<Record<string, unknown>> {
  return typeof input === 'object' && input !== null
    ? Object.fromEntries(Object.entries(input))
    : {};
}

// The HTTP status that an armed failure answers in place of the procedure this request names.
function readHTTPFailure(state: FakeATCState, request: Request): number | null {
  const procedure = new URL(request.url).pathname.split('/').slice(2).join('.');

  const failure = state.failures.get(procedure)?.[0];

  if (failure?.kind !== 'http') {
    return null;
  }

  state.failures.get(procedure)?.shift();

  return failure.status;
}
