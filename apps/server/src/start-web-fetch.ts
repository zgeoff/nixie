import { join } from 'node:path';
import type { WebFetchConfig } from '@heynixie/connectors';
import { buildWebFetchTool, startFetchSandbox, webFetchDefaults } from '@heynixie/connectors';
import type { Log } from '@heynixie/log';
import type { SandboxAdapter } from '@heynixie/sandbox';
import { isTestSandbox } from '@heynixie/sandbox';
import type { ToolDefinition } from '@heynixie/tools';

export interface WebFetchOptions {
  readonly adapter: SandboxAdapter;

  readonly image: string;
  readonly argv?: readonly string[];

  readonly deniedRanges: readonly string[];
  readonly config?: WebFetchConfig;

  // the log whose writer holds the link store
  readonly log: Pick<Log, 'writer'>;
}

export interface WebFetch {
  readonly tool: ToolDefinition;
  readonly stop: () => Promise<void>;
}

export const fetchImageArgv: readonly string[] = ['/usr/local/bin/bun', '/app/fetch.js'];

const testFetchArgv: readonly string[] = [
  process.execPath,
  join(import.meta.dir, '../../../guests/fetch/src/main.ts'),
];

export function startWebFetch(options: WebFetchOptions): WebFetch {
  const config = options.config ?? webFetchDefaults;

  const fetchSandbox = startFetchSandbox({
    adapter: options.adapter,
    image: options.image,
    argv: options.argv ?? (isTestSandbox(options.adapter) ? testFetchArgv : fetchImageArgv),
    deniedRanges: options.deniedRanges,
    ...config,
  });

  return {
    tool: buildWebFetchTool(fetchSandbox.readPage, {
      log: options.log,
      textBytes: config.limits.textBytes,
    }),
    stop: fetchSandbox.stop,
  };
}
