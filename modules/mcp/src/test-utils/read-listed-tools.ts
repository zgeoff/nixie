import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBuiltInBudgets } from '@heynixie/budgets';
import { readStarterDecisionPoint } from '@heynixie/policy/test-utils';
import { buildToolRegistry, findToolDeclaration, startToolEndpoint } from '@heynixie/tools';
import { buildStubActionQueue, withTestToolClient } from '@heynixie/tools/test-utils';
import type { StandInMcp } from './start-stand-in-mcp';

export interface ListedTool {
  readonly name: string;
  readonly description: string;
}

// The tools that a run naming `tools` reads from the tool endpoint over MCP, as the model's CLI
// reads them: one tools/list through the real endpoint, over the proxy's source.
export async function readListedTools(
  standIn: StandInMcp,
  tools: readonly string[],
): Promise<readonly ListedTool[]> {
  const socketDir = await mkdtemp(join(tmpdir(), 'nixie-mcp-endpoint-'));

  onTestFinished(() => rm(socketDir, { recursive: true, force: true }));

  const registry = buildToolRegistry([], [standIn.mcp.tools]);
  const queue = buildStubActionQueue();

  const endpoint = await startToolEndpoint({
    logger: () => {},
    socketDir,
    registry,
    decide: readStarterDecisionPoint((name) => findToolDeclaration(registry, name)),
    log: standIn.test.log,
    definitions: standIn.test.context.definitions,
    queue: queue.queue,
    budgets: {
      log: standIn.test.log,
      clock: standIn.test.clock,
      zone: 'UTC',
      definitions: standIn.test.context.definitions,
      builtIn: () => buildBuiltInBudgets([]),
    },
  });

  onTestFinished(() => endpoint.stop());

  const run = await endpoint.startRun({
    toolUseMetaKey: null,
    runID: crypto.randomUUID(),
    thread: 'thread-1',
    logThread: 'thread-1',
    tools: [...tools],
    model: { model: 'model-1', profile: 'profile-1' },
  });

  const listed = await withTestToolClient(
    { target: { path: run.socketPath }, token: run.token },
    (client) => client.listTools(),
  );

  return listed.tools.map((tool) => ({ name: tool.name, description: tool.description ?? '' }));
}
