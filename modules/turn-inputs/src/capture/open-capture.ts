import { createRecordKey, removeRecordKey, withWriteTransaction } from '@heynixie/log';
import { encodeCaptureTag } from '@heynixie/wire';
import { readInputLogState } from '../state/read-input-log-state';
import type { Capture, OpenCapture, OpenCaptureInput, TurnInputsContext } from '../types';
import type { TurnInputsTables } from '../utils/turn-inputs-tables';
import { writeInputMiss } from '../write-input-miss';
import { buildCaptureAAD } from './build-capture-aad';
import { closeStepCapture } from './close-step-capture';
import type { CapturePlan } from './pick-capture-plan';
import { pickCapturePlan } from './pick-capture-plan';
import { sealPrivateKey } from './seal-private-key';

// Never throws: a fault in the log hands the step the profile's own base URL, so the model request
// goes on with no tag.
export async function openCapture(
  ctx: TurnInputsContext,
  input: OpenCaptureInput,
): Promise<Capture> {
  const own: Capture = { baseURL: input.profile.baseURL, close: () => Promise.resolve() };

  try {
    const state = await readInputLogState(ctx);

    const plan = pickCapturePlan({
      config: ctx.config,
      isOn: state.state === 'on',
      role: input.role,
      profile: input.profile,
      answers: ctx.answers,
    });

    if (plan.kind === 'none') {
      return own;
    }

    if (plan.kind === 'miss') {
      await ctx.lane.run(() =>
        writeInputMiss(ctx, {
          captureID: null,
          taskID: input.step.taskID,
          stepRunID: input.step.stepRunID,
          reason: 'no_capture_point',
        }),
      );

      return own;
    }

    return await ctx.lane.run(() => createCapture(ctx, input, plan, own));
  } catch {
    ctx.logger('turn_input.open_failed', { reason: 'unexpected' }, 'warn');

    return own;
  }
}

type CapturingPlan = Extract<CapturePlan, { kind: 'capture' }>;

async function createCapture(
  ctx: TurnInputsContext,
  input: OpenCaptureInput,
  plan: CapturingPlan,
  own: Capture,
): Promise<Capture> {
  const captureID = crypto.randomUUID();
  const created: { keyID: string | null } = { keyID: null };

  try {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ]);

    const exportedPublic = await crypto.subtle.exportKey('raw', pair.publicKey);
    const exportedPrivate = await crypto.subtle.exportKey('pkcs8', pair.privateKey);

    const publicKey = new Uint8Array(exportedPublic);
    const pkcs8 = new Uint8Array(exportedPrivate);

    const recordKey = await createRecordKey(ctx.log);

    created.keyID = recordKey.keyID;

    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      pkcs8,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    );

    const sealed = await sealPrivateKey(
      recordKey.key,
      buildCaptureAAD(recordKey.keyID, captureID),
      pkcs8,
    );

    await withWriteTransaction(ctx.log.writer, (tx) =>
      tx
        .$extendTables<TurnInputsTables>()
        .insertInto('turn_input_captures')
        .values({
          capture_id: captureID,
          task_id: input.step.taskID,
          step_run_id: input.step.stepRunID,
          role: input.role,
          profile: input.profile.id,
          model: input.profile.model,
          harness: input.profile.harness,
          source: plan.name,
          key_id: recordKey.keyID,
          sealed_private_key: sealed,
          state: 'open',
          close_cause: null,
          opened_at: ctx.clock.now(),
          closed_at: null,
          call_frames: null,
          inputs: 0,
          misses: 0,
        })
        .execute(),
    );

    const capture: OpenCapture = {
      captureID,
      taskID: input.step.taskID,
      stepRunID: input.step.stepRunID,
      role: input.role,
      profile: input.profile.id,
      model: input.profile.model,
      harness: input.profile.harness,
      source: plan.name,
      keyID: recordKey.keyID,
      privateKey,
      isClosing: false,
    };

    ctx.open.set(captureID, capture);

    const tag = encodeCaptureTag({ captureID, sealTo: publicKey });

    return {
      baseURL: `${input.profile.baseURL.replace(/\/+$/u, '')}/~in.${tag}`,
      close: (step) => closeStepCapture(ctx, capture, step.callFrames),
    };
  } catch {
    ctx.logger('turn_input.open_failed', { reason: 'store' }, 'warn');

    if (created.keyID !== null) {
      await removeRecordKey(ctx.log, created.keyID).catch(() => {});
    }

    return own;
  }
}
