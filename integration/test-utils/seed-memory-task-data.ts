import { withWriteTransaction, writeRecords } from '@heynixie/log';
import type { Log, RecordInput } from '@heynixie/log';
import type { TestMemoryWriter, TestMemoryWriterOptions } from '@heynixie/memory/test-utils';
import {
  buildMockWriteCaller,
  buildRememberReply,
  createConsolidationDiff,
  writeOwnerMessages,
} from '@heynixie/memory/test-utils';
import type { PromptsRecordKind } from '@heynixie/prompts';
import type { StubGuestSandboxes } from '@heynixie/sandbox/test-utils';
import { createSystemTask, writeInboxRecords } from '@heynixie/tasks';
import type { TurnInputsRecordKind } from '@heynixie/turn-inputs';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';

// Asserts each message except one that says it is unverified, which becomes a proposal.
export function runStubCheck(
  request: Parameters<NonNullable<TestMemoryWriterOptions['check']>>[0],
): ReturnType<NonNullable<TestMemoryWriterOptions['check']>> {
  return Promise.resolve({
    verdict: request.input.includes('unverified') ? 'not_asserted' : 'asserted',
    reason: 'the checker read the message',
    model: 'claude-checker-1',
    failure: null,
  });
}

export interface MemoryTaskHost {
  readonly server: { readonly guest: StubGuestSandboxes };
  readonly memory: TestMemoryWriter;
  readonly log: Log;
}

// Seeds what a deployment that ran the note-taker and the consolidator holds: their records and
// rows, and the conversation's records before, between and after them.
export async function seedMemoryTaskData(host: MemoryTaskHost): Promise<void> {
  await seedTasksAndConversation(host);
  await seedConsolidator(host);
  await seedPromptsAndInputs(host);
}

const definitions = { snapshotHash: 'sha256:test' };

async function seedTasksAndConversation(ctx: MemoryTaskHost) {
  const memory = ctx.memory;
  const server = ctx.server;
  const log = ctx.log;

  const [pets, colour] = await writeOwnerMessages(log, [
    'My pets are Ash and Birch.',
    'I like the colour green, unverified.',
  ]);

  invariant(pets !== undefined && colour !== undefined);

  server.guest.addReplies(
    buildRememberReply({ text: 'You have a pet called Ash.', quote: 'Ash', sourceID: pets }),
    { text: 'Staged.' },
    buildRememberReply({ text: 'You like the colour green.', quote: 'green', sourceID: colour }),
    buildRememberReply({ text: 'You like the colour blue.', quote: 'colour', sourceID: colour }),
    buildRememberReply({ text: 'You like some colours.', quote: 'I like', sourceID: colour }),
    { text: 'Staged.' },
  );

  await memory.start();
  await memory.run();

  const [cedar] = await writeOwnerMessages(log, ['I also keep a cat called Cedar.']);

  invariant(cedar !== undefined);

  await memory.store.writes.remember({
    text: 'You keep a cat called Cedar.',
    quote: 'Cedar',
    eventID: cedar,
    caller: buildMockWriteCaller(),
  });

  const pending = await memory.store.proposals.listPending();

  const writerProposals = pending.filter((proposal) => proposal.origin === 'memory_writer');
  const [approved, rejected, merged] = writerProposals;

  invariant(approved !== undefined && rejected !== undefined && merged !== undefined);

  await memory.store.proposals.approve({
    proposalID: approved.proposalID,
    actionHash: approved.actionHash,
    identityID: 'identity-1',
  });

  await memory.store.proposals.reject({
    proposalID: rejected.proposalID,
    actionHash: rejected.actionHash,
    identityID: 'identity-1',
    reason: 'Not right.',
  });

  await writeRecords(log, [
    {
      kind: 'memory.proposal_merged',
      definitions,
      thread: 'memory-writer',
      payload: {
        mergeID: 'merge-1',
        proposalID: merged.proposalID,
        itemID: merged.itemID,
        origin: 'memory_writer',
        taskID: 'memory-writer',
        model: null,
        noticeKey: 'batch/5-9',
        lapseAt: merged.lapseAt + 1,
      },
    },
  ]);

  const [tea, unsure] = await writeOwnerMessages(log, [
    'I drink green tea.',
    'I might move, unverified.',
  ]);

  invariant(tea !== undefined && unsure !== undefined);

  await memory.store.writes.remember({
    text: 'You drink green tea.',
    quote: 'green tea',
    eventID: tea,
    caller: buildMockWriteCaller(),
  });

  await memory.store.writes.remember({
    text: 'You might move.',
    quote: 'might move',
    eventID: unsure,
    caller: buildMockWriteCaller(),
  });

  await writeRecords(log, [
    {
      kind: 'memory.self_note_flagged',
      definitions,
      thread: 'conversation',
      contentSource: 'untrusted',
      payload: { sourceSequence: cedar },
      erasable: { text: 'The owner sounded tired.' },
    },
    {
      kind: 'memory.notice',
      definitions,
      thread: 'conversation',
      payload: { notice: 'batch', versions: [], count: 1, isQuiet: true },
    },
    {
      kind: 'memory.writer_failed',
      definitions,
      thread: 'memory-writer',
      payload: { code: 'batch_failed', failures: 1, retryAt: 2_000_000, at: 1_000_000 },
      erasable: { message: 'the model did not answer' },
    },
    {
      kind: 'task_message',
      definitions,
      thread: 'memory-writer',
      payload: {
        messageID: 'm1',
        from: 'conversation',
        to: 'memory-writer',
        kind: 'chat',
        replyTo: null,
        onBehalfOf: [],
        hop: 1,
        hopLimit: 20,
        wake: false,
        woke: false,
        opensWait: null,
        source: 'task:conversation',
      },
      erasable: { body: 'Please look at the pets again.' },
    },
  ]);
}

async function seedConsolidator(ctx: MemoryTaskHost) {
  const memory = ctx.memory;
  const log = ctx.log;

  await createSystemTask(memory.context, 'memory-consolidator');

  await writeInboxRecords(memory.context, [
    {
      kind: 'task.wake',
      definitions,
      thread: 'memory-consolidator',
      payload: { at: memory.clock.now() },
    },
  ]);

  const items = await memory.listItems();

  const [first, second, third] = items;

  invariant(first !== undefined && second !== undefined && third !== undefined);

  const diff = await createConsolidationDiff(
    { log, store: memory.store },
    {
      changes: [
        {
          kind: 'merge',
          inputs: [
            { itemID: first.itemID, version: first.version },
            { itemID: second.itemID, version: second.version },
          ],
          text: 'You have a pet called Ash and a cat called Cedar.',
          reason: 'Both items are about the owner pets.',
          source: 'owner',
        },
        {
          kind: 'retire',
          inputs: [{ itemID: third.itemID, version: third.version }],
          reason: 'The note is stale.',
          source: 'owner',
        },
      ],
      now: memory.clock.now(),
      summary: { text: 'Two items about pets became one.', itemIDs: [first.itemID, second.itemID] },
    },
  );

  const [merge, retire] = diff.changes;

  invariant(merge !== undefined && retire !== undefined);

  await memory.store.consolidations.approve({
    changeID: merge.changeID,
    actionHash: merge.actionHash,
    identityID: 'identity-1',
  });

  await memory.store.consolidations.comment({
    changeID: retire.changeID,
    text: 'Keep it for now.',
    runID: 'run-1',
  });
}

async function seedPromptsAndInputs(ctx: MemoryTaskHost) {
  const log = ctx.log;
  const provenance = { runID: 'run-1', callID: 'call-1', profile: 'direct' };
  const proposedKind = 'prompts.override_proposed' as const satisfies PromptsRecordKind;
  const rejectedKind = 'prompts.override_rejected' as const satisfies PromptsRecordKind;
  const openedKind = 'model.input_opened' as const satisfies TurnInputsRecordKind;

  const records: RecordInput[] = [
    ...(['writer', 'session'] as const).flatMap((promptID) => [
      {
        kind: proposedKind,
        definitions,
        thread: 'conversation',
        payload: {
          proposalID: `prompt-${promptID}`,
          promptID,
          proposalHash: `hash-${promptID}`,
          baseHash: null,
          entry: {},
          files: [],
          reason: 'Tighter wording.',
          provenance,
        },
      },
      {
        kind: rejectedKind,
        definitions,
        thread: 'conversation',
        payload: { proposalID: `prompt-${promptID}` },
      },
    ]),
    {
      kind: proposedKind,
      definitions,
      thread: 'conversation',
      payload: {
        proposalID: 'prompt-consolidator-open',
        promptID: 'consolidator',
        proposalHash: 'hash-consolidator',
        baseHash: null,
        entry: {},
        files: [],
        reason: 'Calmer wording.',
        provenance,
      },
    },
    {
      kind: openedKind,
      definitions,
      thread: 'conversation',
      payload: { inputID: 'input-writer', by: 'host' },
    },
    {
      kind: openedKind,
      definitions,
      thread: 'conversation',
      payload: { inputID: 'input-conversation', by: 'host' },
    },
  ];

  await writeRecords(log, records);

  await withWriteTransaction(log.writer, async (tx) => {
    await sql`insert into personas (persona_version, instructions) values ('p1', 'Be kind.')`.execute(
      tx,
    );

    await sql`insert into definition_snapshots (snapshot_hash, persona_version, policy_hash, form, label, created_at)
      values ('sha256:aa', 'p1', 'x', ${JSON.stringify({
        persona: 'p1',
        prompts: {
          writer: { parts: {}, template: null },
          session: { parts: {}, template: null },
          consolidator: { parts: {}, template: null },
        },
      })}, 'seed', 1)`.execute(tx);

    for (const [approvalID, proposalID, promptID] of [
      ['approval-writer', 'prompt-writer', 'writer'],
      ['approval-session', 'prompt-session', 'session'],
    ] as const) {
      await sql`insert into prompt_approvals (approval_id, proposal_id, prompt_id, thread, entry, files, state, approved_at, updated_at)
        values (${approvalID}, ${proposalID}, ${promptID}, 'conversation', '{}', '[]', 'current', 1, 1)`.execute(
        tx,
      );

      await sql`insert into prompt_exports (approval_id, state, pull_request_number, pull_request_url, updated_at)
        values (${approvalID}, 'opened', 1, 'https://example.test/pull/1', 1)`.execute(tx);

      await sql`insert into prompt_export_attempts (approval_id, started_at) values (${approvalID}, 1)`.execute(
        tx,
      );
    }

    for (const [captureID, taskID] of [
      ['capture-writer', 'memory-writer'],
      ['capture-conversation', 'conversation'],
    ] as const) {
      await sql`insert into turn_input_captures (capture_id, task_id, step_run_id, role, profile, model, harness, source, state, opened_at)
        values (${captureID}, ${taskID}, 'step-1', ${taskID}, 'direct', 'claude-test-1', 'agent-sdk', 'gateway', 'closed', 1)`.execute(
        tx,
      );
    }

    for (const [inputID, captureID, taskID] of [
      ['input-writer', 'capture-writer', 'memory-writer'],
      ['input-conversation', 'capture-conversation', 'conversation'],
    ] as const) {
      await sql`insert into turn_inputs (input_id, capture_id, task_id, step_run_id, writer, counter, role, profile, model, harness, api, endpoint, route, is_rewritten, upstream_status, bytes, key_id, intake_sequence, received_at, taken_at, state)
        values (${inputID}, ${captureID}, ${taskID}, 'step-1', 'w', 1, ${taskID}, 'direct', 'claude-test-1', 'agent-sdk', 'messages', 'e', 'r', 0, 200, 10, ${`key-${inputID}`}, 1, 1, 1, 'stored')`.execute(
        tx,
      );
    }
  });
}
