import { createHash } from 'node:crypto';
import { renderPrompt } from '@heynixie/prompts';

export interface CheckerRule {
  readonly id: string;
  readonly prompt: string;
}

export function buildCheckerRules(ownerName: string | null): readonly CheckerRule[] {
  return [
    {
      id: 'memory.content-checker',
      prompt: buildPromptHash(renderPrompt('content-checker', { owner: { name: ownerName } })),
    },
    {
      id: 'memory.retirement-checker',
      prompt: buildPromptHash(renderPrompt('retirement-checker', {})),
    },
  ];
}

function buildPromptHash(prompt: string): string {
  return `sha256:${createHash('sha256').update(prompt).digest('hex')}`;
}
