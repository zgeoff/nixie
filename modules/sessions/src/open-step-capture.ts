import type { ModelProfile, ModelRole } from '@heynixie/models';

export interface StepCaptureStep {
  readonly taskID: string;
  readonly stepRunID: string;
}

export interface StepCaptureInput {
  readonly step: StepCaptureStep;
  readonly profile: Pick<ModelProfile, 'id' | 'model' | 'harness' | 'baseURL'>;
  readonly role: ModelRole;
}

export interface StepCaptureClose {
  readonly callFrames: number;
}

export interface StepCapture {
  readonly baseURL: string;
  readonly close: (step: StepCaptureClose) => Promise<void>;
}

// What the sessions module needs of the turn-input log: it opens a capture at a step's start and
// closes it at the step's end, and has no other part in it.
export interface StepCapturePort {
  readonly openCapture: (input: StepCaptureInput) => Promise<StepCapture>;
}

// A fault in the log never changes a model request, so a port that throws hands the step the
// profile's own base URL.
export async function openStepCapture(
  port: StepCapturePort | undefined,
  input: StepCaptureInput,
): Promise<StepCapture> {
  if (port === undefined) {
    return { baseURL: input.profile.baseURL, close: () => Promise.resolve() };
  }

  try {
    return await port.openCapture(input);
  } catch {
    return { baseURL: input.profile.baseURL, close: () => Promise.resolve() };
  }
}
