import { join } from 'node:path';
import type { WebFetchConfig } from '@heynixie/connectors';
import { buildWebFetchTool, startFetchSandbox, webFetchDefaults } from '@heynixie/connectors';
import { defaultSizeLimits } from '@heynixie/definitions';
import type { Log } from '@heynixie/log';
import type { SandboxAdapter } from '@heynixie/sandbox';
import { isTestSandbox } from '@heynixie/sandbox';
import type { ReadPage } from '@heynixie/skills';
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

  readonly readSkillPage: ReadPage;

  readonly stop: () => Promise<void>;
}

export const fetchImageArgv: readonly string[] = ['/usr/local/bin/bun', '/app/fetch.js'];

// A vendored skill's file may reach the definitions file limit, far past the web fetch's text limit.
const skillFetchBytes = defaultSizeLimits.maxFileBytes;

const testFetchArgv: readonly string[] = [
  process.execPath,
  join(import.meta.dir, '../../../guests/fetch/src/main.ts'),
];

export function startWebFetch(options: WebFetchOptions): WebFetch {
  const config = options.config ?? webFetchDefaults;

  const sandbox = {
    adapter: options.adapter,
    image: options.image,
    argv: options.argv ?? (isTestSandbox(options.adapter) ? testFetchArgv : fetchImageArgv),
    deniedRanges: options.deniedRanges,
    sandboxLimits: config.sandboxLimits,
  };

  const fetchSandbox = startFetchSandbox({ ...sandbox, limits: config.limits });

  const skillSandbox = startFetchSandbox({
    ...sandbox,
    limits: { ...config.limits, bodyBytes: skillFetchBytes, textBytes: skillFetchBytes },
  });

  return {
    tool: buildWebFetchTool(fetchSandbox.readPage, {
      log: options.log,
      textBytes: config.limits.textBytes,
    }),
    readSkillPage: skillSandbox.readPage,
    stop: async () => {
      await Promise.all([fetchSandbox.stop(), skillSandbox.stop()]);
    },
  };
}
