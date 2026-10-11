import { join } from 'node:path';
import { makeDecisionPoint } from '@heynixie/policy';
import { buildSandboxRecorder } from '@heynixie/sandbox';
import type { SandboxAdapter } from '@heynixie/sandbox';
import type { TasksContext } from '@heynixie/tasks';
import type { ActionQueue, ToolEndpoint } from '@heynixie/tools';
import { buildToolRegistry, startToolEndpoint } from '@heynixie/tools';
import { buildSandboxAdapter } from './build-sandbox-adapter';
import type { DeploymentConfig } from './deployment-config-schema';
import type { SandboxImages } from './load-sandbox-manifest';
import { fetchImageArgv, startWebFetch } from './start-web-fetch';
import type { WebFetch } from './start-web-fetch';
import type { Cleanup } from './types';

// The sandbox adapter, the web fetch tool on its fetch sandbox, and the endpoint that serves it.
export interface Tools {
  readonly adapter: SandboxAdapter;
  readonly endpoint: ToolEndpoint;
  readonly webFetch: WebFetch;
}

export interface ToolsOptions {
  readonly config: DeploymentConfig;
  readonly images: SandboxImages;
  readonly context: TasksContext;
  readonly impdToken: string;
  readonly cleanup: Cleanup;
}

// Starts the sandbox adapter, the web fetch tool on its fetch sandbox, and the tool endpoint that
// serves it. The adapter resolves a sandbox's endpoint when its guest connects, after the endpoint
// exists.
export async function startTools(options: ToolsOptions): Promise<Tools> {
  const holder: { endpoint: ToolEndpoint | null } = { endpoint: null };
  const adapter = buildSandboxAdapter({
    recorder: buildSandboxRecorder({
      log: options.context.log,
      definitions: options.context.definitions,
    }),
    toolTarget: (sandbox) => {
      if (holder.endpoint === null) {
        throw new Error('the tool endpoint has not started');
      }
      return holder.endpoint.getToolTarget(sandbox);
    },
    imp: { ...options.config.imp, token: options.impdToken },
    testRootDir: join(options.config.server.dataDir, 'sandboxes'),
  });
  const webFetch = startWebFetch({
    adapter,
    image: options.images.fetch.name,
    argv: fetchImageArgv,
    deniedRanges: [
      ...(options.config.imp.publicEgress?.hostAddresses ?? []),
      ...(options.config.imp.publicEgress?.egressDeny ?? []),
    ],
    config: options.config.web_fetch,
  });

  await options.cleanup.defer(() => webFetch.stop());
  holder.endpoint = await startEndpoint(options, webFetch.tool);
  return { adapter, endpoint: holder.endpoint, webFetch };
}

async function startEndpoint(
  options: ToolsOptions,
  tool: Tools['webFetch']['tool'],
): Promise<ToolEndpoint> {
  const registry = buildToolRegistry([tool]);
  const endpoint = await startToolEndpoint({
    socketDir: join(options.config.server.dataDir, 'run', 'tools'),
    registry,
    decide: makeDecisionPoint({
      findDeclaration: (name) => registry.findTool(name)?.definition.declaration ?? null,
    }),
    log: options.context.log,
    definitions: options.context.definitions,
    queue: refusingQueue,
  });

  await options.cleanup.defer(() => endpoint.stop());
  return endpoint;
}

// No tool in a slice 1 release runs queued: the read-only rule denies every call with an effect
// outside nixie before it reaches the queue.
const refusingQueue: ActionQueue = {
  enqueue: () => Promise.reject(new Error('no tool in this build runs queued')),
  waitForOutcome: () => Promise.resolve(null),
};
