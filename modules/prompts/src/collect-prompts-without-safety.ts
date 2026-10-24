import { collectTemplatePaths } from './collect-template-paths';
import { promptIDs } from './prompt-ids';
import type { PromptID, PromptOverrides } from './types';

export interface PromptWithoutSafety {
  readonly id: PromptID;
  readonly safety: 'replaced' | 'omitted';
}

export function collectPromptsWithoutSafety(
  overrides: PromptOverrides,
): readonly PromptWithoutSafety[] {
  return promptIDs.flatMap((id): PromptWithoutSafety[] => {
    const override = overrides[id];

    if (override === undefined) {
      return [];
    }

    if (
      override.template !== null &&
      !collectTemplatePaths(override.template).includes('parts.safety')
    ) {
      return [{ id, safety: 'omitted' }];
    }

    return override.parts['safety'] === undefined ? [] : [{ id, safety: 'replaced' }];
  });
}
