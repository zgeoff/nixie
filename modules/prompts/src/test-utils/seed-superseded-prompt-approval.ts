import type { PromptSeederDeps } from './prompt-seeder-deps';
import type { PromptApprovalSeed, SeededPromptApproval } from './seed-prompt-approval';
import { seedPromptApproval } from './seed-prompt-approval';

export async function seedSupersededPromptApproval(
  deps: PromptSeederDeps,
  input: Partial<PromptApprovalSeed> = {},
): Promise<SeededPromptApproval> {
  const superseded = await seedPromptApproval(deps, input);

  await seedPromptApproval(deps, {
    promptID: superseded.promptID,
    text: 'Answer with the summary, then stop.\n',
  });

  return superseded;
}
