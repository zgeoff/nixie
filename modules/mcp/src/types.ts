import type { Definitions, JSONObject, Log } from '@heynixie/log';
import type { Transaction } from 'kysely';

// The facts in use for one server, folded from records into the mcp_servers projection.
export interface ServerFacts {
  readonly url: string;
  readonly clientID: string;

  // space-separated scopes
  readonly scope: string;
  readonly trusted: boolean;

  // one CIDR range, or null when the host resolves to a public address
  readonly privateRange: string | null;
}

// held: waits for the proposal of its widened facts; added: approved, signed in or not
export type ServerState = 'held' | 'added' | 'removed';

// The operation of an mcp proposal, whose SHA-256 is the proposal's action hash.
export type McpOperation =
  | { readonly change: 'server'; readonly serverID: string; readonly facts: ServerFacts }
  | {
      readonly change: 'allow';
      readonly tool: string;

      // null for a tool that has no allowed form yet
      readonly fromHash: string | null;
      readonly hash: string;
    };

// One tool as a server listing returns it. The canonical JSON of this form is what a pin hashes.
export interface ToolForm {
  // the server's name for the tool, before the prefix
  readonly name: string;
  readonly title: string | null;
  readonly description: string | null;
  readonly inputSchema: JSONObject;
  readonly outputSchema: JSONObject | null;

  // _meta is left out
  readonly annotations: JSONObject | null;
}

export type PinState = 'exposed' | 'stopped_changed' | 'stopped_unfit' | 'hidden_new' | 'removed';

export type PinMoveCause = 'allowed' | 'trusted_change' | 'forgotten';

// What the module's writes need: the log, the snapshot the records name, and the clock.
export interface McpContext {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly now: () => number;
}

// One move of a pin, which the 2 items that build on the proxy listen to.
export interface PinMove {
  readonly tool: string;
  readonly fromHash: string | null;
  readonly toHash: string | null;
  readonly cause: PinMoveCause;
}

// Called inside the transaction that moves a pin. The proxy ships it with no listener.
export type OnPinMoved = (tx: Transaction<unknown>, move: PinMove) => Promise<void>;
