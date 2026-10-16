import { buildAPIGate } from './build-api-gate';
import { buildSeedInputs } from './build-seed-inputs';
import { buildServerContext } from './build-server-context';
import { buildServerReset } from './build-server-reset';
import { loadStartState } from './load-start-state';
import type { ServerPartValues } from './server-part-values';
import { startHostCommands } from './start-host-commands';
import { startHTTPServer } from './start-http-server';
import type { AnyPartDeclaration } from './types';

// The parts the server starts before it answers. The API reads the conversation's session cleanup
// and the memory store, and the host commands read the memory store, once each starts behind the
// health endpoint.
export const frontPartDeclarations: readonly AnyPartDeclaration<ServerPartValues>[] = [
  {
    name: 'state',
    needs: ['inputs'],
    start: (parts) => loadStartState(parts.get('inputs').options.writer),
  },
  {
    name: 'context',
    needs: ['inputs'],
    uses: ['session_cleanup'],
    start: (parts) => {
      const options = parts.get('inputs').options;

      return buildServerContext(options.writer, options.secrets.deploymentKey, () =>
        parts.find('session_cleanup'),
      );
    },
  },
  {
    name: 'api_gate',
    needs: [],
    start: () => Promise.resolve(buildAPIGate()),
  },
  {
    name: 'http',
    needs: ['inputs', 'state', 'context', 'tools', 'api_gate'],
    uses: ['memory'],
    start: async (parts) => {
      const options = parts.get('inputs').options;

      const port = await startHTTPServer({
        ...options,
        state: parts.get('state'),
        tools: parts.get('tools'),
        apiContext: parts.get('context').apiContext,
        gate: parts.get('api_gate'),
        readMemory: () => parts.find('memory'),
      });

      options.log('http.listening', { port });

      return port;
    },
  },
  {
    name: 'server_parts',
    needs: ['inputs', 'state', 'context', 'tools'],
    start: (parts) => {
      const inputs = parts.get('inputs');
      const context = parts.get('context');
      const tools = parts.get('tools');

      return Promise.resolve({
        ...inputs.options,
        ...buildSeedInputs(inputs.options.config, tools),
        state: parts.get('state'),
        context: context.apiContext,
        apiContext: context.apiContext,
        inForce: context.inForce,
        tools,
        cleanup: inputs.work,
        modelSecrets: inputs.options.secrets.models,
        onFailure: inputs.onFailure,
      });
    },
  },
  {
    name: 'reset',
    needs: ['inputs', 'context', 'tools', 'api_gate'],
    uses: ['ready'],
    start: (parts) => {
      const inputs = parts.get('inputs');

      return Promise.resolve(
        buildServerReset({
          context: parts.get('context').apiContext,
          adapter: parts.get('tools').adapter,
          work: inputs.work,
          closeAPI: parts.get('api_gate').close,
          readStart: async () => {
            await parts.waitFor('ready');
          },
          log: inputs.options.log,
          onFailure: inputs.onFailure,
        }),
      );
    },
  },
  {
    name: 'host_commands',
    needs: ['inputs', 'context', 'reset', 'api_gate'],
    uses: ['memory'],
    start: (parts) => {
      const options = parts.get('inputs').options;

      return startHostCommands(
        {
          dataDir: options.config.server.dataDir,
          apiContext: parts.get('context').apiContext,
          readMemory: () => parts.find('memory'),
          runReset: parts.get('reset').run,
          gate: parts.get('api_gate'),
        },
        options.cleanup,
      );
    },
  },
];
