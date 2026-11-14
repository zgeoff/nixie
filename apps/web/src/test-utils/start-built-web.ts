import { onTestFinished } from 'bun:test';
import { createBuiltWeb } from './create-built-web';
import { readBrowserBuild } from './read-browser-build';

// A browser suite runs on the client its lane built before the run; an e2e suite passes the build
// that its lane's template holds.
export async function startBuiltWeb(
  apiURL: string,
  serverPath: string = readBrowserBuild().webServerPath,
): Promise<{ url: string }> {
  const web = await createBuiltWeb(apiURL, serverPath);

  onTestFinished(web.stop);

  return { url: web.url };
}
