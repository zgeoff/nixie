import { buildCodingActionTools, buildCodingConnectors } from '@heynixie/coding';
import type { ToolDefinition } from '@heynixie/tools';
import type { ActionsWithForget } from '../forget/add-log-forget';
import type { ServerCoding } from './build-server-coding';

export interface ActionsWithCoding extends ActionsWithForget {
  // the actions that the coding runner queues, which no model's tool list holds
  readonly queuedTools: readonly ToolDefinition[];
}

// The coding connectors need the adapter, which the other actions' tests have no use for, so the
// part adds them after the queue is built. Without a coding runner, the actions gain nothing.
export function addCodingConnectors(
  actions: ActionsWithForget,
  coding: ServerCoding | null,
): ActionsWithCoding {
  if (coding === null) {
    return { ...actions, queuedTools: [] };
  }

  return {
    ...actions,
    queuedTools: buildCodingActionTools(),
    connectors: new Map([...actions.connectors, ...buildCodingConnectors(coding.adapter)]),
  };
}
