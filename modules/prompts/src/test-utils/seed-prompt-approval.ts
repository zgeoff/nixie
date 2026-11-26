import { withWriteTransaction, writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { promptsOverrideProposedCodec } from '../override/prompts-override-proposed-codec';
import { buildPromptProposalHash } from '../prompt/build-prompt-proposal-hash';
import { writePromptApproval } from '../prompt/make-prompt-proposal-handler';
import { readPromptProposals } from '../prompt/read-prompt-proposals';
import type { PromptID } from '../types';
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

  const approvalID = await withWriteTransaction(deps.log.writer, async (tx) => {
    const [state] = await readPromptProposals(tx, [proposalID]);

    invariant(state, 'the proposal was written');

    return writePromptApproval(
      tx,
      {
        log: deps.log,
        clock: deps.clock,
        definitions: deps.definitions,
        readInForce: () => null,
        checkProposal: () => [],
      },
      { state, entry, files, identityID: 'owner' },
    );
  });

  return { approvalID, proposalID, promptID };
}
