import type { ToolCallOptions } from '../call-record/tool-call-options';
import type { ConnectorFailure } from '../types';
import { defaultDetailChars } from './constants';
import { renderFailureMessage } from './render-failure-message';

interface Refusal {
  readonly message: string;
  readonly failure?: ConnectorFailure;
}

// The message the model reads for a step that ends a call before it runs. A connector failure
// becomes the JSON of a failed call, cut to the deployment's cap on the provider's message.
export function readRefusalMessage(refusal: Refusal, options: ToolCallOptions): string {
  return refusal.failure === undefined
    ? refusal.message
    : renderFailureMessage(refusal.failure, {
        nowMs: options.log.writer.clock.now(),
        detailChars: options.retry?.detailChars ?? defaultDetailChars,
      });
}
