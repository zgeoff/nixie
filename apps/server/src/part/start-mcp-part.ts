import { toErrorFields } from '@heynixie/logger';
import type { Mcp, McpConfig } from '@heynixie/mcp';
import { buildToolChangeNote, startMcp } from '@heynixie/mcp';
import { conversationTaskID, writeThreadRecordInTransaction } from '@heynixie/tasks';
import { toSDKToolName } from '@heynixie/tools';
import type { PartReader, ServerParts } from '../types';
import type { ServerPartValues } from './server-part-values';

// Starts the MCP proxy on the credential store and its database backend, which the connections part
// binds first. A start compares the config with the facts in use, holds a widened server for its
// proposal, and lists the tools of each signed-in server.
export async function startMcpPart(
  parts: ServerParts,
  config: McpConfig,
  reader: PartReader<ServerPartValues>,
): Promise<Mcp> {
  const mcp = startMcp({
    log: parts.context.log,
    definitions: parts.context.definitions,
    now: () => parts.context.clock.now(),
    store: parts.credentials.store,
    backend: parts.heldSlot.read().backend,
    formatTime: (timeMs) => formatClockTime(timeMs, parts.config.time.default_zone),

    // A trusted server's change to a tool reaches the conversation's inbox in the transaction that
    // moves the pin.
    onPinMoved: async (tx, move) => {
      const note = buildToolChangeNote(move, {
        definitions: parts.context.definitions(),
        thread: conversationTaskID,
      });

      if (note !== null) {
        await writeThreadRecordInTransaction(tx, parts.context, note);
      }
    },
    servers: config.servers,
    listingTimeoutSeconds: config.listingTimeoutSeconds,
    takenModelNames: () =>
      new Set(
        (reader.find('tools')?.definitions ?? []).map((definition) =>
          toSDKToolName(definition.name),
        ),
      ),
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

async function listOne(parts: ServerParts, mcp: Mcp, serverID: string): Promise<void> {
  try {
    await mcp.list(serverID);
  } catch (error) {
    parts.log('mcp.listing_failed', { server: serverID, ...toErrorFields(error) }, 'warn');
  }
}
