import type { ActionsTables } from '@heynixie/actions';
import type { APIContext } from '@heynixie/api';
import {
  forgetToolName,
  readForgetBackupState,
  readRecordForget,
  readRecordForgetCheck,
  readRecordForgetProgress,
  runRecordForget,
} from '@heynixie/api';
import type { ActionAttempt, ActionConnector, ProviderResponse } from '@heynixie/connectors';
import { CodeSandboxDestroyError } from '@heynixie/connectors';
import type { JSONObject } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { match } from 'ts-pattern';
import { z } from 'zod';

export interface LogForget {
  readonly tool: ToolDefinition;
  readonly connector: ActionConnector;
}

const logForgetInput = {
  type: 'object',
  properties: {
    record: {
      type: 'string',
      pattern: '^#?[0-9]{1,15}$',
      description:
        "the eventID of the record to remove, as the owner's # stamp, a log.read eventID or a " +
        'log.read callEventID shows it',
    },
  },
  required: ['record'],
  additionalProperties: false,
};

const logForgetOutput = {
  type: 'object',
  properties: {
    removed: { type: 'string' },
    kind: { type: 'string' },
    backup: { type: 'string' },
  },
  required: ['removed', 'kind', 'backup'],
  additionalProperties: false,
};

const logForgetArguments = z.object({ record: z.string().regex(/^#?\d{1,15}$/u) });

// A check that this long has read nothing from outside nixie's own database, so a miss is a miss.
const trustNegativeAfterMs = 1000;

export function buildLogForgetTool(context: APIContext): LogForget {
  return {
    tool: {
      name: forgetToolName,
      description:
        "Removes one record of this conversation from nixie's log for good, so its text can never " +
        'be read again. Pass record: the eventID that the # stamp on a message, a log.read ' +
        'eventID or a log.read callEventID gives. Nixie removes only the records of this ' +
        'conversation that carry text, such as messages, replies and tool calls and results. ' +
        "The owner's rules may ask them first, and a removal cannot be undone.",
      input: logForgetInput,
      output: logForgetOutput,
      declaration: {
        effects: ['delete'],
        destinations: [],
        amount: null,
        content: [],
        results: { removed: 'owner_data', kind: 'owner_data', backup: 'owner_data' },
      },
      execution: 'queued',

      resolvePolicyFacts: async (input, toolContext) => {
        const sequence = parseSequence(logForgetArguments.parse(input).record);

        const check = await readRecordForgetCheck(context.log.writer.db, {
          thread: toolContext.run.thread,
          sequence,
        });

        if (check.status !== 'ok') {
          return { status: 'error', message: renderRefusal(check, sequence) };
        }

        return {
          status: 'ok',
          sources: toolContext.run.session?.policy?.sources ?? [],
          args: input,
        };
      },
      run: () =>
        Promise.resolve({ status: 'error', message: `${forgetToolName} runs only queued` }),
    },
    connector: {
      reconcile: {
        kind: 'check',
        tool: forgetToolName,
        onNotFound: 'retry',
        trustNegativeAfterMs,
      },
      run: (attempt) => runForget(context, attempt),
      check: async (attempt) => {
        const target = await readTarget(context, attempt);

        // A forget that started and has not finished still has cleanup to run, so only the
        // finished one counts.
        if (
          (await readRecordForget(context.log.writer.db, {
            kind: 'record.forgotten',
            sequence: target.sequence,
          })) === null
        ) {
          return { kind: 'not_found' };
        }

        const check = await readRecordForgetCheck(context.log.writer.db, target);

        return check.status === 'ok'
          ? { kind: 'found', result: await readResult(context, target.sequence, check.kind) }
          : { kind: 'inconclusive' };
      },
    },
  };
}

function parseSequence(record: string): number {
  return Number(record.replace('#', ''));
}

type ForgetCheck = Awaited<ReturnType<typeof readRecordForgetCheck>>;

function renderRefusal(check: Exclude<ForgetCheck, { status: 'ok' }>, sequence: number): string {
  return match(check)
    .with(
      { status: 'not_found' },
      () => `no record with eventID ${String(sequence)} on this thread`,
    )
    .with({ status: 'wrong_kind' }, (wrong) => `nixie cannot remove a ${wrong.kind} record`)
    .with(
      { status: 'action_not_finished' },
      () => 'that record is a queued action that has not run: cancel it or wait for it to run',
    )
    .exhaustive();
}

async function runForget(context: APIContext, attempt: ActionAttempt): Promise<ProviderResponse> {
  const target = await readTarget(context, attempt);
  const check = await readRecordForgetCheck(context.log.writer.db, target);

  if (check.status !== 'ok') {
    return { kind: 'refused', reason: renderRefusal(check, target.sequence) };
  }

  try {
    const start = await runRecordForget(context, target);

    if (start.status !== 'forgotten') {
      return { kind: 'refused', reason: renderRefusal(start, target.sequence) };
    }
  } catch (error) {
    if (error instanceof CodeSandboxDestroyError) {
      return { kind: 'refused_retryable', reason: error.message };
    }

    throw error;
  }

  return { kind: 'success', result: await readResult(context, target.sequence, check.kind) };
}

interface ForgetTarget {
  readonly thread: string;
  readonly sequence: number;
}

// The thread of a queued action is the thread of the call that queued it.
async function readTarget(context: APIContext, attempt: ActionAttempt): Promise<ForgetTarget> {
  const action = await context.log.writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select('task_id')
    .where('action_id', '=', attempt.actionID)
    .executeTakeFirstOrThrow();

  return {
    thread: action.task_id,
    sequence: parseSequence(logForgetArguments.parse(attempt.arguments).record),
  };
}

// The result names the record and never holds its text.
async function readResult(
  context: APIContext,
  sequence: number,
  kind: string,
): Promise<JSONObject> {
  const progress = await readRecordForgetProgress(context, sequence);
  const backup = await readForgetBackupState(context, progress);

  return { removed: String(sequence), kind, backup: backup.state };
}
