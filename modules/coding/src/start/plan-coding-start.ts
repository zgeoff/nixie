import { writeRecordsInTransaction } from '@heynixie/log';
import type { RunnerAction, RunnerStartPlan, TaskStartBounds } from '@heynixie/tasks';
import { codingToolNames } from '../connector/coding-tool-names';
import { codingSessionBoundCodec } from '../record/coding-session-bound-codec';
import { readOpenBindings } from '../session/read-open-bindings';
import { readSessionByShortID } from '../session/read-session-by-short-id';
import type {
  AdapterReply,
  CodingAdapter,
  CodingContext,
  SessionBrief,
  StartedSession,
  WakeEvent,
} from '../types';
import type { CodingStartInput } from './build-coding-start-schema';
import type { CodingOptions } from './coding-options-schema';
import { pickCodingStart } from './pick-coding-start';

type CodingStartPlan = RunnerStartPlan<CodingOptions>;

// Plans a coding start: a start queues the spawn on the new task's thread, caused by the start's
// call, and a join reads the session and binds it in the start's transaction, sending it nothing.
export async function planCodingStart(
  context: CodingContext,
  adapter: CodingAdapter,
  input: CodingStartInput,
  bounds: TaskStartBounds,
): Promise<CodingStartPlan> {
  const choice = pickCodingStart(input, context.settings);

  if (choice.kind === 'refused') {
    return { status: 'refused', sentence: choice.sentence };
  }

  const envelope = { report: 'next_turn' as const, limits: bounds.limits.default };

  if (choice.kind === 'start') {
    return {
      status: 'planned',
      envelope,
      options: { origin: 'started', wake: [...choice.wake] },
      actions: [buildSpawnAction(choice.brief)],
    };
  }

  const sessionID = await readSessionByShortID(context.tasks.log, adapter.id, choice.shortID);

  if (sessionID === null) {
    return {
      status: 'refused',
      sentence: `No session has the ID ${choice.shortID}. Call coding.sessions for the IDs.`,
    };
  }

  const reply = await adapter.join({ id: sessionID });

  const refusal = pickJoinRefusal(reply);

  if (refusal !== null || reply.status !== 'ok') {
    return { status: 'refused', sentence: refusal ?? 'nixie could not read the session.' };
  }

  return {
    status: 'planned',
    envelope,
    options: { origin: 'joined', wake: [...choice.wake] },
    actions: [],
    transaction: buildJoinTransaction(context, adapter, {
      shortID: choice.shortID,
      joined: reply.value,
      wake: choice.wake,
    }),
  };
}

// The spawn's arguments are the brief, so every attempt sends the same spawn.
function buildSpawnAction(brief: SessionBrief): RunnerAction {
  return {
    tool: codingToolNames.start,
    args: {
      name: brief.name,
      prompt: brief.prompt,
      repo: { url: brief.repo.url, ref: brief.repo.ref },
      target: { daemon: brief.target.daemon, target: brief.target.target },
      ...(brief.agent === undefined ? {} : { agent: brief.agent }),
      ...(brief.model === undefined ? {} : { model: brief.model }),
    },
    hashParts: ['spawn'],

    // the start tool fills in the ID of its own call
    causedBy: { kind: 'tool_call', callID: '' },
  };
}

function pickJoinRefusal(reply: AdapterReply<StartedSession>): string | null {
  if (reply.status === 'unknown') {
    return `nixie could not reach the session: ${reply.reason}. Try again later.`;
  }

  if (reply.status === 'refused') {
    return reply.reason === 'no_such_session'
      ? 'That session is out of reach.'
      : `The session could not be joined: ${reply.reason}.`;
  }

  if (reply.value.state === 'ended') {
    return 'That session has ended.';
  }

  return reply.value.state === 'gone' ? 'That session is out of reach.' : null;
}

interface JoinFacts {
  readonly shortID: string;
  readonly joined: StartedSession;
  readonly wake: readonly WakeEvent[];
}

// The check runs in the start's transaction, so of two joins of one session the second refuses.
function buildJoinTransaction(
  context: CodingContext,
  adapter: CodingAdapter,
  facts: JoinFacts,
): NonNullable<Extract<CodingStartPlan, { status: 'planned' }>['transaction']> {
  const sessionID = facts.joined.session.id;

  return {
    check: async (tx) => {
      const bound = await readOpenBindings(tx, adapter.id, [sessionID]);

      const taskID = bound.get(sessionID);

      return taskID === undefined
        ? null
        : `The session ${facts.shortID} is already bound to the task ${taskID}.`;
    },
    write: async (tx, taskID) => {
      await writeRecordsInTransaction(tx, context.tasks.log, [
        {
          kind: codingSessionBoundCodec.kind,
          definitions: context.tasks.definitions(),
          thread: taskID,
          payload: codingSessionBoundCodec.encode({
            taskID,
            adapter: adapter.id,
            sessionID,
            origin: 'joined',
            actionID: null,
            fromCursor: facts.joined.fromCursor,
            wake: [...facts.wake],
            state: facts.joined.state,
            hop: 0,
          }),
        },
      ]);
    },
  };
}
