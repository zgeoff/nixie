import type { McpToolOverride } from '@heynixie/policy';
import { collectStringArguments } from '../registry/collect-string-arguments';
import type { ToolDeclaration, ToolForm } from '../types';
import { pickAnnotationEffects } from './pick-annotation-effects';
import { pickIdempotencyKey } from './pick-idempotency-key';

export interface ToolDeclarationInput {
  readonly tool: string;
  readonly pinned: ToolForm;
  readonly pinnedHash: string;

  // the override of the definitions, or null for a tool the annotations declare
  readonly override: McpToolOverride | null;
  readonly definitionsHash: string;
}

// The declaration a pinned form runs under: the override of the definitions when there is one,
// otherwise the one its annotations make. Null when the annotations name no effects.
export function buildToolDeclaration(input: ToolDeclarationInput): ToolDeclaration | null {
  const override = input.override;

  if (override !== null) {
    return {
      tool: input.tool,
      declaration: {
        effects: override.effects,
        destinations: override.destinations,
        amount: override.amount,
        content:
          override.content ??
          collectStringArguments(input.pinned.inputSchema).filter(
            (name) => name !== pickIdempotencyKey(override.reconcile),
          ),
      },
      reconcile: override.reconcile,
      from: 'override',
      pinnedHash: input.pinnedHash,
      definitionsHash: input.definitionsHash,
    };
  }

  const effects = pickAnnotationEffects(input.pinned.annotations);

  if (effects === null) {
    return null;
  }

  return {
    tool: input.tool,
    declaration: {
      effects,
      destinations: [],
      amount: null,
      content: collectStringArguments(input.pinned.inputSchema),
    },
    reconcile: null,
    from: 'annotations',
    pinnedHash: input.pinnedHash,
    definitionsHash: null,
  };
}
