import { join } from 'node:path';
import { buildSandboxRecorder } from '@heynixie/sandbox';
import type { SandboxAdapter } from '@heynixie/sandbox';
import type { ToolDefinition, ToolEndpoint } from '@heynixie/tools';
import type { Actions } from './build-actions';
import { buildActions } from './build-actions';
import type { SandboxAdapterOptions } from './build-sandbox-adapter';
import { buildSandboxAdapter } from './build-sandbox-adapter';
import { startConversationEndpoint } from './start-conversation-endpoint';
import { startWebFetch } from './start-web-fetch';
import type { WebFetch } from './start-web-fetch';
import type { MemorySlot, ServerParts } from './types';

// The sandbox adapter, the web fetch tool on its fetch sandbox, the conversation's tool
// definitions, the endpoint that serves them, and the action queue. The memory tools reach the
// store through the slot, which the start sequence fills once the store starts.
export interface Tools {
  readonly adapter: SandboxAdapter;
  readonly endpoint: ToolEndpoint;
  readonly webFetch: WebFetch;

  // the web fetch tool, the time tool, the log reader and the memory tools
  readonly definitions: readonly ToolDefinition[];
  readonly memory: MemorySlot;
  readonly actions: Actions;
}

export interface ToolsOptions extends Pick<
  ServerParts,
  'config' | 'images' | 'context' | 'cleanup' | 'log'
> {
  readonly sandbox: SandboxAdapterOptions['sandbox'];
}

// Starts the sandbox adapter, the web fetch tool on its fetch sandbox, the action queue, and the
// tool endpoint that serves the conversation's tools. The adapter resolves a sandbox's endpoint when
// its guest connects, after the endpoint exists.
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
    sandbox: options.sandbox,
    testRootDir: join(options.config.server.dataDir, 'sandboxes'),
    hostEnv: process.env,
  });

  const publicEgress = options.sandbox.adapter === 'imp' ? options.sandbox.imp.publicEgress : null;

  const webFetch = startWebFetch({
    adapter,
    image: options.images.fetch.name,
    deniedRanges: [...(publicEgress?.hostAddresses ?? []), ...(publicEgress?.egressDeny ?? [])],
    config: options.config.web_fetch,
  });

  await options.cleanup.defer(() => webFetch.stop());

  const actions = buildActions(options.context, options.log);

  const served = await startConversationEndpoint(options, {
    webFetch: webFetch.tool,
    queue: actions.queue,
    readStore: () => slot.store,
  });

  holder.endpoint = served.endpoint;

  return {
    adapter,
    endpoint: served.endpoint,
    webFetch,
    definitions: served.definitions,
    actions,
    memory: {
      read: () => slot.store,
      set: (store) => {
        slot.store = store;
      },
    },
  };
}
