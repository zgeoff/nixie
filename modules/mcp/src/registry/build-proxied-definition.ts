import { hasQueuedEffect } from '@heynixie/policy';
import type { EffectDeclaration } from '@heynixie/policy';
import type { ToolDefinition } from '@heynixie/tools';
import type { ToolForm } from '../types';
import { collectStringArguments } from './collect-string-arguments';

// The result shape of a tool with no output schema. The proxy has no call path in this build, so
// every call answers in this shape whatever schema the pinned form names.
const placeholderOutput = { type: 'object', properties: { text: { type: 'string' } } };

// Declares the strictest effects for every tool, with each string argument as content. The tool is
// queued, so dispatch never reaches `run`: `prepare` ends each valid call with the unavailable
// result before the decision point, so no call asks for approval or queues an action.
export function buildProxiedDefinition(tool: string, pinned: ToolForm): ToolDefinition {
  const declaration: EffectDeclaration = {
    effects: ['write', 'delete', 'send'],
    destinations: [],
    amount: null,
    content: collectStringArguments(pinned.inputSchema),
    results: Object.fromEntries(
      listOutputFields(placeholderOutput).map((field) => [field, 'untrusted' as const]),
    ),
  };

  const unavailable = `${tool} cannot run yet: the proxy has no call path in this build`;

  return {
    name: tool,
    description: pinned.description ?? '',
    input: pinned.inputSchema,
    output: placeholderOutput,
    declaration,
    execution: hasQueuedEffect(declaration.effects) ? 'queued' : 'direct',
    prepare: () => Promise.resolve({ result: { text: unavailable }, refusalCode: 'unavailable' }),
    run: () => Promise.resolve({ status: 'error', message: unavailable }),
  };
}

function listOutputFields(output: Record<string, unknown>): string[] {
  const properties = output['properties'];

  return typeof properties === 'object' && properties !== null && !Array.isArray(properties)
    ? Object.keys(properties)
    : [];
}
