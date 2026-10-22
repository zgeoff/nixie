import { join } from 'node:path';
import { buildGitHubDefinitionsRepo } from '@heynixie/definitions-github';
import { buildSandboxRecorder } from '@heynixie/sandbox';
import { buildActions } from './build-actions';
import { createSandboxAdapter } from './create-sandbox-adapter';
import { refreshDefinitions } from './refresh-definitions';
import type { ServerPartValues } from './server-part-values';
import { startConversationEndpoint } from './start-conversation-endpoint';
import { startWebFetch } from './start-web-fetch';
import type { AnyPartDeclaration } from './types';

export const toolPartDeclarations: readonly AnyPartDeclaration<ServerPartValues>[] = [
  {
    name: 'sandbox_adapter',
    needs: ['inputs', 'context'],
    uses: ['tool_endpoint'],
    start: (parts) => {
      const options = parts.get('inputs').options;
      const apiContext = parts.get('context').apiContext;

      return Promise.resolve(
        createSandboxAdapter({
          recorder: buildSandboxRecorder({
            log: apiContext.log,
            definitions: apiContext.definitions,
          }),
          toolTarget: (sandbox) => parts.get('tool_endpoint').endpoint.getToolTarget(sandbox),
          sandbox: options.sandbox,
          testRootDir: join(options.config.server.dataDir, 'sandboxes'),
          hostEnv: process.env,
        }),
      );
    },
  },
  {
    name: 'web_fetch',
    needs: ['inputs', 'context', 'sandbox_adapter'],
    start: async (parts) => {
      const options = parts.get('inputs').options;
      const sandbox = options.sandbox;
      const publicEgress = sandbox.adapter === 'imp' ? sandbox.imp.publicEgress : null;

      const webFetch = startWebFetch({
        adapter: parts.get('sandbox_adapter'),
        image: options.images.fetch.name,
        deniedRanges: [...(publicEgress?.hostAddresses ?? []), ...(publicEgress?.egressDeny ?? [])],
        config: options.config.web_fetch,
        log: parts.get('context').apiContext.log,
      });

      await options.cleanup.defer(() => webFetch.stop());

      return webFetch;
    },
  },
  {
    name: 'actions',
    needs: ['inputs', 'context'],
    start: (parts) =>
      Promise.resolve(
        buildActions(parts.get('context').apiContext, parts.get('inputs').options.log),
      ),
  },
  {
    name: 'tool_endpoint',
    needs: ['inputs', 'context', 'web_fetch', 'actions'],
    uses: ['memory', 'server_parts', 'checker'],
    start: (parts) => {
      const options = parts.get('inputs').options;
      const inForce = parts.get('context').inForce;
      const definitionsExport = options.definitionsExport;

      return startConversationEndpoint(
        {
          config: options.config,
          context: parts.get('context').apiContext,
          cleanup: options.cleanup,
        },
        {
          webFetch: parts.get('web_fetch').tool,
          queue: parts.get('actions').queue,
          readStore: () => parts.find('memory'),
          readInForce: () => inForce.read(),
          refreshDefinitions: () => refreshDefinitions(parts.find('server_parts'), inForce),
          vendor:
            definitionsExport === null
              ? null
              : {
                  readPage: parts.get('web_fetch').readSkillPage,
                  repo: buildGitHubDefinitionsRepo(definitionsExport.repo),
                  readReviewer: () => parts.find('checker')?.check ?? null,
                },
        },
      );
    },
  },
  {
    name: 'tools',
    needs: ['sandbox_adapter', 'web_fetch', 'actions', 'tool_endpoint'],
    start: (parts) =>
      Promise.resolve({
        adapter: parts.get('sandbox_adapter'),
        endpoint: parts.get('tool_endpoint').endpoint,
        webFetch: parts.get('web_fetch'),
        definitions: parts.get('tool_endpoint').definitions,
        actions: parts.get('actions'),
      }),
  },
];
