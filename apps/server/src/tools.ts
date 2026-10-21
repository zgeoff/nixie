import type { SandboxAdapter } from '@heynixie/sandbox';
import type { ToolDefinition, ToolEndpoint } from '@heynixie/tools';
import type { Actions } from './build-actions';
import type { WebFetch } from './start-web-fetch';

export interface Tools {
  readonly adapter: SandboxAdapter;
  readonly endpoint: ToolEndpoint;
  readonly webFetch: WebFetch;

  readonly definitions: readonly ToolDefinition[];
  readonly actions: Actions;
}
