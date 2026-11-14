import type { Clock } from '@heynixie/clock';
import type { Definitions, Log } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import type { ModelProfile, ModelRole } from '@heynixie/models';
import type { TurnInputLogConfig } from './turn-input-log-config-schema';
import type { Lane } from './utils/create-lane';

export interface TurnInputsOptions {
  readonly log: Log;
  readonly clock: Clock;
  readonly definitions: () => Definitions;
  readonly logger: Logger;

  // null: the deployment has no turn_input_log section, so the log is off
  readonly config: TurnInputLogConfig | null;

  // searches a body for an own secret value, in plain and JSON-escaped form
  readonly holdsOwnValue: (body: Uint8Array) => boolean;

  // how long a start waits for a gateway's answer
  readonly askTimeoutMs?: number;
}

export interface OpenCaptureInput {
  readonly step: { readonly taskID: string; readonly stepRunID: string };
  readonly profile: Pick<ModelProfile, 'id' | 'model' | 'harness' | 'baseURL'>;
  readonly role: ModelRole;
}

export interface CaptureStep {
  readonly callFrames: number;
}

export interface Capture {
  readonly baseURL: string;

  // a no-op with no capture, and it never throws
  readonly close: (step: CaptureStep) => Promise<void>;
}

export interface OpenCapture {
  readonly captureID: string;
  readonly taskID: string;
  readonly stepRunID: string;
  readonly role: string;
  readonly profile: string;
  readonly model: string;
  readonly harness: string;
  readonly source: string;
  readonly keyID: string;
  readonly privateKey: CryptoKey;

  // the shred failed, so the capture takes no more files and a later run retries it
  isClosing: boolean;
}

export interface TurnInputsContext extends TurnInputsOptions {
  readonly lane: Lane;
  readonly open: Map<string, OpenCapture>;

  // source name to whether its gateway answered that it can capture
  readonly answers: Map<string, boolean>;

  // consecutive failed intakes per spool file name
  readonly failures: Map<string, number>;
  readonly storeDir: string;
}
