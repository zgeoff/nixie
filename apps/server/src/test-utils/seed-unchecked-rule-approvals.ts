import { buildProposalCoreDeps } from '@heynixie/api';
import { systemClock } from '@heynixie/clock';
import { runInForceSeed } from '@heynixie/definitions';
import { withWriteTransaction } from '@heynixie/log';
import { writeActionProposal } from '@heynixie/policy';
import type { ProposalCoreDeps } from '@heynixie/proposals';
import { answerProposal, readProposal } from '@heynixie/proposals';
import { createConversationTask } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { startDataLog } from './start-data-log';
import type { BootFiles } from './write-boot-files';

// Approves 3 sends of one group, each as a crash between its answer and its rule check leaves it, so
// the next start's check proposes the group's rule. No nixie may hold the data's writer lock.
export async function seedUncheckedRuleApprovals(
  nixie: Pick<BootFiles, 'dataDir' | 'deploymentKey'>,
): Promise<void> {
  const testLog = await startDataLog({
    dataDir: nixie.dataDir,
    deploymentKey: nixie.deploymentKey,
    clock: systemClock,
  });

  try {
    const context = testLog.context;

    await createConversationTask(context);

    const deps = buildProposalCoreDeps(context, {
      readMemory: () => null,
      runInForceSeed: () =>
        runInForceSeed({ log: context.log, buildPolicy: () => ({ rules: [], tools: [] }) }),
    });

    const uncheckedDeps = dropRuleChecks(deps);

    for (const body of [
      'The report is attached.',
      'The numbers changed.',
      'Thanks for the note.',
    ]) {
      const shortID = await withWriteTransaction(testLog.writer, (tx) =>
        writeActionProposal(
          tx,
          { log: context.log, clock: systemClock, definitions: context.definitions },
          {
            definitions: context.definitions(),
            thread: 'conversation',
            callSequence: 1,
            tool: 'test.send',
            effects: ['send'],
            cause: 'no_rule',
            input: { to: 'sam@example.org', body, account: 'work' },
            destinations: [{ value: 'sam@example.org', replyTarget: false }],
            content: ['body'],
            frame: { context: 'conversation', definitionID: null, sources: ['owner'] },
          },
        ),
      );

      const row = await readProposal(testLog.writer.db, shortID);

      invariant(row, 'the send opened a proposal');

      await answerProposal(
        uncheckedDeps,
        {
          proposalID: row.id,
          actionHash: row.actionHash,
          choice: 'approve',
          identityID: 'identity-1',
        },
        { passkey: { kind: 'host' } },
      );
    }
  } finally {
    await testLog.writer.stop();
  }
}

// The action handler without the work it runs after its commit, which holds the rule check.
function dropRuleChecks(deps: ProposalCoreDeps): ProposalCoreDeps {
  const action = deps.handlers.get('action');

  invariant(action, 'the server wires an action handler');

  return {
    ...deps,
    handlers: new Map([
      ...deps.handlers,
      [
        'action',
        {
          ...action,
          approve: async (...args: Parameters<typeof action.approve>) => {
            const applied = await action.approve(...args);

            return applied.status === 'done'
              ? {
                  status: 'done',
                  result: applied.result,
                  usedBy: applied.usedBy,
                  detail: applied.detail,
                  otherStakes: applied.otherStakes,
                }
              : applied;
          },
        },
      ],
    ]),
  };
}
