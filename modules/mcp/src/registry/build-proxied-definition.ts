import { hasQueuedEffect } from '@heynixie/policy';
import type { EffectDeclaration } from '@heynixie/policy';
import type { ToolDefinition, ToolImage, ToolOutcome } from '@heynixie/tools';
import { runProxiedCall } from '../call/run-proxied-call';
import type { ProxyCalls } from '../call/types';
import type { ToolDeclaration, ToolForm } from '../types';

// The result shape of a tool whose pinned form has no output schema.
const textOutput = { type: 'object', properties: { text: { type: 'string' } } };

// Builds the definition a pinned form registers as, under the declaration in force for it. Every
// call is cleared first, and the definition names its pin so a call runs only under the form it
// loaded.
export function buildProxiedDefinition(
  tool: string,
  pinned: ToolForm,
  calls: ProxyCalls,
  declared: ToolDeclaration,
): ToolDefinition {
  const declaration = toEffectDeclaration(declared, pinned);
  const output = pinned.outputSchema ?? textOutput;

  return {
    name: tool,
    description: pinned.description ?? '',
    input: pinned.inputSchema,
    output,
    declaration,
    execution: hasQueuedEffect(declaration.effects) ? 'queued' : 'direct',
    pinHash: declared.pinnedHash,
    outsideErrors: true,
    clear: async () => {
      const clearance = await calls.clear(tool);

      return clearance.kind === 'refused' ? clearance.text : null;
    },
    run: async (call, context) => {
      const result = await runProxiedCall({ tool, form: pinned, input: call.input }, calls);

      return result.kind === 'answered'
        ? limitImages(result.outcome, context.run.session?.reserveImages)
        : { status: 'error', message: result.text };
    },
  };
}

// The declaration of a pinned form with its results: every result field is untrusted.
function toEffectDeclaration(declared: ToolDeclaration, pinned: ToolForm): EffectDeclaration {
  return {
    effects: [...declared.declaration.effects],
    destinations: [...declared.declaration.destinations],
    amount: declared.declaration.amount,
    content: [...declared.declaration.content],
    results: Object.fromEntries(
      listOutputFields(pinned.outputSchema ?? textOutput).map((field) => [
        field,
        'untrusted' as const,
      ]),
    ),
  };
}

function listOutputFields(output: Record<string, unknown>): string[] {
  const properties = output['properties'];

  return typeof properties === 'object' && properties !== null && !Array.isArray(properties)
    ? Object.keys(properties)
    : [];
}

// The pictures of a result go to the model only when the turn's image budget has room for all of
// them.
function limitImages(
  outcome: ToolOutcome,
  reserve: ((images: readonly ToolImage[]) => boolean) | undefined,
): ToolOutcome {
  if (outcome.status !== 'ok' || outcome.images === undefined || outcome.images.length === 0) {
    return outcome;
  }

  if (reserve?.(outcome.images) ?? true) {
    return outcome;
  }

  const { images: _images, ...rest } = outcome;

  return rest;
}
