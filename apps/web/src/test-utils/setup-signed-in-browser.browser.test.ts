import { expect, onTestFinished, test } from 'bun:test';
import { checkBrowserSkip } from './check-browser-skip';
import { setupSignedInBrowser } from './setup-signed-in-browser';

// Bun 1.4.2's skipIf takes a boolean and has no in-body skip, so the suite checks the browser
// before its tests start.
const browserSkip = await checkBrowserSkip();

async function setupTest() {
  const cookies: (string | null)[] = [];

  const answerRequest = (request: Request) => {
    cookies.push(request.headers.get('cookie'));

    return new Response('<!doctype html><title>app</title>', {
      headers: { 'content-type': 'text/html' },
    });
  };

  const app = Bun.serve({
    fetch: answerRequest,
    hostname: '127.0.0.1',
    port: 0,
  });

  onTestFinished(async () => {
    await app.stop(true);
  });

  // Chrome's sandbox needs user namespaces that a container or a root user lacks.
  const view = new Bun.WebView({ backend: { argv: ['--no-sandbox'], type: 'chrome', url: false } });

  onTestFinished(() => {
    view.close();
  });

  // Bun runs one Chrome for the whole test process, and its views share one cookie jar.
  await view.navigate('about:blank');
  await view.cdp('Network.clearBrowserCookies');

  return { appURL: `http://127.0.0.1:${app.port}`, cookies, view };
}

test.skipIf(browserSkip.isSkipped)(
  'it opens the app with the session cookie on the first request',
  async () => {
    const ctx = await setupTest();

    await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: 'device-token-4417' });

    expect(ctx.cookies.at(0)).toBe('nixie_session=device-token-4417');
  },
);
