import { join } from 'node:path';
import { z } from 'zod';

type Env = Readonly<Record<string, string | undefined>>;

export interface BrowserBuild {
  readonly webDir: string;
  readonly webServerPath: string;
  readonly normalizeImagePath: string;
}

// rig's browser lane runs `build:browser` into its build folder before the suites start, and
// write-browser-build.ts lays the folder out as these paths.
export function readBrowserBuild(env: Env = process.env): BrowserBuild {
  const buildDir = z
    .string({
      error: 'a browser suite runs in `bun run test:browser`, which sets RIG_BROWSER_BUILD_DIR',
    })
    .min(1)
    .parse(env['RIG_BROWSER_BUILD_DIR']);

  const webDir = join(buildDir, 'web');

  return {
    webDir,
    webServerPath: join(webDir, 'server', 'server.js'),
    normalizeImagePath: join(buildDir, 'normalize-image.js'),
  };
}
