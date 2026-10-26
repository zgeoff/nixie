// oxlint-disable @stylistic/lines-around-comment -- turbo reads @boundaries-ignore only on the line above an import, and the import sort keeps no blank line there
import { expect, mock, test } from 'bun:test';
// @boundaries-ignore a spike imports the code it measures
import type { CheckRequest } from '../../../libs/wire/src/check-frame.ts';
import { runChecks } from './run-checks.ts';
import type { PaidReply } from './run-paid-query.ts';
import type { CheckRecord, Reservation } from './types.ts';

function setupTest() {
  return { appendRecord: mock<(record: CheckRecord) => Promise<void>>(() => Promise.resolve()) };
}

test('it appends one record for each case with the parsed verdict and its cost', async () => {
  const ctx = setupTest();

  const result = await runChecks({
    cases: [
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ sequence: 1, text: 'check the bus times', spans: [] }],
        call: { sequence: 3, tool: 'web_fetch', input: { url: 'https://bus.example/times' } },
      },
    ],
    done: [],
    appendReservation: () => Promise.resolve(),
    appendSettlement: () => Promise.resolve(),
    appendRecord: ctx.appendRecord,
    reserveUSD: null,
    profile: {
      model: 'claude-sonnet-5-5',
      baseURL: 'https://api.anthropic.com',
      effort: 'high',
      authHeader: 'bearer',
    },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runCheck: () =>
      Promise.resolve({
        kind: 'answer',
        output: { reason: 'the owner asked for the bus times', verdict: 'asserted' },
        costUSD: 0.012,
        durationMs: 900,
        apiMs: 800,
      }),
  });

  expect(result).toStrictEqual({
    ran: 1,
    skipped: 0,
    costUSD: 0.012,
    isStoppedAtBudget: false,
    isStoppedByFailure: false,
  });

  expect(ctx.appendRecord.mock.calls).toStrictEqual([
    [
      {
        caseID: '2/3',
        bucket: 'natural',
        tool: 'web_fetch',
        model: 'claude-sonnet-5-5',
        effort: 'high',
        promptSHA256: 'hash-a',
        inputSHA256: '713bb5c50d2578cc730b50816e8bd32d1e6c1ba6d8ddb57a35480e9aa402cb3c',
        verdict: 'asserted',
        reason: 'the owner asked for the bus times',
        failure: null,
        costUSD: 0.012,
      },
    ],
  ]);
});

test('it reserves the spend of a case before it checks the case', async () => {
  const ctx = setupTest();
  const events: (Reservation | string)[] = [];

  await runChecks({
    cases: [
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ sequence: 1, text: 'check the bus times', spans: [] }],
        call: { sequence: 3, tool: 'web_fetch', input: { url: 'https://bus.example/times' } },
      },
    ],
    done: [],
    appendReservation: (reservation) => {
      events.push(reservation);

      return Promise.resolve();
    },
    appendSettlement: () => Promise.resolve(),
    appendRecord: ctx.appendRecord,
    reserveUSD: 2,
    profile: {
      model: 'claude-sonnet-5-5',
      baseURL: 'https://api.anthropic.com',
      effort: 'high',
      authHeader: 'bearer',
    },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runCheck: () => {
      events.push('check');

      return Promise.resolve({ kind: 'failed', reason: 'error_during_execution', costUSD: 0.01 });
    },
  });

  expect(events).toStrictEqual([{ reservedFor: 'case 2/3', reserveUSD: 2 }, 'check']);
});

test('it reserves the most the call of a case can cost when the run asks for no amount', async () => {
  const ctx = setupTest();
  const reservations: Reservation[] = [];

  await runChecks({
    cases: [
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ sequence: 1, text: 'check the bus times', spans: [] }],
        call: { sequence: 3, tool: 'web_fetch', input: { url: 'https://bus.example/times' } },
      },
    ],
    done: [],
    appendReservation: (reservation) => {
      reservations.push(reservation);

      return Promise.resolve();
    },
    appendSettlement: () => Promise.resolve(),
    appendRecord: ctx.appendRecord,
    reserveUSD: null,
    profile: {
      model: 'claude-sonnet-5-5',
      baseURL: 'https://api.anthropic.com',
      effort: 'high',
      authHeader: 'bearer',
    },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runCheck: () =>
      Promise.resolve({ kind: 'failed', reason: 'error_during_execution', costUSD: 0.01 }),
  });

  expect(reservations).toStrictEqual([{ reservedFor: 'case 2/3', reserveUSD: 1.739436 }]);
});

test('it refuses a reservation below the most the call of a case can cost and checks nothing', () => {
  const ctx = setupTest();

  const runCheck = mock<(request: CheckRequest) => Promise<PaidReply>>(() =>
    Promise.resolve({ kind: 'failed', reason: 'error_during_execution', costUSD: 0.01 }),
  );

  expect(
    runChecks({
      cases: [
        {
          caseID: '2/3',
          bucket: 'natural',
          stepSequence: 2,
          messages: [{ sequence: 1, text: 'check the bus times', spans: [] }],
          call: { sequence: 3, tool: 'web_fetch', input: { url: 'https://bus.example/times' } },
        },
      ],
      done: [],
      appendReservation: () => Promise.resolve(),
      appendSettlement: () => Promise.resolve(),
      appendRecord: ctx.appendRecord,
      reserveUSD: 0.1,
      profile: {
        model: 'claude-sonnet-5-5',
        baseURL: 'https://api.anthropic.com',
        effort: 'high',
        authHeader: 'bearer',
      },
      systemPrompt: 'You check one tool call.',
      promptSHA256: 'hash-a',
      otherSpentUSD: 0,
      budgetUSD: 4,
      limit: null,
      concurrency: 1,
      runCheck,
    }),
  ).rejects.toThrow(
    'a reservation of $0.1000 is below $1.7394, the most one call of this run can cost',
  );

  expect(runCheck).not.toHaveBeenCalled();
});

test('it settles a reservation a crash left at its reserved amount before it reserves the case again', async () => {
  const ctx = setupTest();
  const events: unknown[] = [];

  await runChecks({
    cases: [
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ sequence: 1, text: 'check the bus times', spans: [] }],
        call: { sequence: 3, tool: 'web_fetch', input: { url: 'https://bus.example/times' } },
      },
    ],
    done: [{ reservedFor: 'case 2/3', reserveUSD: 1.75 }],
    appendReservation: (reservation) => {
      events.push(reservation);

      return Promise.resolve();
    },
    appendSettlement: (settlement) => {
      events.push(settlement);

      return Promise.resolve();
    },
    appendRecord: ctx.appendRecord,
    reserveUSD: 2,
    profile: {
      model: 'claude-sonnet-5-5',
      baseURL: 'https://api.anthropic.com',
      effort: 'high',
      authHeader: 'bearer',
    },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runCheck: () => {
      events.push('check');

      return Promise.resolve({ kind: 'failed', reason: 'error_during_execution', costUSD: 0.01 });
    },
  });

  expect(events).toStrictEqual([
    { settledFor: 'case 2/3', settledUSD: 1.75 },
    { reservedFor: 'case 2/3', reserveUSD: 2 },
    'check',
  ]);
});

test('it sends the checker the rendered case under the run profile and prompt', async () => {
  const ctx = setupTest();

  const runCheck = mock<(request: CheckRequest) => Promise<PaidReply>>(() =>
    Promise.resolve({
      kind: 'failed',
      reason: 'error_during_execution',
      costUSD: 0,
    }),
  );

  await runChecks({
    cases: [
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ sequence: 1, text: 'pin the dentist note', spans: [] }],
        call: { sequence: 3, tool: 'memory.pin', input: { id: 'M5' } },
      },
    ],
    done: [],
    appendReservation: () => Promise.resolve(),
    appendSettlement: () => Promise.resolve(),
    appendRecord: ctx.appendRecord,
    reserveUSD: null,
    profile: {
      model: 'claude-sonnet-5-5',
      baseURL: 'https://api.anthropic.com',
      effort: 'high',
      authHeader: 'bearer',
    },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runCheck,
  });

  expect(runCheck.mock.calls).toStrictEqual([
    [
      {
        profile: {
          model: 'claude-sonnet-5-5',
          baseURL: 'https://api.anthropic.com',
          effort: 'high',
          authHeader: 'bearer',
        },
        systemPrompt: 'You check one tool call.',
        input:
          '<owner_message>\npin the dentist note\n</owner_message>\n\n<tool_call>\n{\n  "tool": "memory.pin",\n  "input": {\n    "id": "M5"\n  }\n}\n</tool_call>',
      },
    ],
  ]);
});

test('it records a call with no answer with its cost and stops the run', async () => {
  const ctx = setupTest();

  const result = await runChecks({
    cases: [
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ sequence: 1, text: 'pin the dentist note', spans: [] }],
        call: { sequence: 3, tool: 'memory.pin', input: { id: 'M5' } },
      },
    ],
    done: [],
    appendReservation: () => Promise.resolve(),
    appendSettlement: () => Promise.resolve(),
    appendRecord: ctx.appendRecord,
    reserveUSD: null,
    profile: {
      model: 'claude-sonnet-5-5',
      baseURL: 'https://api.anthropic.com',
      effort: 'high',
      authHeader: 'bearer',
    },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runCheck: () =>
      Promise.resolve({
        kind: 'answer',
        output: undefined,
        costUSD: 0.75,
        durationMs: 300,
        apiMs: 0,
      }),
  });

  expect(result.isStoppedByFailure).toBe(true);

  expect(ctx.appendRecord.mock.calls).toStrictEqual([
    [
      {
        caseID: '2/3',
        bucket: 'natural',
        tool: 'memory.pin',
        model: 'claude-sonnet-5-5',
        effort: 'high',
        promptSHA256: 'hash-a',
        inputSHA256: '45d1ced4084ae4474e7e814a0799a81027d87203d7724bbd0a5f80a60036ed3d',
        verdict: 'unsure',
        reason: '',
        failure: 'no_output',
        failureReason: 'the answer held no output',
        costUSD: 0.75,
      },
    ],
  ]);
});

test('it keeps the reason and the cost a failed query gave in its record and in the result', async () => {
  const ctx = setupTest();

  const result = await runChecks({
    cases: [
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ sequence: 1, text: 'pin the dentist note', spans: [] }],
        call: { sequence: 3, tool: 'memory.pin', input: { id: 'M5' } },
      },
    ],
    done: [],
    appendReservation: () => Promise.resolve(),
    appendSettlement: () => Promise.resolve(),
    appendRecord: ctx.appendRecord,
    reserveUSD: null,
    profile: {
      model: 'claude-sonnet-5-5',
      baseURL: 'https://api.anthropic.com',
      effort: 'high',
      authHeader: 'bearer',
    },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runCheck: () => Promise.resolve({ kind: 'failed', reason: 'error_max_turns', costUSD: 0.02 }),
  });

  expect(result.failureReason).toBe('error_max_turns');
  expect(result.costUSD).toBe(0.02);

  expect(ctx.appendRecord.mock.calls).toStrictEqual([
    [
      {
        caseID: '2/3',
        bucket: 'natural',
        tool: 'memory.pin',
        model: 'claude-sonnet-5-5',
        effort: 'high',
        promptSHA256: 'hash-a',
        inputSHA256: '45d1ced4084ae4474e7e814a0799a81027d87203d7724bbd0a5f80a60036ed3d',
        verdict: 'unsure',
        reason: '',
        failure: 'no_output',
        failureReason: 'error_max_turns',
        costUSD: 0.02,
      },
    ],
  ]);
});

test('it runs a case again when the file holds only a check with no answer', async () => {
  const ctx = setupTest();

  const runCheck = mock<(request: CheckRequest) => Promise<PaidReply>>(() =>
    Promise.resolve({
      kind: 'answer',
      output: { reason: 'the owner asked to pin it', verdict: 'asserted' },
      costUSD: 0.01,
      durationMs: 900,
      apiMs: 800,
    }),
  );

  const result = await runChecks({
    cases: [
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ sequence: 1, text: 'pin the dentist note', spans: [] }],
        call: { sequence: 3, tool: 'memory.pin', input: { id: 'M5' } },
      },
    ],
    done: [
      {
        caseID: '2/3',
        bucket: 'natural',
        tool: 'memory.pin',
        model: 'claude-sonnet-5-5',
        effort: 'high',
        promptSHA256: 'hash-a',
        inputSHA256: '45d1ced4084ae4474e7e814a0799a81027d87203d7724bbd0a5f80a60036ed3d',
        verdict: 'unsure',
        reason: '',
        failure: 'no_output',
        costUSD: 0.75,
      },
    ],
    appendReservation: () => Promise.resolve(),
    appendSettlement: () => Promise.resolve(),
    appendRecord: ctx.appendRecord,
    reserveUSD: null,
    profile: {
      model: 'claude-sonnet-5-5',
      baseURL: 'https://api.anthropic.com',
      effort: 'high',
      authHeader: 'bearer',
    },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runCheck,
  });

  expect(runCheck).toHaveBeenCalledTimes(1);
  expect(result.costUSD).toBe(0.76);
});

test('it runs a case again after a crash and counts both the crashed reservation and the rerun', async () => {
  const ctx = setupTest();

  const runCheck = mock<(request: CheckRequest) => Promise<PaidReply>>(() =>
    Promise.resolve({
      kind: 'answer',
      output: { reason: 'the owner asked to pin it', verdict: 'asserted' },
      costUSD: 0.125,
      durationMs: 900,
      apiMs: 800,
    }),
  );

  const result = await runChecks({
    cases: [
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ sequence: 1, text: 'pin the dentist note', spans: [] }],
        call: { sequence: 3, tool: 'memory.pin', input: { id: 'M5' } },
      },
    ],
    done: [{ reservedFor: 'case 2/3', reserveUSD: 0.25 }],
    appendReservation: () => Promise.resolve(),
    appendSettlement: () => Promise.resolve(),
    appendRecord: ctx.appendRecord,
    reserveUSD: null,
    profile: {
      model: 'claude-sonnet-5-5',
      baseURL: 'https://api.anthropic.com',
      effort: 'high',
      authHeader: 'bearer',
    },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runCheck,
  });

  expect(runCheck).toHaveBeenCalledTimes(1);
  expect(result.costUSD).toBe(0.375);
});

test('it skips the cases the output file already holds and counts their spend', async () => {
  const ctx = setupTest();

  const runCheck = mock<(request: CheckRequest) => Promise<PaidReply>>(() =>
    Promise.resolve({
      kind: 'failed',
      reason: 'error_during_execution',
      costUSD: 0,
    }),
  );

  const result = await runChecks({
    cases: [
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ sequence: 1, text: 'check the bus times', spans: [] }],
        call: { sequence: 3, tool: 'web_fetch', input: { url: 'https://bus.example/times' } },
      },
    ],
    done: [
      {
        caseID: '2/3',
        bucket: 'natural',
        tool: 'web_fetch',
        model: 'claude-sonnet-5-5',
        effort: 'high',
        promptSHA256: 'hash-a',
        inputSHA256: '713bb5c50d2578cc730b50816e8bd32d1e6c1ba6d8ddb57a35480e9aa402cb3c',
        verdict: 'asserted',
        reason: 'the owner asked for the bus times',
        failure: null,
        costUSD: 0.012,
      },
    ],
    appendReservation: () => Promise.resolve(),
    appendSettlement: () => Promise.resolve(),
    appendRecord: ctx.appendRecord,
    reserveUSD: null,
    profile: {
      model: 'claude-sonnet-5-5',
      baseURL: 'https://api.anthropic.com',
      effort: 'high',
      authHeader: 'bearer',
    },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    otherSpentUSD: 1,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runCheck,
  });

  expect(result).toStrictEqual({
    ran: 0,
    skipped: 1,
    costUSD: 1.012,
    isStoppedAtBudget: false,
    isStoppedByFailure: false,
  });

  expect(runCheck).not.toHaveBeenCalled();
});

test('it checks a case again when its saved verdict judged another input under the same ID', async () => {
  const ctx = setupTest();

  const runCheck = mock<(request: CheckRequest) => Promise<PaidReply>>(() =>
    Promise.resolve({
      kind: 'answer',
      output: { reason: 'the owner asked for the bus times', verdict: 'asserted' },
      costUSD: 0.25,
      durationMs: 900,
      apiMs: 800,
    }),
  );

  const result = await runChecks({
    cases: [
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ sequence: 1, text: 'check the bus times', spans: [] }],
        call: { sequence: 3, tool: 'web_fetch', input: { url: 'https://bus.example/times' } },
      },
    ],
    done: [
      {
        caseID: '2/3',
        bucket: 'natural',
        tool: 'web_fetch',
        model: 'claude-sonnet-5-5',
        effort: 'high',
        promptSHA256: 'hash-a',
        inputSHA256: 'hash-of-an-older-case',
        verdict: 'not_asserted',
        reason: 'the owner asked for something else',
        failure: null,
        costUSD: 0.5,
      },
    ],
    appendReservation: () => Promise.resolve(),
    appendSettlement: () => Promise.resolve(),
    appendRecord: ctx.appendRecord,
    reserveUSD: null,
    profile: {
      model: 'claude-sonnet-5-5',
      baseURL: 'https://api.anthropic.com',
      effort: 'high',
      authHeader: 'bearer',
    },
    systemPrompt: 'You check one tool call.',
    promptSHA256: 'hash-a',
    otherSpentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runCheck,
  });

  expect(runCheck).toHaveBeenCalledTimes(1);
  expect(result.costUSD).toBe(0.75);
});

test('it refuses an output file that holds a run under another prompt', () => {
  expect(
    runChecks({
      cases: [],
      done: [
        {
          caseID: '2/3',
          bucket: 'natural',
          tool: 'web_fetch',
          model: 'claude-sonnet-5-5',
          effort: 'high',
          promptSHA256: 'hash-old',
          inputSHA256: 'hash-i',
          verdict: 'asserted',
          reason: 'the owner asked',
          failure: null,
          costUSD: 0.01,
        },
      ],
      appendReservation: () => Promise.resolve(),
      appendSettlement: () => Promise.resolve(),
      appendRecord: async () => {},
      reserveUSD: null,
      profile: {
        model: 'claude-sonnet-5-5',
        baseURL: 'https://api.anthropic.com',
        effort: 'high',
        authHeader: 'bearer',
      },
      systemPrompt: 'You check one tool call.',
      promptSHA256: 'hash-a',
      otherSpentUSD: 0,
      budgetUSD: 4,
      limit: null,
      concurrency: 1,
      runCheck: () =>
        Promise.resolve({ kind: 'failed', reason: 'error_during_execution', costUSD: 0 }),
    }),
  ).rejects.toThrow(/with prompt hash-old$/u);
});
