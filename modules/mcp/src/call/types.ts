import type { JSONObject } from '@heynixie/log';
import type { ServerCallOutcome } from './run-server-call';

// A refusal is nixie's own sentence, which names the server and says what to do.
type CallClearance =
  | { readonly kind: 'cleared' }
  | { readonly kind: 'refused'; readonly text: string };

// What a proxied tool reaches the server through. Every call passes `clear` first, so a call
// reaches the server only when the newest server listing passed and left the tool exposed.
export interface ProxyCalls {
  // may list the server first, when its next try is due
  readonly clear: (tool: string) => Promise<CallClearance>;

  // sends the call with the server's own name for the tool
  readonly send: (
    tool: string,
    serverName: string,
    input: JSONObject,
  ) => Promise<ServerCallOutcome>;
}
