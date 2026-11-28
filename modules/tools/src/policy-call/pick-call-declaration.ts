import type { Effect, EffectDeclaration } from '@heynixie/policy';
import type { RegisteredTool } from '../types';

// What the call charges: a plan for a paid tool that runs, a result that its check ended with, or
// the failure of that check, which the call settles as the tool's failure.
// A prepared call's effects join the declared ones in the proposal the call may write.
export function pickCallDeclaration(
  registered: RegisteredTool | null,
  effects: readonly Effect[] | undefined,
): EffectDeclaration | null {
  const declaration = registered?.definition.declaration ?? null;

  return declaration === null || effects === undefined
    ? declaration
    : { ...declaration, effects: joinEffects(declaration.effects, effects) };
}

export function joinEffects(
  declared: readonly Effect[],
  added: readonly Effect[],
): readonly Effect[] {
  return [...new Set([...declared, ...added])];
}
