import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { buildRunServer } from './build-run-server';
import type { ToolCallOptions } from './run-tool-call';
import type { RunEndpoint, ToolEndpoint, ToolRun } from './types';

export interface ToolEndpointOptions extends Omit<ToolCallOptions, 'queuedWaitMs'> {
  // the directory that holds one Unix socket per run, which only nixie's user may enter
  readonly socketDir: string;

  // how long an allowed queued call waits for its outcome inside the turn, 10 s by default
  readonly queuedWaitMs?: number;
}

// Starts nixie's tool endpoint: one stateless Streamable HTTP MCP server per run, on a Unix socket
// of its own. The socket a connection arrives on names its run whatever the guest claims, and the
// run's bearer token is a second check.
export async function startToolEndpoint(options: ToolEndpointOptions): Promise<ToolEndpoint> {
  await mkdir(options.socketDir, { recursive: true, mode: 0o700 });

  const callOptions: ToolCallOptions = { ...options, queuedWaitMs: options.queuedWaitMs ?? 10_000 };
  const runs = new Map<string, RunEndpoint>();
  const getSocketPath = (runID: string) => join(options.socketDir, buildSocketName(runID));

  return {
    startRun: async (run) => {
      if (runs.has(run.runID)) {
        throw new Error(`the run ${run.runID} already has a tool endpoint`);
      }
      const endpoint = await startRunEndpoint({
        run,
        socketPath: getSocketPath(run.runID),
        options: callOptions,
        onStop: () => {
          runs.delete(run.runID);
        },
      });

      runs.set(run.runID, endpoint);
      return endpoint;
    },

    // the run's ID is its sandbox's owner
    getToolTarget: (sandbox) => ({ path: getSocketPath(sandbox.owner) }),
    stop: async () => {
      await Promise.all([...runs.values()].map((endpoint) => endpoint.stop()));
    },
  };
}

// A socket name of fixed length from any run ID, inside the Unix socket path limit.
function buildSocketName(runID: string): string {
  return `${createHash('sha256').update(runID).digest('hex').slice(0, 32)}.sock`;
}

interface RunEndpointSpec {
  readonly run: ToolRun;
  readonly socketPath: string;
  readonly options: ToolCallOptions;
  readonly onStop: () => void;
}

async function startRunEndpoint(spec: RunEndpointSpec): Promise<RunEndpoint> {
  // a socket file left by a process that crashed would refuse the listen
  await rm(spec.socketPath, { force: true });

  const token = randomBytes(32).toString('base64url');
  const state = { isRevoked: false };
  const handler = createMcpHandler(() => buildRunServer(spec.run, spec.options));
  const server = Bun.serve({
    unix: spec.socketPath,
    fetch: makeRunFetch({
      isAuthorized: (authorization) => !state.isRevoked && isRunToken(authorization, token),
      serve: (request) => handler.fetch(request),
    }),

    // A listen stream stays open for the run, and a call can outlast any idle limit. Bun applies
    // its 10 s default to a Unix socket too, though bun-types leaves the option off.
    ...({ idleTimeout: 0 } as object),
  });

  return {
    runID: spec.run.runID,
    token,
    socketPath: spec.socketPath,
    target: { path: spec.socketPath },
    stop: async () => {
      if (state.isRevoked) {
        return;
      }
      state.isRevoked = true;
      spec.onStop();
      await handler.close();
      await server.stop(true);
      await rm(spec.socketPath, { force: true });
    },
  };
}

interface RunGate {
  readonly isAuthorized: (authorization: string | null) => boolean;

  // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a Request has no readonly form
  readonly serve: (request: Request) => Promise<Response>;
}

// The MCP handler's response goes back unread, so each chunk of a stream reaches the guest as the
// server writes it: the CLI waits for the listen stream's acknowledgement before it lists tools.
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a Request has no readonly form
function makeRunFetch(gate: RunGate): (request: Request) => Promise<Response> {
  return (request) => {
    if (!gate.isAuthorized(request.headers.get('authorization'))) {
      return Promise.resolve(
        new Response('unauthorized', { status: 401, headers: { 'www-authenticate': 'Bearer' } }),
      );
    }
    if (new URL(request.url).pathname !== '/mcp') {
      return Promise.resolve(new Response('not found', { status: 404 }));
    }
    return gate.serve(request);
  };
}

function isRunToken(authorization: string | null, token: string): boolean {
  const presented = Buffer.from(authorization ?? '');
  const expected = Buffer.from(`Bearer ${token}`);

  return presented.length === expected.length && timingSafeEqual(presented, expected);
}
