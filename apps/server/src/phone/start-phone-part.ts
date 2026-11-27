import type { ErasureHandle } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import type {
  PhoneActionConnector,
  PhoneContext,
  TextErasureRequest,
  TextForgetter,
} from '@heynixie/phone';
import {
  buildPhoneConnector,
  buildPhoneSource,
  buildPhoneTools,
  startTextForgetter,
} from '@heynixie/phone';
import type { FakePhoneProvider } from '@heynixie/phone/fake';
import type { TasksContext } from '@heynixie/tasks';
import type { ToolDefinition } from '@heynixie/tools';
import type { TriggerSource } from '@heynixie/triggers';
import invariant from 'tiny-invariant';
import type { PhoneInputs } from './create-phone-inputs';

export interface PhonePart {
  readonly tools: readonly ToolDefinition[];
  readonly connectors: ReadonlyMap<string, PhoneActionConnector>;
  readonly source: TriggerSource;

  // the in-memory provider of a test build with a harness
  readonly fake: FakePhoneProvider | null;

  // the assistant's forget of a text, which waits for the erasure runner to start
  readonly forgetter: TextForgetter;

  // hands the forgetter the runner's handle for a text, once the runner exists
  readonly bindForget: (handle: ErasureHandle<TextErasureRequest>) => void;
}

const forgetRetryMs = 1000;

// The phone's tools, connector and source, on the provider that the inputs hold. The part exists
// only while the config sets a `phone` section.
export function startPhonePart(
  inputs: PhoneInputs | null,
  tasks: TasksContext,
  logEvent: Logger,
): PhonePart {
  invariant(inputs, 'the phone part starts only with a phone section');

  const context: PhoneContext = {
    log: tasks.log,
    clock: tasks.clock,
    definitions: tasks.definitions,
    settings: inputs.settings,
    logEvent,
    provider: inputs.provider,
  };

  const bound: { handle: ErasureHandle<TextErasureRequest> | null } = { handle: null };

  const forgetter = startTextForgetter({
    context,
    readHandle: () => bound.handle,
    retryMs: forgetRetryMs,
  });

  return {
    tools: buildPhoneTools(context, forgetter),
    connectors: buildPhoneConnector(context),
    source: buildPhoneSource(context),
    fake: inputs.fake,
    forgetter,
    bindForget: (handle) => {
      bound.handle = handle;
    },
  };
}
