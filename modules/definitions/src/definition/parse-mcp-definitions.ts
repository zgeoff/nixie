import type { McpOverrides } from '@heynixie/policy';
import { parseMcpOverrides } from '@heynixie/policy';
import { DefinitionsParseError } from '../utils/definitions-parse-error';

export interface McpDefinitions {
  readonly overrides: McpOverrides;
  readonly paths: ReadonlySet<string>;
}

const mcpFilePattern = /^mcp\/.+\.ya?ml$/u;

// A prompts map can name a file under mcp/ as a prompt part, and that file holds prompt text.
export function parseMcpDefinitions(
  texts: ReadonlyMap<string, string>,
  partFiles: ReadonlySet<string>,
): McpDefinitions {
  const files = new Map(
    [...texts].filter(([path]) => mcpFilePattern.test(path) && !partFiles.has(path)),
  );

  const parsed = parseMcpOverrides(files);

  if (parsed.status === 'refused') {
    throw new DefinitionsParseError(parsed.problems);
  }

  return { overrides: parsed.overrides, paths: new Set(files.keys()) };
}
