import { hasQueuedEffect } from '@heynixie/policy';
import type { EffectDeclaration } from '@heynixie/policy';
import type { ToolDefinition } from '@heynixie/tools';
import type { ToolForm } from '../types';
import { collectStringArguments } from './collect-string-arguments';

const defaultOutput = { type: 'object', properties: { text: { type: 'string' } } };

// Declares the strictest effects for every tool: a call writes, deletes and sends, and each string
// argument counts as content. Every result field is untrusted. A call answers with an error until
// the proxy can run one.
export function buildProxiedDefinition(tool: string, pinned: ToolForm): ToolDefinition {
  const output = pinned.outputSchema ?? defaultOutput;

  const declaration: EffectDeclaration = {
    effects: ['write', 'delete', 'send'],
    destinations: [],
    amount: null,
    content: collectStringArguments(pinned.inputSchema),
    results: Object.fromEntries(
      listOutputFields(output).map((field) => [field, 'untrusted' as const]),
    ),
  };

  return {
    name: tool,
    description: pinned.description ?? '',
    input: pinned.inputSchema,
    output,
    declaration,
    execution: hasQueuedEffect(declaration.effects) ? 'queued' : 'direct',
    run: () =>
      Promise.resolve({
        status: 'error',
        message: `${tool} cannot run yet: the proxy has no call path in this build`,
      }),
  };
}

function listOutputFields(output: Record<string, unknown>): string[] {
  const properties = output['properties'];

  return typeof properties === 'object' && properties !== null && !Array.isArray(properties)
    ? Object.keys(properties)
    : [];
}
