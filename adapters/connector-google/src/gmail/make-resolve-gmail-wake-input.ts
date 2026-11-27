import type { JSONObject } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import type { InputResolution, ToolResolveContext } from '@heynixie/tools';
import { pickWakeTiming, resolveWakeTarget } from '@heynixie/triggers';
import { findTextField } from './find-text-field';
import { makeResolveGmailInput } from './make-resolve-gmail-input';
import { parseItemID } from './parse-item-id';
import type { GmailDeps } from './types';

// Resolves a gmail.wake_set call on the host before anything reads it: the connection, which the poll
// must read, the target that has not ended, the task that called, and the durations. The input it returns names all of
// them, so the decision and the approved call carry them.
export function makeResolveGmailWakeInput(
  deps: GmailDeps,
): (input: JSONObject, context: ToolResolveContext) => Promise<InputResolution> {
  const resolveConnection = makeResolveGmailInput(deps.access);

  return async (input, context) => {
    const { thread, ...rest } = input;
    const parsedThread = typeof thread === 'string' ? parseItemID(thread) : null;
    const named = typeof rest['connection'] === 'string' ? rest['connection'] : null;

    if (parsedThread !== null && named !== null && parsedThread.connection !== named) {
      return {
        status: 'error',
        message: 'mixed_connections: the thread and the connection name different accounts',
      };
    }

    const connection = parsedThread?.connection ?? named;
    const connected = connection === null ? rest : { ...rest, connection };

    const resolved = await resolveConnection(connected, context);

    if (resolved.status === 'error') {
      return resolved;
    }

    const polled = await deps.access.readPolledConnections();

    const resolvedConnection = resolved.input['connection'];

    if (typeof resolvedConnection !== 'string' || !polled.includes(resolvedConnection)) {
      return {
        status: 'error',
        message:
          'NOT_POLLED: this account is not granted Gmail access, or needs a new consent, so no ' +
          'rule on it could fire. Ask the owner to reconnect it.',
      };
    }

    const timing = pickWakeTiming({
      expires: findTextField(resolved.input['expires']),
      window: findTextField(resolved.input['window']),
      nowMs: deps.clock.now(),
      defaultWindowMs: deps.wake.defaultWindowMs,
    });

    if (timing.status === 'bad') {
      return {
        status: 'error',
        message:
          'BAD_DURATION: expires and window take a duration such as 1m, 30m or 7d, from 1m, and ' +
          'the window is at most the expiry',
      };
    }

    const caller = context.run.thread === '' ? conversationTaskID : context.run.thread;

    const target = await resolveWakeTarget(deps.log, caller, findTextField(resolved.input['wake']));

    if (target.status === 'refused') {
      return { status: 'error', message: target.message };
    }

    return {
      status: 'ok',
      input: {
        ...resolved.input,
        ...(typeof thread === 'string' ? { thread: parsedThread?.id ?? thread } : {}),
        wake: target.target.kind === 'conversation' ? 'conversation' : target.target.taskID,
        setBy: caller,
      },
    };
  };
}
