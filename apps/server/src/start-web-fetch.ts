import { join } from 'node:path';
import type { WebFetchConfig } from '@heynixie/connectors';
import { buildWebFetchTool, startFetchSandbox, webFetchDefaults } from '@heynixie/connectors';
import type { SandboxAdapter } from '@heynixie/sandbox';
import type { ToolDefinition } from '@heynixie/tools';
import { isTestSandbox } from './is-test-sandbox';

export interface WebFetchOptions {
  readonly adapter: SandboxAdapter;

  // the fetch image, and the fetcher's command, the image's own unless the caller names another
  readonly image: string;
  readonly argv?: readonly string[];

  // every range the deployment lists as internal: the host's addresses and the ranges it forwards
  readonly deniedRanges: readonly string[];
  readonly config?: WebFetchConfig;
}

export interface WebFetch {
  readonly tool: ToolDefinition;
  readonly stop: () => Promise<void>;
}

// the fetcher's command in the fetch image that guests/fetch/Dockerfile builds
export const fetchImageArgv: readonly string[] = ['/usr/local/bin/bun', '/app/fetch.js'];

// the test sandbox runs the fetcher's source from the workspace with nixie's own Bun
const testFetchArgv: readonly string[] = [
  process.execPath,
  join(import.meta.dir, '../../../guests/fetch/src/main.ts'),
];

// Starts the web fetch tool on its fetch sandbox, with the tuning defaults unless config names
// others.
export function startWebFetch(options: WebFetchOptions): WebFetch {
  const config = options.config ?? webFetchDefaults;

  const fetchSandbox = startFetchSandbox({
    adapter: options.adapter,
    image: options.image,
    argv: options.argv ?? (isTestSandbox(options.adapter) ? testFetchArgv : fetchImageArgv),
    deniedRanges: options.deniedRanges,
    ...config,
  });

  return { tool: buildWebFetchTool(fetchSandbox.readPage), stop: fetchSandbox.stop };
}
