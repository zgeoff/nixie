import { createHash } from 'node:crypto';
import type { PromptOverrides } from '@heynixie/prompts';
import { renderPrompt } from '@heynixie/prompts';

export interface CheckerRule {
  readonly id: string;
  readonly prompt: string;
}

export function buildCheckerRules(
  ownerName: string | null,
  prompts: PromptOverrides,
): readonly CheckerRule[] {
  return [
    {
      id: 'memory.content-checker',
      prompt: buildPromptHash(
        renderPrompt('content-checker', { owner: { name: ownerName } }, prompts),
      ),
    },
    {
      id: 'memory.retirement-checker',
      prompt: buildPromptHash(renderPrompt('retirement-checker', {}, prompts)),
    },
  ];
}

function buildPromptHash(prompt: string): string {
  return `sha256:${createHash('sha256').update(prompt).digest('hex')}`;
}
