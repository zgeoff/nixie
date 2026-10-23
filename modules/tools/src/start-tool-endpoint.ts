import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createRunServer } from './create-run-server';
import type { ToolCallOptions } from './run-tool-call';
import type { RunEndpoint, ToolEndpoint, ToolRun } from './types';

export interface ToolEndpointOptions extends Omit<ToolCallOptions, 'queuedWaitMs'> {
  readonly socketDir: string;

  readonly queuedWaitMs?: number;
}

export async function startToolEndpoint(options: ToolEndpointOptions): Promise<ToolEndpoint> {
  await mkdir(options.socketDir, { recursive: true, mode: 0o700 });

  const callOptions: ToolCallOptions = { ...options, queuedWaitMs: options.queuedWaitMs ?? 10_000 };

  const runs = new Map<string, RunEndpoint>();

  // Bun's server stop unlinks its socket path even after another process bound that path, so a
  // stale nixie that stops would remove the new one's socket. The writer epoch keeps each process's
  // names apart, and the endpoints of one process agree on a run's name.
  const getSocketPath = (runID: string) =>
    join(options.socketDir, buildSocketName(`${String(options.log.writer.epoch)}:${runID}`));

  return {
    startRun: (run) =>
      Promise.try(() => {
        if (runs.has(run.runID)) {
          throw new Error(`the run ${run.runID} already has a tool endpoint`);
        }

        const endpoint = startRunEndpoint({
          run,
          socketPath: getSocketPath(run.runID),
          options: callOptions,
          onStop: () => {
            runs.delete(run.runID);
          },
        });

        runs.set(run.runID, endpoint);

        return endpoint;
      }),

    getToolTarget: (sandbox) => ({ path: getSocketPath(sandbox.owner) }),
    stop: async () => {
      await Promise.all([...runs.values()].map((endpoint) => endpoint.stop()));
    },
  };
}

// A Unix socket path has a length limit, so the name is a fixed-length hash.
function buildSocketName(key: string): string {
  return `${createHash('sha256').update(key).digest('hex').slice(0, 32)}.sock`;
}

interface RunEndpointSpec {
  readonly run: ToolRun;
  readonly socketPath: string;
  readonly options: ToolCallOptions;
  readonly onStop: () => void;
}

type McpHandler = ReturnType<typeof createMcpHandler>;

function startRunEndpoint(spec: RunEndpointSpec): RunEndpoint {
  const token = randomBytes(32).toString('base64url');
  const state = { isRevoked: false };

  const handlers = new Map<string, McpHandler>([
    [token, createMcpHandler(() => createRunServer(spec.run, spec.options))],
  ]);

  const server = Bun.serve({
    unix: spec.socketPath,
    fetch: makeRunFetch((authorization) =>
      state.isRevoked ? null : findTokenHandler(handlers, authorization),
    ),

    // A listen stream stays open for the whole run, and a call can outlast any idle limit.
    idleTimeout: 0,
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

type FindHandler = (authorization: string | null) => McpHandler | null;

// The MCP handler's response goes back unread, so each chunk of a stream reaches the guest as the
// server writes it: Claude Code waits for the listen stream's acknowledgement before it lists tools.
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

function isRunToken(authorization: string | null, token: string): boolean {
  const presented = Buffer.from(authorization ?? '');
  const expected = Buffer.from(`Bearer ${token}`);

  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

function makeStepStarter(
  spec: RunEndpointSpec,

  handlers: Map<string, McpHandler>,
): RunEndpoint['startStep'] {
  return (stepRunID, session) => {
    const token = randomBytes(32).toString('base64url');

    const stepRun: ToolRun = {
      ...spec.run,
      stepRunID,
      ...(session === undefined ? {} : { session }),
    };

    const handler = createMcpHandler(() => createRunServer(stepRun, spec.options));

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
