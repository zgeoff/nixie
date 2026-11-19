import type { Effect, EffectOverride } from '@heynixie/policy';
import { applyEffectOverride, effectNames } from '@heynixie/policy';
import type { ToolDeclaration } from '../types';

export interface SeedEffectsInput {
  readonly tools: readonly ToolDeclaration[];
  readonly overrides: ReadonlyMap<string, EffectOverride>;
}

export type SeedEffects =
  | { readonly status: 'applied'; readonly tools: readonly ToolDeclaration[] }
  | { readonly status: 'refused'; readonly reason: string };

export function pickSeedEffects(input: SeedEffectsInput): SeedEffects {
  const known = new Set(input.tools.map((tool) => tool.name));

  const unknown = [...input.overrides.keys()].find((tool) => !known.has(tool));

  if (unknown !== undefined) {
    return { status: 'refused', reason: `an effects override names the unknown tool ${unknown}` };
  }

  const tools: ToolDeclaration[] = [];

  for (const tool of input.tools) {
    const base = tool.effects.filter((effect) => isEffect(effect));
    const override = input.overrides.get(tool.name);
    const applied = override === undefined ? null : applyEffectOverride(tool.name, base, override);

    if (applied?.status === 'refused') {
      return applied;
    }

    const desired = applied === null ? base : applied.effects;

    tools.push({ ...tool, effects: desired.toSorted() });
  }

  return { status: 'applied', tools };
}

function isEffect(effect: string): effect is Effect {
  return effectNames.some((name) => name === effect);
}
