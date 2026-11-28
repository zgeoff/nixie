import type { Definitions, JSONObject, Log } from '@heynixie/log';
import type { EffectDeclaration, McpOverrides, McpReconcile } from '@heynixie/policy';
import type { ProposalConfig } from '@heynixie/proposals';
import type { Kysely, Transaction } from 'kysely';

// The facts in use for one server, folded from records into the mcp_servers projection.
export interface ServerFacts {
  readonly url: string;
  readonly clientID: string;

  // space-separated scopes
  readonly scope: string;

  // one CIDR range, or null when the host resolves to a public address
  readonly privateRange: string | null;
}

// Where a server's grant was signed in: the authorization server that issued it and the endpoints
// that receive its refresh token. A later discovery that names others needs a new sign-in.
export interface GrantBinding {
  readonly issuer: string;
  readonly tokenURL: string;
  readonly revokeURL: string | null;
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

// listed: a tool pinned at its first listing; changed: a form that keeps its input shape; allowed:
// your accept of a change that widens the input
export type PinMoveCause = 'allowed' | 'listed' | 'changed' | 'forgotten';

// What the module's writes need: the log, the snapshot the records name, and the clock.
export interface McpContext {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly now: () => number;

  // the lapse of each family; the defaults apply when the server sets none
  readonly proposalConfig?: ProposalConfig | undefined;
}

// One move of a pin.
export interface PinMove {
  readonly tool: string;
  readonly fromHash: string | null;
  readonly toHash: string | null;
  readonly cause: PinMoveCause;
}

// Called inside the transaction that moves a pin, so what a move causes commits with it.
export type OnPinMoved = (tx: Transaction<unknown>, move: PinMove) => Promise<void>;

// The override files of the definitions in force, and the snapshot that held them.
interface OverridesInForce {
  readonly definitionsHash: string;
  readonly servers: McpOverrides;
}

// Reads through the handle it is given, so a read inside a write transaction stays inside it.
export type ReadOverrides = (
  db: Kysely<unknown> | Transaction<unknown>,
) => Promise<OverridesInForce>;

// The declaration in force for one call of a proxied tool, and where it came from. The records of a
// call hold the pinned hash and the snapshot, so a replay reads the decision under the form and the
// declaration it ran under.
export interface ToolDeclaration {
  readonly tool: string;

  // the declaration's effects, destinations, amount and content; every result field is untrusted
  readonly declaration: Omit<EffectDeclaration, 'results'>;
  readonly reconcile: McpReconcile | null;
  readonly from: 'annotations' | 'override';
  readonly pinnedHash: string;

  // the snapshot that held the override; null when the annotations decided
  readonly definitionsHash: string | null;
}
