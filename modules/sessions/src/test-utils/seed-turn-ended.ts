import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { bindHarness } from '@heynixie/models';
import { buildMockModelProfile } from '@heynixie/models/test-utils';
import type { TasksContext } from '@heynixie/tasks';
import { createConversationTask, writeInboxRecords } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import type { StepTurn } from '../step/build-step-result';
import { buildStepResult } from '../step/build-step-result';
import { runNextStep } from './run-next-step';

// Leaves the record that a finished turn of the conversation writes, through the step commit that
// writes it, and returns it.
export async function seedTurnEnded(context: TasksContext): Promise<LogRecord> {
  await createConversationTask(context);

  await writeInboxRecords(context, [
    {
      kind: 'owner_message',
      definitions: context.definitions(),
      thread: 'conversation',
      erasable: { text: 'Is anyone there?' },
    },
  ]);

  const source = {
    definitions: context.definitions,
    model: { model: 'claude-test-1', profile: 'chat-direct' },
  };

  const turn: StepTurn = {
    turn: {
      assistants: [],
      read: [],
      ended: [
        {
          type: 'ended',
          boundary: { harness: 'agent-sdk', sessionID: 'session-1', messageID: 'message-1' },
          outcome: 'finished',
          stopReason: 'end_turn',
          turns: 1,
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        },
      ],
      failure: null,
      written: [],
      settledWritten: 0,
    },
    sent: new Set<number>(),
    silent: new Set<number>(),
    hasMore: false,
    notedThrough: null,
    waitTelling: null,
    images: { bytes: 0, count: 0 },
    isSilent: false,
    runID: 'seed-step@1',
    harness: bindHarness(buildMockModelProfile()),
    prices: null,
    memory: { pinnedCore: [], retrieved: [], invalidatedThrough: 0 },
  };

  const result = buildStepResult(source, turn, []);

  await runNextStep(context, () => Promise.resolve(result));

  const entries = await readRecords(context.log, { afterSequence: 0, kinds: ['model.turn_ended'] });

  const record = entries.at(-1)?.record;

  invariant(record, 'the turn end wrote no record');

  return record;
}
