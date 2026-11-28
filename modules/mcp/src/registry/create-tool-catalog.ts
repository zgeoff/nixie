import type { JSONObject, Log } from '@heynixie/log';
import { findMcpToolOverride } from '@heynixie/policy';
import { buildSchemaParser } from '@heynixie/tools';
import type { RegisteredTool, SchemaCheck, ToolSource } from '@heynixie/tools';
import { runProxiedCall } from '../call/run-proxied-call';
import type { ProxiedCallResult } from '../call/run-proxied-call';
import type { ProxyCalls } from '../call/types';
import { buildToolDeclaration } from '../declaration/build-tool-declaration';
import { readFormsByHash } from '../rows/read-forms-by-hash';
import { readServerRows } from '../rows/read-server-rows';
import { readToolRows } from '../rows/read-tool-rows';
import type { ReadOverrides, ToolDeclaration, ToolForm } from '../types';
import { buildProxiedTool } from './build-proxied-tool';

export interface ToolCatalog extends ToolSource {
  // Reads the tool rows again. The tool names and definitions change only here, so a read of them
  // never waits on the database.
  readonly refresh: () => Promise<void>;

  // Runs one approved call of a served tool through the same clearance as the model's call, once the
  // current form accepts its arguments. Null when the tool is not served.
  readonly runApproved: (tool: string, input: JSONObject) => Promise<ProxiedCallResult | null>;

  // The declaration in force for a served tool, with where it came from. Null when it is not served.
  readonly findDeclaration: (tool: string) => ToolDeclaration | null;
}

// Serves each tool that has a pin and is exposed or stopped, in the form its pin names. A hidden
// tool, a removed tool and every tool of a removed server are left out, and so is a definition that
// fails the registry's checks.
interface ServedTool {
  readonly hash: string;
  readonly tool: RegisteredTool;
  readonly form: ToolForm;
  readonly declared: ToolDeclaration;
  readonly parsePinned: (input: JSONObject) => SchemaCheck;

  // what the cached definition was built from, so another override or snapshot builds it again
  readonly key: string;
}

export function createToolCatalog(
  log: Log,
  calls: ProxyCalls,
  prepareServers: (serverIDs: readonly string[]) => Promise<void>,
  readOverrides: ReadOverrides,
): ToolCatalog {
  const served: { tools: Map<string, ServedTool>; serverIDs: string[] } = {
    tools: new Map(),
    serverIDs: [],
  };

  return {
    toolNames: () => [...served.tools.keys()],
    serverIDs: () => served.serverIDs,
    prepareTaskRun: async (names) => {
      const serverIDs = names.flatMap((name) =>
        name.includes('.') ? [name.split('.')[0] ?? ''] : [],
      );

      await prepareServers([...new Set(serverIDs)]).catch(() => null);
    },
    findTool: (name) => served.tools.get(name)?.tool ?? null,
    findDeclaration: (name) => served.tools.get(name)?.declared ?? null,
    runApproved: (tool, input) => {
      const found = served.tools.get(tool);

      if (found === undefined) {
        return Promise.resolve(null);
      }

      // The pin may have moved since the owner approved the arguments, so they go to the server only
      // when the current pin accepts them. The pin's own schema reads them, because the served one
      // leaves out the argument that an idempotency key fills.
      if (!found.parsePinned(input).isValid) {
        return Promise.resolve({
          kind: 'refused',
          text: `${tool} changed after you approved this call, and its new form no longer accepts the arguments`,
        });
      }

      return runProxiedCall({ tool, form: found.form, pinnedHash: found.hash, input }, calls);
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

      const inForce = await readOverrides(log.writer.db);

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

        // A tool that no longer fits its override runs under what its annotations declare.
        const override =
          row.state === 'stopped_unfit'
            ? null
            : findMcpToolOverride(inForce.servers, row.server_id, form.name);

        const key = JSON.stringify([
          hash,
          override,
          override === null ? null : inForce.definitionsHash,
        ]);

        if (kept?.key === key) {
          next.set(row.tool, kept);
          continue;
        }

        const declared = buildToolDeclaration({
          tool: row.tool,
          pinned: form,
          pinnedHash: hash,
          override,
          definitionsHash: inForce.definitionsHash,
        });

        const built = buildProxiedTool(row.tool, form, calls, declared);

        if (built.kind === 'built' && declared !== null) {
          next.set(row.tool, {
            hash,
            tool: built.tool,
            form,
            declared,
            parsePinned: buildSchemaParser(form.inputSchema),
            key,
          });
        }
      }

      served.tools = next;
      served.serverIDs = [...live];
    },
  };
}
