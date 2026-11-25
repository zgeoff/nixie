import type { z } from 'zod';
import type { McpOverrides, McpToolOverride } from '../types';
import { mcpOverridesFileSchema } from './mcp-overrides-file-schema';

export interface McpOverrideProblem {
  readonly path: string;
  readonly reason: string;
}

export type ParsedMcpOverrides =
  | { readonly status: 'parsed'; readonly overrides: McpOverrides }
  | { readonly status: 'refused'; readonly problems: readonly McpOverrideProblem[] };

const filePattern = /^mcp\/(?<server>[^/]+)\.ya?ml$/u;

// Parses the override files of the definitions, `mcp/<server>.yaml`, one file per server and keyed
// by the tool's own name at the server. It knows no server, so a name that no tool holds is for the
// proxy's fit check to find. Any file that fails refuses all of them.
export function parseMcpOverrides(files: ReadonlyMap<string, string>): ParsedMcpOverrides {
  const problems: McpOverrideProblem[] = [];

  const servers = new Map<string, Record<string, McpToolOverride>>();
  const sources = new Map<string, string>();

  for (const [path, text] of [...files].toSorted(([left], [right]) => (left < right ? -1 : 1))) {
    const serverID = filePattern.exec(path)?.groups?.['server'];

    if (serverID === undefined) {
      problems.push({ path, reason: 'an override file is mcp/<server>.yaml, one level deep' });
      continue;
    }

    const parsed = parseOverrideFile(path, text);

    if (parsed.status === 'refused') {
      problems.push(...parsed.problems);
      continue;
    }

    const seen = sources.get(serverID);

    if (seen !== undefined) {
      problems.push({
        path,
        reason: `the server ${serverID} is also in ${seen}, and a server has one override file`,
      });

      continue;
    }

    sources.set(serverID, path);
    servers.set(serverID, parsed.tools);
  }

  return problems.length > 0
    ? { status: 'refused', problems }
    : { status: 'parsed', overrides: Object.fromEntries(servers) };
}

type ParsedFile =
  | { readonly status: 'parsed'; readonly tools: Record<string, McpToolOverride> }
  | { readonly status: 'refused'; readonly problems: readonly McpOverrideProblem[] };

function parseOverrideFile(path: string, text: string): ParsedFile {
  const yaml = parseYAML(text);

  if (yaml instanceof Error) {
    return { status: 'refused', problems: [{ path, reason: yaml.message }] };
  }

  if (yaml === null) {
    return { status: 'parsed', tools: {} };
  }

  const result = mcpOverridesFileSchema.safeParse(yaml);

  if (!result.success) {
    return {
      status: 'refused',
      problems: result.error.issues.map((issue) => ({ path, reason: formatIssue(issue) })),
    };
  }

  return {
    status: 'parsed',
    tools: Object.fromEntries(
      Object.entries(result.data).map(([tool, override]) => [
        tool,
        {
          effects: [...new Set(override.effects)].toSorted(),
          destinations: override.destinations,
          amount: override.amount,
          content: override.content,
          reconcile: override.reconcile,
        },
      ]),
    ),
  };
}

function parseYAML(text: string): unknown {
  try {
    return Bun.YAML.parse(text);
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

function formatIssue(issue: z.core.$ZodIssue): string {
  const at = issue.path.map(String).join('.');

  return at.length === 0 ? issue.message : `${at}: ${issue.message}`;
}
