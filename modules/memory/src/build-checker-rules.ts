import { createHash } from 'node:crypto';
import { renderMemoryCheckerPrompt } from './render-memory-checker-prompt';
import { retirementCheckerPrompt } from './retirement-checker-prompt';

export interface CheckerRule {
  readonly id: string;
  readonly prompt: string;
}

export function buildCheckerRules(ownerName: string | null): readonly CheckerRule[] {
  return [
    {
      id: 'memory.content-checker',
      prompt: buildPromptHash(renderMemoryCheckerPrompt(ownerName)),
    },
    { id: 'memory.retirement-checker', prompt: buildPromptHash(retirementCheckerPrompt) },
  ];
}

function buildPromptHash(prompt: string): string {
  return `sha256:${createHash('sha256').update(prompt).digest('hex')}`;
}
