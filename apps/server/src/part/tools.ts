import type { SandboxAdapter } from '@heynixie/sandbox';
import type { TaskStartBounds } from '@heynixie/tasks';
import type { ToolDefinition, ToolEndpoint } from '@heynixie/tools';
import type { ActionsWithForget } from '../forget/add-log-forget';
import type { WebFetch } from './start-web-fetch';

export interface Tools {
  readonly adapter: SandboxAdapter;
  readonly endpoint: ToolEndpoint;
  readonly webFetch: WebFetch;

  readonly definitions: readonly ToolDefinition[];

  // the bounds of the conversation's task.start, which a task definition meets too
  readonly taskBounds: TaskStartBounds;
  readonly actions: ActionsWithForget;
}
