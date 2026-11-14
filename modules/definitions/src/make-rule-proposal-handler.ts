import { writeRecordsInTransaction } from '@heynixie/log';
import type {
  ApplyOutcome,
  ApplyRun,
  ProposalAnswerInput,
  ProposalKindHandler,
  SharedProposal,
} from '@heynixie/proposals';
import { proposalLapseMs } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { readRuleProposals } from './read-rule-proposals';
import { rulesChangeLapsedCodec } from './rules-change-lapsed-codec';
import type { DefinitionsTables } from './types';
import { writeRuleProposalDecision } from './write-rule-proposal-answer';
import type { RuleContext } from './write-runtime-rule';

export function makeRuleProposalHandler(context: RuleContext): ProposalKindHandler {
  return {
    family: 'rule_change',
    lapseIntervalMs: proposalLapseMs,
    ownsTransaction: false,
    readBodies: async (db, rows) => {
      const states = await readRuleProposals(db);

      const proposals = new Map(states.map((state) => [state.proposal.proposalID, state.proposal]));

      return new Map(
        rows.map((row) => {
          const proposal = proposals.get(row.id);

          return [
            row.id,
            proposal === undefined
              ? null
              : {
                  sentence: proposal.changes
                    .map((change) => change.after?.sentence ?? `Remove the rule ${change.ruleID}.`)
                    .join(' '),
                  fields: {},
                  ruleSentence: null,
                },
          ];
        }),
      );
    },
    readHashes: (_db, row) => Promise.resolve({ action: row.actionHash, rule: null }),
    approve: (run, row, answer) => writeAnswer(context, run, row, answer),
    decline: (run, row, answer) => writeAnswer(context, run, row, answer),
    lapse: async (tx, row) => {
      await writeRecordsInTransaction(tx, context.log, [
        {
          kind: rulesChangeLapsedCodec.kind,
          definitions: context.definitions(),
          payload: rulesChangeLapsedCodec.encode({ proposalID: row.id }),
        },
      ]);
    },
  };
}

async function writeAnswer(
  context: RuleContext,
  run: ApplyRun,
  row: SharedProposal,
  answer: ProposalAnswerInput,
): Promise<ApplyOutcome> {
  const tx = run.tx;

  invariant(tx, 'a rule change answers in the transaction that the core opens');

  const states = await readRuleProposals(tx);

  const state = states.find((entry) => entry.proposal.proposalID === row.id);

  invariant(state, 'a rule change proposal has its record');

  const isDeclined = answer.choice === 'decline';

  if (!isDeclined && !(await probeBaseCurrent(tx, state.proposal.changes))) {
    return {
      status: 'refused',
      refusal: {
        error: 'CONFLICT',
        current: { actionHash: `${row.actionHash}:moved`, ruleHash: null },
      },
    };
  }

  await writeRuleProposalDecision(tx, context, {
    proposal: state.proposal,
    outcome: isDeclined ? 'rejected' : 'approved',
    reason: answer.note ?? '',
  });

  return {
    status: 'done',
    result: { proposalID: row.id, state: isDeclined ? 'declined' : 'approved' },
    ...(isDeclined
      ? {}
      : {
          afterCommit: async () => {
            await context.runInForceSeed();
          },
        }),
  };
}

interface RuleChangeBase {
  readonly ruleID: string;
  readonly before: { readonly hash: string } | null;
}

async function probeBaseCurrent(
  tx: Transaction<unknown>,
  changes: readonly RuleChangeBase[],
): Promise<boolean> {
  const seeded = await tx
    .$extendTables<DefinitionsTables>()
    .selectFrom('seeded_rules')
    .select(['rule_id', 'rule_hash'])
    .execute();

  const hashes = new Map(seeded.map((entry) => [entry.rule_id, entry.rule_hash]));

  return changes.every(
    (change) => (hashes.get(change.ruleID) ?? null) === (change.before?.hash ?? null),
  );
}
