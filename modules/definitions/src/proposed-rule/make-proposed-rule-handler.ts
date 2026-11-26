import { createShortID } from '@heynixie/db';
import type { LogRecord } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Rule } from '@heynixie/policy';
import { ruleBodySchema } from '@heynixie/policy';
import type {
  ApplyOutcome,
  ApplyRun,
  ProposalAnswerInput,
  ProposalBody,
  ProposalKindHandler,
  SharedProposal,
} from '@heynixie/proposals';
import { buildDiscardedOutcome } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { writeRuntimeRuleInTransaction } from '../runtime/write-runtime-rule';
import type { RuleContext } from '../runtime/write-runtime-rule';
import type { DefinitionsTables } from '../types';
import { buildMemoryGapFields } from '../utils/build-memory-gap-fields';
import { readProposalRecords } from '../utils/read-proposal-records';
import { describeProposedRule } from './describe-proposed-rule';
import type { GapSettings } from './gap-settings';
import { dayMs } from './gap-settings';
import { ruleAnsweredCodec } from './rule-answered-codec';
import { ruleProposedCodec } from './rule-proposed-codec';

export interface ProposedRuleHandlerDeps extends RuleContext {
  readonly settings: GapSettings;
}

export function makeProposedRuleHandler(deps: ProposedRuleHandlerDeps): ProposalKindHandler {
  return {
    family: 'rule_change',
    lapseIntervalMs: (config) => config.lapseDays.rule_change * dayMs,
    ownsTransaction: false,
    readBodies: async (db, rows) => {
      const records = await readProposalRecords(deps.log, db, rows);
      const answeredAt = await readAnsweredAt(db, records.values());

      return new Map(
        rows.map((row) => [row.id, toBody(records.get(row.createdSequence), answeredAt)]),
      );
    },
    readHashes: (_db, row) => Promise.resolve({ action: row.actionHash, rule: null }),
    approve: (run, row, answer) => writeApproval(deps, run, row, answer),
    discard: (_run, row, outcome) => Promise.resolve(buildDiscardedOutcome(row, outcome)),
  };
}

async function readAnsweredAt(
  db: Parameters<ProposalKindHandler['readBodies']>[0],
  records: Iterable<LogRecord>,
): Promise<ReadonlyMap<string, number>> {
  const approvals = [...records].flatMap((record) =>
    record.kind === ruleProposedCodec.kind
      ? ruleProposedCodec.decode(record.payload).approvals
      : [],
  );

  if (approvals.length === 0) {
    return new Map();
  }

  const rows = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('gap_answers')
    .select(['proposal_id', 'answered_at'])
    .where('proposal_id', 'in', approvals)
    .execute();

  return new Map(rows.map((row) => [row.proposal_id, row.answered_at]));
}

const erasableSchema = z.object({ rule: ruleBodySchema });

function toBody(
  record: LogRecord | undefined,
  answeredAt: ReadonlyMap<string, number>,
): ProposalBody | null {
  if (record === undefined || record.erasable.status !== 'readable') {
    return null;
  }

  const proposed = ruleProposedCodec.decode(record.payload);
  const erasable = erasableSchema.parse(record.erasable.fields);
  const rule = erasable.rule;
  const facts = describeProposedRule(rule);

  const days = proposed.approvals
    .map((proposalID) => answeredAt.get(proposalID))
    .filter((time) => time !== undefined)
    .toSorted((left, right) => left - right)
    .map((time) => formatDay(time));

  return {
    sentence: facts.sentence,
    fields: {
      covers: `${proposed.approvals.length} approvals${days.length === 0 ? '' : `: ${days.join(', ')}`}`,
      group: formatGroup(rule),
      ...buildMemoryGapFields([rule]),
    },
    ruleSentence: null,
    approveLabel: 'Allow this rule',
    rule,
  };
}

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

function formatDay(time: number): string {
  return dayFormat.format(new Date(time));
}

function formatGroup(rule: Omit<Rule, 'id'>): string {
  const tool = rule.tools?.[0] ?? 'a call';

  return rule.destinations === undefined ? tool : `${tool} to ${rule.destinations.join(', ')}`;
}

async function writeApproval(
  deps: ProposedRuleHandlerDeps,
  run: ApplyRun,
  row: SharedProposal,
  answer: ProposalAnswerInput,
): Promise<ApplyOutcome> {
  const tx = run.tx;

  invariant(tx, 'a proposed rule answers in the transaction that the core opens');

  const records = await readProposalRecords(deps.log, tx, [row]);

  const record = records.get(row.createdSequence);

  invariant(record, 'a proposed rule has its record');

  if (record.erasable.status !== 'readable') {
    return { status: 'refused', refusal: { error: 'NOT_ALLOWED', reason: 'rule_gone' } };
  }

  const rule = erasableSchema.parse(record.erasable.fields).rule;

  const groupHash = await readGroupHash(tx, row.id);

  const ruleID = `proposed-${createShortID().toLowerCase()}`;

  await writeRuntimeRuleInTransaction(tx, deps, {
    ruleID,
    rule,
    changedBy: 'owner',
    reason: `proposed after ${deps.settings.approvals} approvals`,
  });

  await writeRecordsInTransaction(tx, deps.log, [
    {
      kind: ruleAnsweredCodec.kind,
      definitions: deps.definitions(),
      payload: ruleAnsweredCodec.encode({
        proposalID: row.id,
        groupHash,
        answer: 'approved',
        identityID: answer.identityID,
      }),
    },
  ]);

  return {
    status: 'done',
    result: { proposalID: row.id, state: 'approved', rule: { id: ruleID, revision: 1 } },
    usedBy: ruleID,
    detail: null,
    otherThreads: [],
    afterCommit: async () => {
      await deps.runInForceSeed();
    },
  };
}

async function readGroupHash(tx: Transaction<unknown>, proposalID: string): Promise<string> {
  const group = await tx
    .$extendTables<DefinitionsTables>()
    .selectFrom('gap_groups')
    .select('group_hash')
    .where('proposal_id', '=', proposalID)
    .executeTakeFirst();

  invariant(group, 'an open proposed rule belongs to its group');

  return group.group_hash;
}
