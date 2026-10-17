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

  // each token's own MCP handler, the run's token and every step token, so a call's run carries
  // the identity of the step whose token it arrived with
  const handlers = new Map<string, McpHandler>([
    [token, createMcpHandler(() => buildRunServer(spec.run, spec.options))],
  ]);

  const server = Bun.serve({
    unix: spec.socketPath,
    fetch: makeRunFetch((authorization) =>
      state.isRevoked ? null : findTokenHandler(handlers, authorization),
    ),

    // A listen stream stays open for the run, and a call can outlast any idle limit. Bun applies
    // its 10 s default to a Unix socket too, though bun-types leaves the option off.
    ...({ idleTimeout: 0 } as object),
  });

  return {
    runID: spec.run.runID,
    token,
    socketPath: spec.socketPath,
    target: { path: spec.socketPath },
    startStep: makeStepStarter(spec, handlers),
    stop: async () => {
      if (state.isRevoked) {
        return;
      }

      state.isRevoked = true;

      spec.onStop();

      const stopped = [...handlers.values()];

      handlers.clear();

      await Promise.all(stopped.map((handler) => handler.close()));
      await server.stop(true);

      await rm(spec.socketPath, { force: true });
    },
  };
}

type McpHandler = ReturnType<typeof createMcpHandler>;

// Each step token gets a handler of its own over the run with the step's run ID, and stopping the
// step revokes the token and closes the streams opened with it.
function makeStepStarter(
  spec: RunEndpointSpec,

  handlers: Map<string, McpHandler>,
): RunEndpoint['startStep'] {
  return (stepRunID) => {
    const token = randomBytes(32).toString('base64url');
    const stepRun: ToolRun = { ...spec.run, stepRunID };
    const handler = createMcpHandler(() => buildRunServer(stepRun, spec.options));

    handlers.set(token, handler);

    return {
      token,
      stop: async () => {
        if (handlers.delete(token)) {
          await handler.close();
        }
      },
    };
  };
}

// the handler of the token the request presents, or null when it presents none of the run's tokens
function findTokenHandler(
  handlers: ReadonlyMap<string, McpHandler>,
  authorization: string | null,
): McpHandler | null {
  for (const [token, handler] of handlers) {
    if (isRunToken(authorization, token)) {
      return handler;
    }
  }

  return null;
}

type FindHandler = (authorization: string | null) => McpHandler | null;

// The MCP handler's response goes back unread, so each chunk of a stream reaches the guest as the
// server writes it: the CLI waits for the listen stream's acknowledgement before it lists tools.
function makeRunFetch(findHandler: FindHandler): (request: Request) => Promise<Response> {
  return (request) => {
    const handler = findHandler(request.headers.get('authorization'));

    if (handler === null) {
      return Promise.resolve(
        new Response('unauthorized', { status: 401, headers: { 'www-authenticate': 'Bearer' } }),
      );
    }

    if (new URL(request.url).pathname !== '/mcp') {
      return Promise.resolve(new Response('not found', { status: 404 }));
    }

    return handler.fetch(request);
  };
}

function isRunToken(authorization: string | null, token: string): boolean {
  const presented = Buffer.from(authorization ?? '');
  const expected = Buffer.from(`Bearer ${token}`);

  return presented.length === expected.length && timingSafeEqual(presented, expected);
}
