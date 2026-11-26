import type { HeldWiring } from '@heynixie/credentials';
import { readSnapshotMcpOverrides } from '@heynixie/definitions';
import { toErrorFields } from '@heynixie/logger';
import type { Logger } from '@heynixie/logger';
import type { Mcp, McpConfig } from '@heynixie/mcp';
import { makeToolChangeNotifier, startMcp } from '@heynixie/mcp';
import type { ModelCredentials } from '@heynixie/models';
import type { TasksContext } from '@heynixie/tasks';
import { toSDKToolName } from '@heynixie/tools';
import type { Cleanup, PartReader } from '../types';
import type { ServerPartValues } from './server-part-values';

// What the part reads of the server's parts, which a test supplies without starting the server.
export interface McpPartParts {
  readonly context: TasksContext;
  readonly credentials: Pick<ModelCredentials, 'store'>;
  readonly heldSlot: { readonly read: () => Pick<HeldWiring, 'backend'> };
  readonly config: { readonly time: { readonly default_zone: string } };
  readonly cleanup: Pick<Cleanup, 'defer'>;
  readonly log: Logger;
}

// Starts the MCP proxy on the credential store and its database backend, which the connections part
// binds first. A start compares the config with the facts in use, holds a widened server for its
// proposal, and lists the tools of each signed-in server.
export async function startMcpPart(
  parts: McpPartParts,
  config: McpConfig,
  reader: Pick<PartReader<ServerPartValues>, 'find'>,
): Promise<Mcp> {
  const mcp = startMcp({
    log: parts.context.log,
    definitions: parts.context.definitions,
    now: () => parts.context.clock.now(),
    store: parts.credentials.store,
    backend: parts.heldSlot.read().backend,
    formatTime: (timeMs) => formatClockTime(timeMs, parts.config.time.default_zone),

    // A trusted server's change to a tool reaches the inbox of the conversation, and of each task
    // whose open run holds the tool, in the transaction that moves the pin.
    onPinMoved: makeToolChangeNotifier(parts.context),

    // the override files of the definitions in force, which declare the tools they name
    readOverrides: async (db) => {
      const definitionsHash = parts.context.definitions().snapshotHash;

      return { definitionsHash, servers: await readSnapshotMcpOverrides(db, definitionsHash) };
    },
    servers: config.servers,
    listingTimeoutSeconds: config.listingTimeoutSeconds,
    takenModelNames: () =>
      new Set(
        (reader.find('tools')?.definitions ?? []).map((definition) =>
          toSDKToolName(definition.name),
        ),
      ),
    onRefreshFailed: (error) => {
      parts.log('mcp.refresh_failed', toErrorFields(error), 'warn');
    },
  });

  await mcp.start();
  await parts.cleanup.defer(() => mcp.stop());

  const servers = await mcp.readServers();

  for (const server of servers.filter((row) => row.state === 'added')) {
    void listOne(parts, mcp, server.server_id);
  }

  return mcp;
}

// A time as the owner reads it in their zone, such as 14:05.
function formatClockTime(timeMs: number, zone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(timeMs);
}

async function listOne(parts: McpPartParts, mcp: Mcp, serverID: string): Promise<void> {
  try {
    await mcp.list(serverID);
  } catch (error) {
    parts.log('mcp.listing_failed', { server: serverID, ...toErrorFields(error) }, 'warn');
  }
}
