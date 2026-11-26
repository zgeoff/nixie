import type { JSONObject } from '@heynixie/log';
import { buildSchemaParser } from '@heynixie/tools';
import type { ProxyCalls } from '../call/types';
import { buildToolDeclaration } from '../declaration/build-tool-declaration';
import type { ToolForm } from '../types';
import { buildProxiedTool } from './build-proxied-tool';

// The calls of a build that only asks the registry whether it accepts the form: nothing runs.
const checkOnlyCalls: ProxyCalls = {
  clear: () => Promise.resolve({ kind: 'cleared', pinnedHash: null }),
  send: () => Promise.resolve({ kind: 'failed', message: 'was never called' }),
};

// Why the registry refuses the form of a tool, or null when it registers. A schema compiles at its
// first parse, so each one is parsed here once and a schema that cannot compile refuses the form
// before a call meets it.
export function pickFormRefusal(tool: string, form: ToolForm): string | null {
  const uncompiled = [form.inputSchema, form.outputSchema].find(
    (schema) => schema !== null && !canCompile(schema),
  );

  if (uncompiled !== undefined) {
    return 'a schema of the form does not compile';
  }

  const declared = buildToolDeclaration({
    tool,
    pinned: form,
    pinnedHash: 'check-only',
    override: null,
    definitionsHash: '',
  });

  const built = buildProxiedTool(tool, form, checkOnlyCalls, declared);

  return built.kind === 'refused' ? built.reason : null;
}

function canCompile(schema: JSONObject): boolean {
  try {
    buildSchemaParser(schema)({});

    return true;
  } catch {
    return false;
  }
}
