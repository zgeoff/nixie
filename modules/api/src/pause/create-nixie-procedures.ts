// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { readPauseSince } from '@heynixie/log';
import { match } from 'ts-pattern';
import { requireCaller } from '../memory/require-caller';
import { readResumeRefusal } from '../spend/read-resume-refusal';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { toPauseResponse } from './to-pause-response';
import { toPauseState } from './to-pause-state';
import type { CheckedNixieControlResult, NixieControl } from './write-checked-nixie-control';
import { writeCheckedNixieControl } from './write-checked-nixie-control';

export function createNixieProcedures(context: APIContext) {
  const nixie = apiImplementer.nixie;

  return {
    read: nixie.read.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const pause = await readPauseSince(context.log.writer.db);

      const paused = toPauseState(pause);

      return { paused: toPauseResponse(paused) };
    }),

    pause: nixie.pause.handler((options) => runControl(context, 'pause', options)),
    resume: nixie.resume.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const refusal = await readResumeRefusal(context);

      if (refusal !== null) {
        throw options.errors.SPEND_STOP_STANDS({ message: refusal });
      }

      return runControl(context, 'resume', options);
    }),
  };
}

type ControlProcedure = Parameters<typeof apiImplementer.nixie.pause.handler>[0];

type ControlOptions = Parameters<ControlProcedure>[0];

async function runControl(context: APIContext, control: NixieControl, options: ControlOptions) {
  const caller = await requireCaller(
    context,
    options.context.sessionToken,
    options.errors.UNAUTHORIZED,
  );

  const result = await writeCheckedNixieControl(context, caller, {
    clientActionID: options.input.clientActionID,
    control,
  });

  return toNixieControlled(result, options.errors);
}

function toNixieControlled(result: CheckedNixieControlResult, errors: ControlOptions['errors']) {
  return match(result)
    .with({ status: 'controlled' }, (controlled) => ({
      paused: toPauseResponse(controlled.paused),
    }))
    .with({ status: 'reused' }, () => {
      throw errors.CLIENT_ACTION_ID_REUSED();
    })
    .with({ status: 'unauthorized' }, () => {
      throw errors.UNAUTHORIZED();
    })
    .exhaustive();
}
