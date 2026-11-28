import { startMemory } from '../cli/start-memory';
import { buildProposalConfig } from '../deployment/build-proposal-config';
import { startErasureRunner } from '../erasure/start-erasure-runner';
import { startErasureWatch } from '../erasure/start-erasure-watch';
import { startExpirySweep } from '../erasure/start-expiry-sweep';
import { runInForceSeedAndWake } from '../seed/run-in-force-seed-and-wake';
import { startTurnInputWork } from '../turn/start-turn-input-work';
import type { AnyPartDeclaration } from '../types';
import { buildSeedingConnections } from './build-seeding-connections';
import { makeRetriedStart } from './make-retried-start';
import type { ServerPartValues } from './server-part-values';
import { startChecker } from './start-checker';
import { startConnectionsPart } from './start-connections-part';
import { startHeldCredentialsPart } from './start-held-credentials-part';
import { startMcpPart } from './start-mcp-part';
import { startNotebookPart } from './start-notebook-part';

export const memoryPartDeclarations: readonly AnyPartDeclaration<ServerPartValues>[] = [
  {
    name: 'checker',
    needs: ['server_parts', 'conversation_imp'],
    start: makeRetriedStart('checker', (parts) => startChecker(parts)),
  },
  {
    name: 'erasure',
    needs: ['server_parts', 'conversation_imp', 'sandbox_runner', 'api_gate'],
    uses: ['memory', 'phone'],
    start: async (reader) => {
      const parts = reader.get('server_parts');
      const runner = startErasureRunner(parts, reader);
      const phone = reader.find('phone');

      if (phone !== null && phone !== undefined) {
        await parts.cleanup.defer(() => phone.forgetter.stop());
      }

      return runner;
    },
  },
  {
    // The credential store's database backend, which the connections and the MCP proxy keep their
    // credentials in.
    name: 'held_credentials',
    needs: ['server_parts'],
    start: makeRetriedStart('held_credentials', (parts) => startHeldCredentialsPart(parts)),
  },
  {
    // The Google connections, and the connection's forget on the runner.
    name: 'connections',
    feature: 'google',
    needs: ['inputs', 'server_parts', 'erasure', 'google_tools', 'held_credentials'],
    uses: ['definitions_exports'],
    start: makeRetriedStart('connections', async (parts, reader) => {
      const connections = await startConnectionsPart(
        parts,
        reader.get('erasure'),
        reader.get('google_tools'),
        reader.get('held_credentials'),
      );

      return buildSeedingConnections(connections, () =>
        runInForceSeedAndWake(parts, reader.find('definitions_exports')),
      );
    }),
  },
  {
    // The MCP proxy: the servers of the config, their sign-ins and the tools their pins allow.
    name: 'mcp',
    needs: ['inputs', 'server_parts', 'held_credentials'],
    uses: ['tools'],
    start: makeRetriedStart('mcp', (parts, reader) =>
      startMcpPart(
        parts,
        reader.get('inputs').options.config.mcp,
        reader,
        buildProposalConfig(reader.get('inputs').options.config),
      ),
    ),
  },
  {
    name: 'memory',
    needs: ['server_parts', 'checker', 'erasure'],
    start: makeRetriedStart('memory', (parts, reader) =>
      startMemory(parts, reader.get('checker').check, reader.get('erasure')),
    ),
  },
  {
    name: 'notebook',
    needs: ['server_parts', 'memory', 'erasure'],
    start: makeRetriedStart('notebook', (parts, reader) =>
      startNotebookPart(parts, reader.get('memory'), reader.get('erasure')),
    ),
  },
  {
    // A forget that a crash cut short finishes before any claim pool or turn-input work can reach
    // what it deletes.
    name: 'erasure_catch_up',
    needs: ['server_parts', 'memory', 'notebook', 'erasure'],
    uses: ['connections'],
    start: makeRetriedStart('erasure_catch_up', (_parts, reader) =>
      reader.get('erasure').finishOpen(),
    ),
  },
  {
    // The turn-input repair and intake wait for the catch-up, so neither reaches what an open forget
    // deletes.
    name: 'turn_input_work',
    needs: ['inputs', 'turn_inputs', 'erasure_catch_up'],
    start: (reader) => startTurnInputWork(reader),
  },
  {
    name: 'erasure_watch',
    needs: ['server_parts', 'erasure', 'erasure_catch_up'],
    start: (reader) => startErasureWatch(reader.get('server_parts'), reader.get('erasure')),
  },
  {
    // An expiry waits for the catch-up, so it never begins beside a forget that a crash cut short.
    name: 'expiry_sweep',
    needs: ['server_parts', 'erasure', 'erasure_catch_up'],
    start: (reader) => startExpirySweep(reader.get('server_parts'), reader.get('erasure')),
  },
];
