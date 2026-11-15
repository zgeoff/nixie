import { buildGitHubDefinitionsRepo } from '@heynixie/definitions-repo-github';
import { buildKagiSearch } from '@heynixie/search-kagi';
import { startConversationEndpoint } from '../conversation/start-conversation-endpoint';
import { refreshDefinitions } from '../definition/refresh-definitions';
import { buildActions } from '../test/build-actions';
import type { AnyPartDeclaration } from '../types';
import { buildTestSendTool } from '../utils/build-test-send-tool';
import type { ServerPartValues } from './server-part-values';
import { startCodeRunPart } from './start-code-run-part';
import { startSandboxAdapterPart } from './start-sandbox-adapter-part';
import { startWebFetchPart } from './start-web-fetch-part';

export const toolPartDeclarations: readonly AnyPartDeclaration<ServerPartValues>[] = [
  {
    name: 'sandbox_adapter',
    needs: ['inputs', 'context'],
    uses: ['tool_endpoint'],
    start: (parts) => {
      const options = parts.get('inputs').options;
      const apiContext = parts.get('context').apiContext;

      return Promise.resolve(
        startSandboxAdapterPart({
          ...(options.createSandboxAdapter === undefined
            ? {}
            : { createSandboxAdapter: options.createSandboxAdapter }),
          sandbox: options.sandbox,
          dataDir: options.config.server.dataDir,
          log: options.log,
          recorder: { log: apiContext.log, definitions: apiContext.definitions },
          toolTarget: (sandbox) => parts.get('tool_endpoint').endpoint.getToolTarget(sandbox),
        }),
      );
    },
  },
  {
    name: 'web_fetch',
    needs: ['inputs', 'context', 'sandbox_adapter'],
    images: () => ['fetch'],
    start: (parts) =>
      startWebFetchPart({
        options: parts.get('inputs').options,
        adapter: parts.get('sandbox_adapter'),
        log: parts.get('context').apiContext.log,
      }),
  },
  {
    name: 'code_run',
    needs: ['inputs', 'context', 'sandbox_adapter'],
    images: () => ['code'],
    start: (parts) =>
      startCodeRunPart({
        options: parts.get('inputs').options,
        adapter: parts.get('sandbox_adapter'),
        log: parts.get('context').apiContext.log,
        readInForce: () => parts.get('context').inForce.read(),
      }),
  },
  {
    name: 'actions',
    needs: ['inputs', 'context'],
    start: (parts) =>
      Promise.resolve(
        buildActions(parts.get('context').apiContext, {
          log: parts.get('inputs').options.log,
          testProviderURL: NIXIE_TEST_BUILD
            ? (parts.get('inputs').options.harness?.providerURL ?? null)
            : null,
        }),
      ),
  },
  {
    name: 'tool_endpoint',
    needs: ['inputs', 'context', 'web_fetch', 'code_run', 'actions', 'decisions'],
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
          codeRun: parts.get('code_run').tool,
          search:
            options.search === null
              ? null
              : {
                  provider: buildKagiSearch({
                    apiKey: options.search.apiKey,
                    apiURL: options.search.apiURL,
                  }),
                  dailyCallCap: options.search.dailyCallCap,
                },
          testTools: NIXIE_TEST_BUILD && options.harness !== undefined ? [buildTestSendTool()] : [],
          queue: parts.get('actions').queue,
          makeDecide: parts.get('decisions'),
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
          isPromptExported: definitionsExport !== null,
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
