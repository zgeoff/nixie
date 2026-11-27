import { runPendingRecordForgets } from '@heynixie/api';
import { startMemory } from '../cli/start-memory';
import { buildProposalConfig } from '../deployment/build-proposal-config';
import { startErasureRunner } from '../erasure/start-erasure-runner';
import { startErasureWatch } from '../erasure/start-erasure-watch';
import { runTurnInputForget } from '../turn/run-turn-input-forget';
import { startTurnInputWork } from '../turn/start-turn-input-work';
import type { AnyPartDeclaration } from '../types';
import { makeRetriedStart } from './make-retried-start';
import type { ServerPartValues } from './server-part-values';
import { startChecker } from './start-checker';
import { startConnectionsPart } from './start-connections-part';
import { startGoogleToolsPart } from './start-google-tools-part';
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
    needs: ['server_parts', 'conversation_imp', 'sandbox_runner'],
    uses: ['memory'],
    start: (reader) => Promise.resolve(startErasureRunner(reader.get('server_parts'), reader)),
  },
  {
    // The Gmail tools, on late-bound ports for the connections and the fetch sandbox.
    name: 'google_tools',
    feature: 'google',
    needs: ['inputs'],
    start: (reader) => Promise.resolve(startGoogleToolsPart(reader.get('inputs'))),
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
    start: makeRetriedStart('connections', (parts, reader) =>
      startConnectionsPart(
        parts,
        reader.get('erasure'),
        reader.get('google_tools'),
        reader.get('held_credentials'),
      ),
    ),
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
    needs: ['server_parts', 'conversation_imp', 'sandbox_runner', 'checker', 'erasure'],
    start: makeRetriedStart('memory', (parts, reader) => {
      const conversation = reader.get('conversation_imp');
      const tasks = reader.get('sandbox_runner');

      return startMemory(
        parts,
        async (cause) => {
          await conversation.cleanupSessions(cause);
          await tasks.cleanupSessions(cause);

          await runTurnInputForget(parts, cause);
        },
        reader.get('checker').check,
        reader.get('erasure'),
      );
    }),
  },
  {
    name: 'notebook',
    needs: ['server_parts', 'memory', 'erasure'],
    start: makeRetriedStart('notebook', (parts, reader) =>
      startNotebookPart(parts, reader.get('memory'), reader.get('erasure')),
    ),
  },
  {
    name: 'session_cleanup',
    needs: ['server_parts', 'conversation_imp', 'sandbox_runner', 'memory'],
    start: (reader) => {
      const parts = reader.get('server_parts');
      const conversation = reader.get('conversation_imp');
      const tasks = reader.get('sandbox_runner');
      const memory = reader.get('memory');

      return Promise.resolve(async (cause) => {
        await conversation.cleanupSessions(cause);
        await tasks.cleanupSessions(cause);

        await runTurnInputForget(parts, cause);

        // The sessions rebuild first, so no turn still holds a value that a purge deletes.
        await memory.finishEvidencePurges({ recordSequence: cause.recordSequence });
      });
    },
  },
  {
    // A forget that a crash cut short finishes before any claim pool or turn-input work can reach
    // what it deletes.
    name: 'erasure_catch_up',
    needs: ['server_parts', 'session_cleanup', 'memory', 'notebook', 'erasure'],
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
    name: 'record_forgets',
    needs: ['server_parts', 'session_cleanup'],
    start: makeRetriedStart('record_forgets', (parts) => runPendingRecordForgets(parts.apiContext)),
  },
];
