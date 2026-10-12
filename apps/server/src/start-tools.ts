import { join } from 'node:path';
import { buildSandboxRecorder } from '@heynixie/sandbox';
import type { SandboxAdapter } from '@heynixie/sandbox';
import type { TasksContext } from '@heynixie/tasks';
import type { ToolDefinition, ToolEndpoint } from '@heynixie/tools';
import { buildSandboxAdapter } from './build-sandbox-adapter';
import type { DeploymentConfig } from './deployment-config-schema';
import type { SandboxImages } from './load-sandbox-manifest';
import { startConversationEndpoint } from './start-conversation-endpoint';
import { fetchImageArgv, startWebFetch } from './start-web-fetch';
import type { WebFetch } from './start-web-fetch';
import type { Cleanup, MemorySlot } from './types';

// The sandbox adapter, the web fetch tool on its fetch sandbox, the conversation's tool
// definitions, and the endpoint that serves them. The memory tools reach the store through the
// slot, which the start sequence fills once the store starts.
export interface Tools {
  readonly adapter: SandboxAdapter;
  readonly endpoint: ToolEndpoint;
  readonly webFetch: WebFetch;

  // the web fetch tool and the 3 memory tools
  readonly definitions: readonly ToolDefinition[];
  readonly memory: MemorySlot;
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
  const slot: { store: ReturnType<MemorySlot['read']> } = { store: null };
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
  const served = await startConversationEndpoint(options, {
    webFetch: webFetch.tool,
    readStore: () => slot.store,
  });

  holder.endpoint = served.endpoint;
  return {
    adapter,
    endpoint: served.endpoint,
    webFetch,
    definitions: served.definitions,
    memory: {
      read: () => slot.store,
      set: (store) => {
        slot.store = store;
      },
    },
  };
}
