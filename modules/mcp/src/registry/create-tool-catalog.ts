import type { Log } from '@heynixie/log';
import { buildToolRegistry } from '@heynixie/tools';
import type { RegisteredTool, ToolSource } from '@heynixie/tools';
import { readFormsByHash } from '../rows/read-forms-by-hash';
import { readServerRows } from '../rows/read-server-rows';
import { readToolRows } from '../rows/read-tool-rows';
import { buildProxiedDefinition } from './build-proxied-definition';

export interface ToolCatalog extends ToolSource {
  // Reads the tool rows again. The tool names and definitions change only here, so a read of them
  // never waits on the database.
  readonly refresh: () => Promise<void>;
}

// Serves each tool that has a pin and is exposed or stopped, in the form its pin names. A hidden
// tool, a removed tool and every tool of a removed server are left out, and so is a definition that
// fails the registry's checks.
export function createToolCatalog(log: Log): ToolCatalog {
  const served = { tools: new Map<string, { hash: string; tool: RegisteredTool }>() };

  return {
    toolNames: () => [...served.tools.keys()],
    findTool: (name) => served.tools.get(name)?.tool ?? null,
    refresh: async () => {
      const servers = await readServerRows(log.writer.db);
      const rows = await readToolRows(log.writer.db);

      const live = new Set(
        servers.filter((server) => server.state !== 'removed').map((server) => server.server_id),
      );

      const listed = rows.filter(
        (row) =>
          row.pinned_hash !== null &&
          live.has(row.server_id) &&
          (row.state === 'exposed' ||
            row.state === 'stopped_changed' ||
            row.state === 'stopped_unfit'),
      );

      const forms = await readFormsByHash(
        log,
        listed.flatMap((row) => row.pinned_hash ?? []),
      );

      const next = new Map<string, { hash: string; tool: RegisteredTool }>();

      for (const row of listed) {
        const hash = row.pinned_hash ?? '';
        const kept = served.tools.get(row.tool);
        const form = forms.get(hash)?.form ?? null;

        if (kept?.hash === hash) {
          next.set(row.tool, kept);
        } else if (form !== null) {
          const built = tryBuild(row.tool, form);

          if (built !== null) {
            next.set(row.tool, { hash, tool: built });
          }
        }
      }

      served.tools = next;
    },
  };
}

function tryBuild(
  tool: string,
  form: Parameters<typeof buildProxiedDefinition>[1],
): RegisteredTool | null {
  try {
    return buildToolRegistry([buildProxiedDefinition(tool, form)]).findTool(tool);
  } catch {
    return null;
  }
}
