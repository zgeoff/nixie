import type { LogFields } from '@heynixie/logger';
import type { PromptOverrides } from '@heynixie/prompts';
import { collectPromptsWithoutSafety } from '@heynixie/prompts';

export function buildPromptSafetyLogFields(prompts: PromptOverrides): LogFields | null {
  const withoutSafety = collectPromptsWithoutSafety(prompts);

  return withoutSafety.length === 0
    ? null
    : Object.fromEntries(withoutSafety.map((prompt) => [prompt.id, prompt.safety]));
}
