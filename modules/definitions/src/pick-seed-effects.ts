import type { Effect, EffectOverride } from '@heynixie/policy';
import { applyEffectOverride, effectNames } from '@heynixie/policy';
import type { ToolDeclaration } from './types';

export interface HeldEffects {
  readonly tool: string;
  readonly remove: readonly Effect[];
}

export interface SeedEffectsInput {
  readonly tools: readonly ToolDeclaration[];
  readonly overrides: ReadonlyMap<string, EffectOverride>;

  // the effects of each tool in the seed in force, and null when no seed is in force
  readonly inForce: ReadonlyMap<string, readonly Effect[]> | null;

  // `tool:effect` for each removal that you approved
  readonly approved: ReadonlySet<string>;
}

export type SeedEffects =
  | {
      readonly status: 'applied';
      readonly tools: readonly ToolDeclaration[];
      readonly held: readonly HeldEffects[];
    }
  | { readonly status: 'refused'; readonly reason: string };

// An effect that joins applies at once. An effect that leaves is a widening, because the tool can
// then pass an ask or deny rule on that effect, so the tool keeps it until you approve.
export function pickSeedEffects(input: SeedEffectsInput): SeedEffects {
  const known = new Set(input.tools.map((tool) => tool.name));

  const unknown = [...input.overrides.keys()].find((tool) => !known.has(tool));

  if (unknown !== undefined) {
    return { status: 'refused', reason: `an effects override names the unknown tool ${unknown}` };
  }

  const held: HeldEffects[] = [];
  const tools: ToolDeclaration[] = [];

  for (const tool of input.tools) {
    const base = tool.effects.filter((effect) => isEffect(effect));
    const override = input.overrides.get(tool.name);
    const applied = override === undefined ? null : applyEffectOverride(tool.name, base, override);

    if (applied?.status === 'refused') {
      return applied;
    }

    const desired = applied === null ? base : applied.effects;
    const prior = input.inForce?.get(tool.name) ?? desired;

    const kept = prior.filter(
      (effect) => !desired.includes(effect) && !input.approved.has(`${tool.name}:${effect}`),
    );

    if (kept.length > 0) {
      held.push({ tool: tool.name, remove: kept.toSorted() });
    }

    tools.push({ ...tool, effects: [...desired, ...kept].toSorted() });
  }

  return { status: 'applied', tools, held };
}

function isEffect(effect: string): effect is Effect {
  return effectNames.some((name) => name === effect);
}
