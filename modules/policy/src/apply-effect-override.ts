import type { Effect, EffectOverride } from './types';

export type EffectOverrideResult =
  | { readonly status: 'applied'; readonly effects: readonly Effect[] }
  | { readonly status: 'refused'; readonly reason: string };

// The tool's declaration in code stays the base, and an override changes only its effects. A
// remove of an effect the code lacks, or an add of one it holds, is a mistake of the file.
export function applyEffectOverride(
  tool: string,
  base: readonly Effect[],
  override: EffectOverride,
): EffectOverrideResult {
  const missing = override.remove.find((effect) => !base.includes(effect));

  if (missing !== undefined) {
    return {
      status: 'refused',
      reason: `the override of ${tool} removes ${missing}, which the tool does not have`,
    };
  }

  const held = override.add.find((effect) => base.includes(effect));

  if (held !== undefined) {
    return {
      status: 'refused',
      reason: `the override of ${tool} adds ${held}, which the tool already has`,
    };
  }

  const effects = [...base, ...override.add].filter((effect) => !override.remove.includes(effect));

  return { status: 'applied', effects: effects.toSorted() };
}
