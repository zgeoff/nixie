import { z } from 'zod';
import { runHostCommand } from './run-host-command';

const pendingSchema = z.array(z.object({ kind: z.string(), proposalID: z.string() }));

// The first seed of the starter rules holds their allows in one proposal. A test approves it as the
// owner does, so a turn's tool calls meet the rules a deployment starts with.
export async function approveStarterRules(configPath: string): Promise<void> {
  const pending = await runHostCommand(configPath, ['proposals', 'list']);

  const proposals = pendingSchema.parse(JSON.parse(pending.stdout));

  for (const proposal of proposals.filter((entry) => entry.kind === 'rule_change')) {
    await runHostCommand(configPath, ['proposals', 'approve', proposal.proposalID]);
  }
}
