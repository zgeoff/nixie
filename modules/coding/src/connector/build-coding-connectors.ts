import type { ActionConnector, CheckResponse } from '@heynixie/connectors';
import { z } from 'zod';
import type { CodingAdapter, SessionRef } from '../types';
import { codingToolNames } from './coding-tool-names';
import { spawnToolNames } from './spawn-tool-names';
import { toProviderResponse } from './to-provider-response';

// A system that runs coding sessions forgets a completed key 24 h after its call, so the queue
// stops trusting a resend under the key an hour before that.
const keptForMs = 23 * 60 * 60 * 1000;

const startArgumentsSchema = z.object({
  name: z.string(),
  prompt: z.string(),
  repo: z.object({ url: z.string(), ref: z.string() }),
  target: z.object({ daemon: z.string(), target: z.string() }),
  agent: z.string().exactOptional(),
  model: z.string().exactOptional(),
});

const sessionArgumentsSchema = z.object({ session: z.string() });
const textArgumentsSchema = sessionArgumentsSchema.extend({ text: z.string() });

// The queue's connectors for the 4 coding actions, by tool name. A spawn and a note resend under
// their key after an unknown outcome, a steer would type again so it asks the user, and a stop
// settles by a read of the session.
export function buildCodingConnectors(
  adapter: CodingAdapter,
): ReadonlyMap<string, ActionConnector> {
  const spawn: ActionConnector = {
    reconcile: { kind: 'idempotency_key', where: adapter.id, keptForMs },
    run: async (attempt) => {
      const brief = startArgumentsSchema.parse(attempt.arguments);

      const reply = await adapter.start(brief, attempt.idempotencyKey);

      return toProviderResponse(reply, (started) => ({
        sessionID: started.session.id,
        state: started.state,
        fromCursor: started.fromCursor,
      }));
    },
  };

  return new Map<string, ActionConnector>([
    ...spawnToolNames.map((tool): [string, ActionConnector] => [tool, spawn]),
    [
      codingToolNames.steer,
      {
        reconcile: { kind: 'none' },
        run: async (attempt) => {
          const input = textArgumentsSchema.parse(attempt.arguments);

          const reply = await adapter.steer(toSessionRef(adapter, input.session), input.text);

          return toProviderResponse(reply, () => ({ typed: true }));
        },
      },
    ],
    [
      codingToolNames.message,
      {
        reconcile: { kind: 'idempotency_key', where: adapter.id, keptForMs },
        run: async (attempt) => {
          const input = textArgumentsSchema.parse(attempt.arguments);

          const reply = await adapter.message(
            toSessionRef(adapter, input.session),
            input.text,
            attempt.idempotencyKey,
          );

          return toProviderResponse(reply, (sent) => ({ messageRef: sent.messageRef }));
        },
      },
    ],
    [
      codingToolNames.stop,
      {
        reconcile: { kind: 'check', tool: codingToolNames.stop },
        run: async (attempt) => {
          const input = sessionArgumentsSchema.parse(attempt.arguments);

          const reply = await adapter.stop(toSessionRef(adapter, input.session));

          return toProviderResponse(reply, (stopped) => ({ stopped: stopped.stopped }));
        },
        check: async (attempt) => {
          const input = sessionArgumentsSchema.parse(attempt.arguments);

          const reply = await adapter.read(toSessionRef(adapter, input.session), {
            prompt: false,
            tailTurns: 0,
          });

          return pickStopCheck(reply);
        },
      },
    ],
  ]);
}

// An action names its session as '<adapter ID>:<session ID>', the form the policy rules match.
function toSessionRef(adapter: CodingAdapter, session: string): SessionRef {
  const prefix = `${adapter.id}:`;

  return { id: session.startsWith(prefix) ? session.slice(prefix.length) : session };
}

function pickStopCheck(reply: Awaited<ReturnType<CodingAdapter['read']>>): CheckResponse {
  if (reply.status !== 'ok') {
    return reply.status === 'refused' && reply.reason === 'no_such_session'
      ? { kind: 'found', result: { stopped: false } }
      : { kind: 'inconclusive' };
  }

  return reply.value.state === 'ended' || reply.value.state === 'gone'
    ? { kind: 'found', result: { stopped: true } }
    : { kind: 'not_found' };
}
