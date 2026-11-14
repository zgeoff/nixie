import { readMessageTimeZone } from '@heynixie/connectors';
import { makeRuleProposalHandler, writeRuntimeRuleInTransaction } from '@heynixie/definitions';
import type { RecordInput } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import { makeMemoryProposalHandler } from '@heynixie/memory';
import { makeActionProposalHandler } from '@heynixie/policy';
import type { ProposalContext, ProposalCoreDeps, ProposalKindHandler } from '@heynixie/proposals';
import { makeSkillProposalHandler } from '@heynixie/skills';
import { isFinishedState, isInboxRecord, writeInboxRecordsInTransaction } from '@heynixie/tasks';
import type { TasksTables } from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import { defaultApprovalSettings } from './default-api-settings';
import { proposalsProjection } from './proposals-projection';
import type { APISettings, ReadViewMemory } from './types';

export type ProposalAPIContext = ProposalContext & {
  readonly settings?: Pick<APISettings, 'approvals'>;
};

export interface ProposalParts {
  readonly readMemory: ReadViewMemory;
  readonly runInForceSeed: () => Promise<unknown>;
}

const memoryLapseMs = 14 * 24 * 60 * 60 * 1000;

// The kinds of proposals and what each needs from the server. A kind with no part to run, such as
// memory before it starts, refuses its answers.
export function buildProposalCoreDeps(
  context: ProposalAPIContext,
  parts: ProposalParts,
): ProposalCoreDeps {
  const writeThreadRecord = (tx: Transaction<unknown>, input: RecordInput) =>
    writeTaskRecord(context, tx, input);

  const handlers: readonly ProposalKindHandler[] = [
    makeActionProposalHandler({
      log: context.log,
      definitions: context.definitions,
      writeThreadRecord,
      writeRule: async (tx, change) => {
        await writeRuntimeRuleInTransaction(tx, context, {
          ruleID: change.ruleID,
          rule: change.rule,
          changedBy: 'owner',
          reason: change.reason,
        });
      },
      runAfterRule: parts.runInForceSeed,
    }),
    makeMemoryProposalHandler({
      log: context.log,
      definitions: context.definitions,
      lapseIntervalMs: memoryLapseMs,
      readStore: () => {
        const store = parts.readMemory();

        return store === null
          ? null
          : {
              proposals: store.proposals,
              readTexts: async () => {
                const listed = await store.view.readProposals();

                return new Map(listed.map((proposal) => [proposal.proposalID, proposal.text]));
              },
            };
      },
    }),
    makeSkillProposalHandler({
      log: context.log,
      clock: context.clock,
      definitions: context.definitions,
      seedWrittenSkills: async () => {
        await parts.runInForceSeed();
      },
    }),
    makeRuleProposalHandler({
      log: context.log,
      clock: context.clock,
      definitions: context.definitions,
      runInForceSeed: parts.runInForceSeed,
    }),
  ];

  const settings = context.settings?.approvals ?? defaultApprovalSettings;

  return {
    log: context.log,
    clock: context.clock,
    definitions: context.definitions,
    projection: proposalsProjection,
    handlers: new Map(handlers.map((handler) => [handler.family, handler])),
    readDeferContext: async (tx) => {
      const messageZone = await readMessageTimeZone({ writer: { ...context.log.writer, db: tx } });

      return { quietHours: settings.quietHours, zone: messageZone ?? settings.defaultZone };
    },
    writeThreadRecord,
  };
}

// A task that is still open takes the record as an inbox record, so it hears it. A finished task
// takes no input, so its record is written with no thread and wakes nothing.
async function writeTaskRecord(
  context: ProposalAPIContext,
  tx: Transaction<unknown>,
  input: RecordInput,
): Promise<void> {
  const thread = input.thread ?? null;

  const task =
    thread === null
      ? undefined
      : await tx
          .$extendTables<TasksTables>()
          .selectFrom('tasks')
          .select('state')
          .where('task_id', '=', thread)
          .executeTakeFirst();

  const isOpen = task !== undefined && !isFinishedState(task.state);

  if (isOpen && isInboxRecord({ kind: input.kind, thread })) {
    await writeInboxRecordsInTransaction(tx, context, [input]);

    return;
  }

  const { thread: _thread, ...unthreaded } = input;

  await writeRecordsInTransaction(tx, context.log, [isOpen ? input : unthreaded]);
}
