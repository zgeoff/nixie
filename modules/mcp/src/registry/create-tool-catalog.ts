import type { JSONObject, Log } from '@heynixie/log';
import type { RegisteredTool, ToolSource } from '@heynixie/tools';
import { runProxiedCall } from '../call/run-proxied-call';
import type { ProxiedCallResult } from '../call/run-proxied-call';
import type { ProxyCalls } from '../call/types';
import { readFormsByHash } from '../rows/read-forms-by-hash';
import { readServerRows } from '../rows/read-server-rows';
import { readToolRows } from '../rows/read-tool-rows';
import type { ToolForm } from '../types';
import { buildProxiedTool } from './build-proxied-tool';

export interface ToolCatalog extends ToolSource {
  // Reads the tool rows again. The tool names and definitions change only here, so a read of them
  // never waits on the database.
  readonly refresh: () => Promise<void>;

  // Runs one approved call of a served tool through the same clearance as the model's call, once the
  // current form accepts its arguments. Null when the tool is not served.
  readonly runApproved: (tool: string, input: JSONObject) => Promise<ProxiedCallResult | null>;
}

// Serves each tool that has a pin and is exposed or stopped, in the form its pin names. A hidden
// tool, a removed tool and every tool of a removed server are left out, and so is a definition that
// fails the registry's checks.
interface ServedTool {
  readonly hash: string;
  readonly tool: RegisteredTool;
  readonly form: ToolForm;
}

export function createToolCatalog(
  log: Log,
  calls: ProxyCalls,
  prepareServers: (serverIDs: readonly string[]) => Promise<void>,
): ToolCatalog {
  const served = { tools: new Map<string, ServedTool>() };

  return {
    toolNames: () => [...served.tools.keys()],
    prepareTaskRun: async (names) => {
      const serverIDs = names.flatMap((name) =>
        name.includes('.') ? [name.split('.')[0] ?? ''] : [],
      );

      await prepareServers([...new Set(serverIDs)]).catch(() => null);
    },
    findTool: (name) => served.tools.get(name)?.tool ?? null,
    runApproved: (tool, input) => {
      const found = served.tools.get(tool);

      if (found === undefined) {
        return Promise.resolve(null);
      }

      // The owner approved the arguments under the form the call loaded, and the pin may have moved
      // since, so they go to the server only when the current form still accepts them.
      if (!found.tool.parseInput(input).isValid) {
        return Promise.resolve({
          kind: 'refused',
          text: `${tool} changed after you approved this call, and its new form no longer accepts the arguments`,
        });
      }

      return runProxiedCall({ tool, form: found.form, input }, calls);
    },
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

      const next = new Map<string, ServedTool>();

      for (const row of listed) {
        const hash = row.pinned_hash ?? '';
        const kept = served.tools.get(row.tool);
        const form = forms.get(hash)?.form ?? null;

        // A form whose record a forget erased is gone from the registry, whatever it cached.
        if (form === null) {
          continue;
        }

        if (kept?.hash === hash) {
          next.set(row.tool, kept);
          continue;
        }

        const built = buildProxiedTool(row.tool, form, calls, hash);

        if (built.kind === 'built') {
          next.set(row.tool, { hash, tool: built.tool, form });
        }
      }

      served.tools = next;
    },
  };
}
