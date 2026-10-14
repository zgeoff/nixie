import { createHash } from 'node:crypto';
import { renderMemoryCheckerPrompt } from './render-memory-checker-prompt';
import { retirementCheckerPrompt } from './retirement-checker-prompt';

// A checker prompt as a policy snapshot entry: its ID and the SHA-256 of its text.
export interface CheckerRule {
  readonly id: string;
  readonly prompt: string;
}

// The memory gate's checker prompts as policy snapshot entries, so a release that changes a prompt,
// or a change to your configured name, changes the snapshot hash that every record carries.
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
