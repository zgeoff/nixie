import type { LogRecord } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import { parseRule, renderRule } from '@heynixie/policy';
import type {
  ApplyOutcome,
  ApplyRun,
  ProposalAnswerInput,
  ProposalBody,
  ProposalKindHandler,
  SharedProposal,
} from '@heynixie/proposals';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import type { RuleContext } from '../runtime/write-runtime-rule';
import { writeRuntimeRuleInTransaction } from '../runtime/write-runtime-rule';
import { readProposalRecords } from '../utils/read-proposal-records';
import { mandateDeclinedCodec } from './mandate-declined-codec';
import { mandateLapsedCodec } from './mandate-lapsed-codec';
import { mandateProposedCodec } from './mandate-proposed-codec';
import { mandateStartedCodec } from './mandate-started-codec';

// The mandate's proposal lapses at its end, so an approval never starts a mandate that is over.
export function makeMandateHandler(context: RuleContext): ProposalKindHandler {
  return {
    family: 'rule_change',
    lapseIntervalMs: 0,
    ownsTransaction: false,
    readBodies: async (db, rows) => {
      const records = await readProposalRecords(context.log, db, rows);

      return new Map(rows.map((row) => [row.id, toBody(records.get(row.createdSequence))]));
    },
    readHashes: (_db, row) => Promise.resolve({ action: row.actionHash, rule: null }),
    approve: (run, row, answer) => writeApproval(context, run, row, answer),
    decline: async (run, row, answer) => {
      invariant(run.tx, 'a mandate answers in the transaction that the core opens');

      await writeRecordsInTransaction(run.tx, context.log, [
        {
          kind: mandateDeclinedCodec.kind,
          definitions: context.definitions(),
          payload: mandateDeclinedCodec.encode({
            proposalID: row.id,
            identityID: answer.identityID,
          }),
        },
      ]);

      return { status: 'done', result: { proposalID: row.id, state: 'declined' } };
    },
    lapse: async (tx, row) => {
      await writeRecordsInTransaction(tx, context.log, [
        {
          kind: mandateLapsedCodec.kind,
          definitions: context.definitions(),
          payload: mandateLapsedCodec.encode({ proposalID: row.id }),
        },
      ]);
    },
  };
}

const erasableSchema = z.object({ title: z.string(), rules: z.array(z.unknown()) });

function toBody(record: LogRecord | undefined): ProposalBody | null {
  if (record === undefined || record.erasable.status !== 'readable') {
    return null;
  }

  const proposed = mandateProposedCodec.decode(record.payload);
  const erasable = erasableSchema.parse(record.erasable.fields);
  const sentences = erasable.rules.map((rule) => renderRule(parseRule(rule)));

  return {
    sentence: sentences.join(' '),
    fields: {
      title: erasable.title,
      ends: new Date(proposed.expires).toISOString(),
      ...Object.fromEntries(sentences.map((sentence, index) => [`rule ${index + 1}`, sentence])),
    },
    ruleSentence: null,
    approveLabel: 'Start the mandate',
  };
}

async function writeApproval(
  context: RuleContext,
  run: ApplyRun,
  row: SharedProposal,
  answer: ProposalAnswerInput,
): Promise<ApplyOutcome> {
  const tx = run.tx;

  invariant(tx, 'a mandate answers in the transaction that the core opens');

  const records = await readProposalRecords(context.log, tx, [row]);

  const record = records.get(row.createdSequence);

  invariant(record, 'a mandate has its record');

  const proposed = mandateProposedCodec.decode(record.payload);

  if (record.erasable.status !== 'readable') {
    return { status: 'refused', refusal: { error: 'NOT_ALLOWED', reason: 'rule_gone' } };
  }

  if (proposed.expires <= context.clock.now()) {
    return { status: 'refused', refusal: { error: 'NOT_ALLOWED', reason: 'expired' } };
  }

  const erasable = erasableSchema.parse(record.erasable.fields);
  const changeIDs: string[] = [];

  for (const stored of erasable.rules) {
    const { id, ...rule } = parseRule(stored);

    const changeID = await writeRuntimeRuleInTransaction(tx, context, {
      ruleID: id,
      rule,
      changedBy: 'owner',
      reason: `mandate ${proposed.mandateID}`,
    });

    changeIDs.push(changeID);
  }

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: mandateStartedCodec.kind,
      definitions: context.definitions(),
      payload: mandateStartedCodec.encode({
        mandateID: proposed.mandateID,
        proposalID: row.id,
        changeIDs,
        expires: proposed.expires,
        identityID: answer.identityID,
      }),
    },
  ]);

  return {
    status: 'done',
    result: { proposalID: row.id, state: 'approved' },
    afterCommit: async () => {
      await context.runInForceSeed();
    },
  };
}
