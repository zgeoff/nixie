// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { connectCall, hangUpCall, readCallView, startCall } from '@heynixie/calls';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { runComputerAction } from '../computer/run-computer-action';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { probeLiveIdentity } from '../utils/probe-live-identity';

const startRefusalSchema = z.enum([
  'VOICE_OFF',
  'SPEECH_UNAVAILABLE',
  'VOICE_PRICE_MISSING',
  'CALL_RUNNING',
  'CALL_BUDGET_REACHED',
]);

const callStateSchema = z.enum(['ringing', 'connecting', 'live', 'ended']);

// Only a signed-in session of the full scope starts, connects or ends a call, because a call spends
// the deployment's money and speaks as the assistant.
export function createCallsProcedures(context: APIContext) {
  return {
    start: apiImplementer.calls.start.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      if (caller.scope !== 'full') {
        throw options.errors.UNAUTHORIZED();
      }

      const calls = context.calls;

      if (calls === undefined) {
        throw options.errors.VOICE_OFF();
      }

      const run = await runComputerAction(
        context,
        caller,
        { procedure: 'calls.start', clientActionID: options.input.clientActionID, input: {} },
        async () => {
          const result = await startCall(calls, { carryingSession: caller.identityID });

          return result.status === 'started'
            ? { callID: result.callID, thread: result.taskID }
            : { refused: result.error };
        },
      );

      if (run.status === 'reused') {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }

      if (run.status === 'unauthorized') {
        throw options.errors.UNAUTHORIZED();
      }

      const refused = startRefusalSchema.safeParse(run.result['refused']);

      if (refused.success) {
        throw match(refused.data)
          .with('VOICE_OFF', () => options.errors.VOICE_OFF())
          .with('SPEECH_UNAVAILABLE', () => options.errors.SPEECH_UNAVAILABLE())
          .with('VOICE_PRICE_MISSING', () => options.errors.VOICE_PRICE_MISSING())
          .with('CALL_RUNNING', () => options.errors.CALL_RUNNING())
          .with('CALL_BUDGET_REACHED', () => options.errors.CALL_BUDGET_REACHED())
          .exhaustive();
      }

      return {
        callID: z.string().parse(run.result['callID']),
        state: 'connecting' as const,
        thread: z.string().parse(run.result['thread']),
      };
    }),

    get: apiImplementer.calls.get.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      if (caller.scope !== 'full') {
        throw options.errors.UNAUTHORIZED();
      }

      const view =
        context.calls === undefined
          ? null
          : await readCallView(context.calls, options.input.callID);

      if (view === null) {
        throw options.errors.CALL_NOT_FOUND();
      }

      return view;
    }),

    connect: apiImplementer.calls.connect.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      if (caller.scope !== 'full') {
        throw options.errors.UNAUTHORIZED();
      }

      const calls = context.calls;

      if (calls === undefined) {
        throw options.errors.SPEECH_UNAVAILABLE();
      }

      const result = await connectCall(calls, {
        callID: options.input.callID,
        session: caller.identityID,
        sdpOffer: options.input.sdpOffer,
        probeCaller: (db) => probeLiveIdentity(db, context, caller.identityID),
      });

      if (result.status === 'connected') {
        return { sdpAnswer: result.sdpAnswer };
      }

      throw match(result.error)
        .with('CALL_NOT_FOUND', () => options.errors.CALL_NOT_FOUND())
        .with('NOT_CARRYING_SESSION', () => options.errors.NOT_CARRYING_SESSION())
        .with('CALL_CONNECTED', () => options.errors.CALL_CONNECTED())
        .with('SPEECH_UNAVAILABLE', () => options.errors.SPEECH_UNAVAILABLE())
        .with('VOICE_PRICE_MISSING', () => options.errors.VOICE_PRICE_MISSING())
        .with('VOICE_CREDENTIAL_REFUSED', () => options.errors.VOICE_CREDENTIAL_REFUSED())
        .with('CALL_BUDGET_REACHED', () => options.errors.CALL_BUDGET_REACHED())
        .with('SESSION_REVOKED', () => options.errors.UNAUTHORIZED())
        .exhaustive();
    }),

    hangUp: apiImplementer.calls.hangUp.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      if (caller.scope !== 'full') {
        throw options.errors.UNAUTHORIZED();
      }

      const calls = context.calls;

      if (calls === undefined) {
        throw options.errors.CALL_NOT_FOUND();
      }

      const run = await runComputerAction(
        context,
        caller,
        {
          procedure: 'calls.hangUp',
          clientActionID: options.input.clientActionID,
          input: { callID: options.input.callID },
        },
        async () => {
          const result = await hangUpCall(calls, options.input.callID);

          return result.status === 'done' ? { state: result.state } : { refused: result.error };
        },
      );

      if (run.status === 'reused') {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }

      if (run.status === 'unauthorized') {
        throw options.errors.UNAUTHORIZED();
      }

      if (run.result['refused'] === 'CALL_NOT_FOUND') {
        throw options.errors.CALL_NOT_FOUND();
      }

      return {
        callID: options.input.callID,
        state: callStateSchema.parse(run.result['state']),
      };
    }),
  };
}
