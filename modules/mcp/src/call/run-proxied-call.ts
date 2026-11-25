import type { JSONObject } from '@heynixie/log';
import type { ToolOutcome } from '@heynixie/tools';
import type { ToolForm } from '../types';
import { buildCallOutcome } from './build-call-outcome';
import type { ProxyCalls } from './types';

// What one call of a proxied tool came to. A refusal never reached the server. A failure may have:
// the connection broke or timed out after the request left, so a write's outcome is unknown.
export type ProxiedCallResult =
  | { readonly kind: 'refused'; readonly text: string }
  | { readonly kind: 'failed'; readonly text: string }
  | { readonly kind: 'answered'; readonly outcome: ToolOutcome };

export interface ProxiedCallRequest {
  readonly tool: string;
  readonly form: ToolForm;

  // the hash of the pin whose form the input was checked against
  readonly pinnedHash: string;
  readonly input: JSONObject;
}

// Clears the call, sends it to the server and reads the answer against the pinned form.
export async function runProxiedCall(
  request: ProxiedCallRequest,
  calls: ProxyCalls,
): Promise<ProxiedCallResult> {
  const clearance = await calls.clear(request.tool);

  if (clearance.kind === 'refused') {
    return { kind: 'refused', text: clearance.text };
  }

  // A listing that the clearance made may have moved the pin, and the input was checked against the
  // form of the old one.
  if (clearance.pinnedHash !== request.pinnedHash) {
    return {
      kind: 'refused',
      text: `${request.tool} changed while this call was starting, so nothing ran; call it again`,
    };
  }

  const sent = await calls.send(request.tool, request.form.name, request.input);

  if (sent.kind === 'refused') {
    return { kind: 'refused', text: sent.text };
  }

  return sent.kind === 'answered'
    ? {
        kind: 'answered',
        outcome: buildCallOutcome(request.tool, request.form, sent.answer),
      }
    : { kind: 'failed', text: `${request.tool} ${sent.message}` };
}
