import type { JSONObject } from '@heynixie/log';
import type { McpOverrides } from '@heynixie/policy';

// The override files of the MCP proxy as plain JSON, for a snapshot's form and a seed's record.
export function toMcpOverridesForm(overrides: McpOverrides): JSONObject {
  return Object.fromEntries(
    Object.entries(overrides).map(([serverID, tools]) => [
      serverID,
      Object.fromEntries(
        Object.entries(tools).map(([tool, override]) => [
          tool,
          {
            effects: [...override.effects],
            destinations: [...override.destinations],
            amount: override.amount,
            content: override.content === null ? null : [...override.content],
            reconcile: override.reconcile === null ? null : { ...override.reconcile },
          },
        ]),
      ),
    ]),
  );
}
