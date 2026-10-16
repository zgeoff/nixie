import type { SandboxAdapter } from '@heynixie/sandbox';
import type { ToolDefinition, ToolEndpoint } from '@heynixie/tools';
import type { Actions } from './build-actions';
import type { WebFetch } from './start-web-fetch';

// The sandbox adapter, the web fetch tool on its fetch sandbox, the conversation's tool
// definitions, the endpoint that serves them, and the action queue.
export interface Tools {
  readonly adapter: SandboxAdapter;
  readonly endpoint: ToolEndpoint;
  readonly webFetch: WebFetch;

  // the web fetch tool, the time tool, the log reader and the memory tools
  readonly definitions: readonly ToolDefinition[];
  readonly actions: Actions;
}
