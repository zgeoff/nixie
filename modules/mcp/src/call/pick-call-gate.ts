import type { ServerHealth } from '../health/types';
import type { McpServerRow, McpToolRow } from '../rows/mcp-tables';

export interface CallGateFacts {
  readonly serverID: string;
  readonly tool: string;
  readonly server: McpServerRow | null;
  readonly toolRow: McpToolRow | null;
  readonly health: ServerHealth;
  readonly nowMs: number;

  // the time of a next try as the owner reads it, such as 14:05
  readonly formatTime: (timeMs: number) => string;
}

export type CallGate =
  | { readonly kind: 'open' }

  // the newest server listing has not passed and its next try is due, so the call lists first
  | { readonly kind: 'list' }
  | { readonly kind: 'refused'; readonly text: string };

// Whether a call may reach the server now: only when the newest server listing passed and left the
// tool exposed. A refusal says why in a sentence for the model, which names the server.
export function pickCallGate(facts: CallGateFacts): CallGate {
  const serverID = facts.serverID;
  const tool = facts.tool;
  const server = facts.server;
  const toolRow = facts.toolRow;
  const health = facts.health;

  if (server === null || server.state === 'removed') {
    return refuse(`${serverID} is no longer configured`);
  }

  if (server.state === 'held') {
    return refuse(`${serverID} waits for your approval`);
  }

  if (!health.hasPassed) {
    const nextTryAtMs = health.nextTryAtMs;

    if (health.lastError === 'unauthorised') {
      return refuse(`${serverID} needs you to sign in again`);
    }

    return nextTryAtMs !== null && nextTryAtMs > facts.nowMs
      ? refuse(`${serverID} is unreachable, next try ${facts.formatTime(nextTryAtMs)}`)
      : { kind: 'list' };
  }

  if (toolRow?.state === 'exposed') {
    return { kind: 'open' };
  }

  if (toolRow?.state === 'stopped_changed') {
    return refuse(`${tool} changed and waits for your review`);
  }

  if (toolRow?.state === 'stopped_unfit') {
    return refuse(`${tool} no longer fits its declaration and waits for your review`);
  }

  return refuse(`${tool} is not available`);
}

function refuse(text: string): CallGate {
  return { kind: 'refused', text };
}
