import type { JSONObject } from '@heynixie/log';
import type { ServerCallOutcome } from './run-server-call';

// A refusal is nixie's own sentence, which names the server and says what to do. A call that is
// cleared carries the hash its tool's pin holds after any listing the clearance made.
type CallClearance =
  | { readonly kind: 'cleared'; readonly pinnedHash: string | null }
  | { readonly kind: 'refused'; readonly text: string };

// What a send came to: the server's answer or failure, or a refusal that never reached the server.
type SendOutcome = ServerCallOutcome | { readonly kind: 'refused'; readonly text: string };

// What a proxied tool reaches the server through. Every call passes `clear` first, so a call
// reaches the server only when the newest server listing passed and left the tool exposed.
export interface ProxyCalls {
  // may list the server first, when its next try is due
  readonly clear: (tool: string) => Promise<CallClearance>;

  // sends the call with the server's own name for the tool
  readonly send: (tool: string, serverName: string, input: JSONObject) => Promise<SendOutcome>;
}
