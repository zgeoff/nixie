import type { PromptSeederDeps } from './prompt-seeder-deps';
import type { PromptApprovalSeed } from './seed-prompt-approval';
import { seedPromptApproval } from './seed-prompt-approval';
import { seedSupersededPromptApproval } from './seed-superseded-prompt-approval';

export function buildPromptSeeder(deps: PromptSeederDeps) {
  return {
    promptApproval: (input?: Partial<PromptApprovalSeed>) => seedPromptApproval(deps, input),
    supersededPromptApproval: (input?: Partial<PromptApprovalSeed>) =>
      seedSupersededPromptApproval(deps, input),
  };
}
