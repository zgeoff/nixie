import type { PromptID } from '@heynixie/prompts';

export function toPromptExportBranch(promptID: PromptID): string {
  return `nixie/prompt/${promptID}`;
}
