import { expect, test } from 'bun:test';
import type { TurnAnswer } from '@heynixie/calls';
import { writeRecords } from '@heynixie/log';
import { buildActionProposalInput } from '@heynixie/policy';
import type { StepInput, StepResult } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { runCallTurn } from './run-call-turn';

async function setupTest() {
  const tasks = await startTestTasks({
    recordsAtMs: Date.parse('2027-03-09T03:00:00Z'),
    withProposals: true,
  });

  const answers: TurnAnswer[] = [];
  const closed: (readonly string[])[] = [];
  const endedTurns: string[] = [];

  const interrupt = new AbortController();

  const writeHandOff = async (handOffID: string) => {
    const [record] = await writeRecords(tasks.context.log, [
      {
        kind: 'call.handed_off',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'call-task',
        payload: { callID: 'c1', handOffID, shortID: `short-${handOffID}` },
        erasable: { request: 'a request' },
      },
    ]);

    invariant(record, 'the hand-off was written');

    return record;
  };

  const runTurn = (input: StepInput, runStep: () => Promise<StepResult>) =>
    runCallTurn({
      context: tasks.context,
      hooks: {
        voicePrompt: '',
        conversationToolNames: [],
        answer: (answer) => {
          answers.push(answer);

          return Promise.resolve();
        },
        closeCutHandOffs: (_callID, handOffIDs) => {
          closed.push(handOffIDs);
        },
        endTurn: (callID) => {
          endedTurns.push(callID);

          return Promise.resolve();
        },
      },
      input,
      callID: 'c1',
      runTurn: runStep,
    });

  const buildInput = (inbox: StepInput['inbox']): StepInput => ({
    run: null,
    taskID: 'call-task',
    stepKey: 'call-task:2',
    lease: {
      kind: 'task',
      workID: 'call-task',
      holder: 'runner-1',
      generation: 1,
      epoch: 1,
      expiresAt: 0,
    },
    inbox,
    wake: { hop: 0, cause: { kind: 'event' } },
    sessionBoundary: null,
    signal: new AbortController().signal,
    interrupt: interrupt.signal,
  });

  const cut = () => interrupt.abort();

  const writeClosing = async () => {
    const [record] = await writeRecords(tasks.context.log, [
      {
        kind: 'call.closing',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'call-task',
        payload: { callID: 'c1' },
      },
    ]);

    invariant(record, 'the closing marker was written');

    return record;
  };

  const writeProposal = () =>
    writeRecords(tasks.context.log, [
      buildActionProposalInput({
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'call-task',
        callSequence: 1,
        tool: 'mail.send',
        effects: ['send'],
        cause: 'no_rule',
        input: { to: 'harbour@example.test' },
        destinations: [],
        now: Date.parse('2027-03-09T03:00:00Z'),
      }).record,
    ]);

  return {
    answers,
    closed,
    endedTurns,
    writeHandOff,
    writeClosing,
    writeProposal,
    runTurn,
    buildInput,
    cut,
  };
}

test('it answers each hand-off of the turn once, oldest first, when two are in its inbox', async () => {
  const ctx = await setupTest();
  const first = await ctx.writeHandOff('h1');
  const second = await ctx.writeHandOff('h2');

  await ctx.runTurn(ctx.buildInput([first, second]), () =>
    Promise.resolve({
      next: 'wait',
      records: [],
      acknowledged: [first.sequence, second.sequence],
    }),
  );

  expect(ctx.answers.map((answer) => [answer.handOffID, answer.isFailed])).toStrictEqual([
    ['h1', false],
    ['h2', false],
  ]);
});

test('it answers a hand-off that landed during the turn, with the one it started on', async () => {
  const ctx = await setupTest();
  const first = await ctx.writeHandOff('h1');

  await ctx.runTurn(ctx.buildInput([first]), async () => {
    const live = await ctx.writeHandOff('h2');

    return { next: 'wait', records: [], acknowledged: [first.sequence, live.sequence] };
  });

  expect(ctx.answers.map((answer) => answer.handOffID)).toStrictEqual(['h1', 'h2']);
});

test('it leaves a hand-off the turn did not take for the next turn', async () => {
  const ctx = await setupTest();
  const first = await ctx.writeHandOff('h1');
  const second = await ctx.writeHandOff('h2');

  await ctx.runTurn(ctx.buildInput([first, second]), () =>
    Promise.resolve({ next: 'continue', records: [], acknowledged: [first.sequence] }),
  );

  expect(ctx.answers.map((answer) => answer.handOffID)).toStrictEqual(['h1']);
});

test('it answers each hand-off of a failed turn with the failure and rethrows', async () => {
  const ctx = await setupTest();
  const first = await ctx.writeHandOff('h1');
  const second = await ctx.writeHandOff('h2');

  const ended = ctx.runTurn(ctx.buildInput([first, second]), () =>
    Promise.reject(new Error('the model failed')),
  );

  await ended.catch(() => null);

  expect(ended).rejects.toThrow('the model failed');

  expect(ctx.answers.map((answer) => [answer.handOffID, answer.isFailed])).toStrictEqual([
    ['h1', true],
    ['h2', true],
  ]);
});

test('it answers each hand-off of a turn that stopped at a limit with the failure', async () => {
  const ctx = await setupTest();
  const first = await ctx.writeHandOff('h1');
  const second = await ctx.writeHandOff('h2');

  await ctx.runTurn(ctx.buildInput([first, second]), () =>
    Promise.resolve({
      next: 'continue',
      records: [],
      acknowledged: [],
      run: { activity: 'none', limit: { meter: 'turns', used: 25, limit: 25 } },
    }),
  );

  expect(ctx.answers.map((answer) => [answer.handOffID, answer.isFailed])).toStrictEqual([
    ['h1', true],
    ['h2', true],
  ]);
});

test('it answers a hand-off that landed during a failed turn with the failure', async () => {
  const ctx = await setupTest();
  const first = await ctx.writeHandOff('h1');

  const ended = ctx.runTurn(ctx.buildInput([first]), async () => {
    await ctx.writeHandOff('h2');

    throw new Error('the model failed');
  });

  await ended.catch(() => null);

  expect(ended).rejects.toThrow('the model failed');

  expect(ctx.answers.map((answer) => [answer.handOffID, answer.isFailed])).toStrictEqual([
    ['h1', true],
    ['h2', true],
  ]);
});

test('it closes the hand-off a cut turn started on, and leaves one that landed during it unread for the next turn', async () => {
  const ctx = await setupTest();
  const first = await ctx.writeHandOff('h1');

  ctx.cut();

  const result = await ctx.runTurn(ctx.buildInput([first]), async () => {
    const live = await ctx.writeHandOff('h2');

    return { next: 'wait', records: [], acknowledged: [first.sequence, live.sequence] };
  });

  expect(result).toStrictEqual({
    next: 'continue',
    records: [],
    acknowledged: [first.sequence],
  });

  expect({ answers: ctx.answers, closed: ctx.closed }).toStrictEqual({
    answers: [],
    closed: [['h1']],
  });
});

test('it answers the hand-off of a turn that ended on a proposal with the failure', async () => {
  const ctx = await setupTest();
  const first = await ctx.writeHandOff('h1');

  await ctx.runTurn(ctx.buildInput([first]), async () => {
    await ctx.writeProposal();

    return { next: 'wait', records: [], acknowledged: [first.sequence] };
  });

  expect(ctx.answers.map((answer) => [answer.handOffID, answer.isFailed])).toStrictEqual([
    ['h1', true],
  ]);
});

test('it answers the hand-off of a turn after a proposal an earlier turn made with its reply', async () => {
  const ctx = await setupTest();

  await ctx.writeProposal();

  const first = await ctx.writeHandOff('h1');

  await ctx.runTurn(ctx.buildInput([first]), () =>
    Promise.resolve({ next: 'wait', records: [], acknowledged: [first.sequence] }),
  );

  expect(ctx.answers.map((answer) => [answer.handOffID, answer.isFailed])).toStrictEqual([
    ['h1', false],
  ]);
});

test('it ends the turn of the call after it sends the answers', async () => {
  const ctx = await setupTest();
  const first = await ctx.writeHandOff('h1');

  await ctx.runTurn(ctx.buildInput([first]), () =>
    Promise.resolve({ next: 'wait', records: [], acknowledged: [first.sequence] }),
  );

  expect({ answered: ctx.answers.length, ended: ctx.endedTurns }).toStrictEqual({
    answered: 1,
    ended: ['c1'],
  });
});

test('it reports the closing turn to the conversation with a wake, so the promised summary reaches it', async () => {
  const ctx = await setupTest();
  const closing = await ctx.writeClosing();

  const result = await ctx.runTurn(ctx.buildInput([closing]), () =>
    Promise.reject(new Error('the model failed')),
  );

  expect(result.messages).toStrictEqual([
    {
      to: 'conversation',
      kind: 'report',
      body: 'The call c1 ended with no summary. Its record is the thread of the task call-task.',
      replyTo: null,
      onBehalfOf: [],
      wake: true,
    },
  ]);
});
