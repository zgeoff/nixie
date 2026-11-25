// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { match } from 'ts-pattern';
import type { APIContext } from '../types';
import { hostImplementer } from './host-implementer';

// The host writes the allow proposal of a tool that waits for one, as `nixie mcp allow` does after a
// proposal was declined or lapsed.
export function createHostMcpProcedures(context: APIContext) {
  const mcp = hostImplementer.mcp;

  return {
    allow: mcp.allow.handler(async (options) => {
      const port = context.readMcp?.() ?? null;

      if (port === null) {
        throw options.errors.MCP_NOT_STARTED();
      }

      const result = await port.allow(options.input.tool);

      return match(result)
        .with({ status: 'proposed' }, (proposed) => ({
          status: 'proposed' as const,
          tool: proposed.tool,
          proposalID: proposed.proposalID,
        }))
        .with({ status: 'unknown_tool' }, () => {
          throw options.errors.TOOL_NOT_FOUND();
        })
        .with({ status: 'nothing_to_allow' }, (nothing) => ({
          status: 'nothing_to_allow' as const,
          tool: options.input.tool,
          reason: nothing.reason,
        }))
        .exhaustive();
    }),
  };
}
