import { hasQueuedEffect } from '@heynixie/policy';
import type { EffectDeclaration } from '@heynixie/policy';
import type { ToolDefinition, ToolImage, ToolOutcome } from '@heynixie/tools';
import { runProxiedCall } from '../call/run-proxied-call';
import type { ProxyCalls } from '../call/types';
import { pickAnnotationEffects } from '../declaration/pick-annotation-effects';
import type { ToolForm } from '../types';
import { collectStringArguments } from './collect-string-arguments';

// The result shape of a tool whose pinned form has no output schema.
const textOutput = { type: 'object', properties: { text: { type: 'string' } } };

// Builds the definition a pinned form registers as, under the declaration of its annotations. A form
// that names no effects has no declaration, so it throws and stays hidden. Every call is cleared
// first, and the definition names its pin so a call runs only under the form it loaded.
export function buildProxiedDefinition(
  tool: string,
  pinned: ToolForm,
  calls: ProxyCalls,
  pinHash: string,
): ToolDefinition {
  const declaration = buildProxiedDeclaration(pinned);

  if (declaration === null) {
    throw new Error('the form has no declaration, because its annotations name no effects');
  }

  const output = pinned.outputSchema ?? textOutput;

  return {
    name: tool,
    description: pinned.description ?? '',
    input: pinned.inputSchema,
    output,
    declaration,
    execution: hasQueuedEffect(declaration.effects) ? 'queued' : 'direct',
    pinHash,
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

// The declaration a pinned form runs under, or null when its annotations name no effects. Every
// string argument is content, no argument is a destination or an amount, and every result field is
// untrusted.
export function buildProxiedDeclaration(pinned: ToolForm): EffectDeclaration | null {
  const effects = pickAnnotationEffects(pinned.annotations);

  if (effects === null) {
    return null;
  }

  return {
    effects: [...effects],
    destinations: [],
    amount: null,
    content: collectStringArguments(pinned.inputSchema),
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
