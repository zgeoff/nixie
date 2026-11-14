import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildPromptProposalHash } from '../build-prompt-proposal-hash';
import { promptsOverrideProposedCodec } from '../prompts-override-proposed-codec';
import type { PromptID } from '../types';
import { writePromptProposalAnswer } from '../write-prompt-proposal-answer';
import type { PromptSeederDeps } from './prompt-seeder-deps';

export interface PromptApprovalSeed {
  readonly proposalID: string;
  readonly promptID: PromptID;
  readonly text: string;
}

export interface SeededPromptApproval {
  readonly approvalID: string;
  readonly proposalID: string;
  readonly promptID: PromptID;
}

export async function seedPromptApproval(
  deps: PromptSeederDeps,
  input: Partial<PromptApprovalSeed> = {},
): Promise<SeededPromptApproval> {
  const proposalID = input.proposalID ?? crypto.randomUUID();
  const promptID = input.promptID ?? 'compaction';
  const entry = { safety: `prompts/${promptID}-safety.md` };
  const files = [{ path: entry.safety, text: input.text ?? 'Answer with the summary alone.\n' }];
  const proposalHash = buildPromptProposalHash({ promptID, entry, files });

  await writeRecords(deps.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: deps.definitions(),
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID,
        promptID,
        proposalHash,
        baseHash: null,
        entry,
        files,
        reason: 'The summaries ramble past the word target.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const result = await writePromptProposalAnswer(
    {
      log: deps.log,
      clock: deps.clock,
      definitions: deps.definitions,
      readInForce: () => null,
      checkProposal: () => [],
    },
    { answer: 'approve', proposalID, proposalHash },
  );

  invariant(result.status === 'approved', 'the pending proposal approves');

  return { approvalID: result.approvalID, proposalID, promptID };
}
