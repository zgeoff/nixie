import { onTestFinished } from 'bun:test';
import { startSpawnedNixie } from '@heynixie/server/test-utils';
import { createBrowserView, startBuiltWeb, startFrontProxy } from '@heynixie/web/test-utils';
import { startAPIRelay } from './start-api-relay';

type SpawnedNixie = Awaited<ReturnType<typeof startSpawnedNixie>>;

type SpawnedNixieProcess = ReturnType<SpawnedNixie['harness']['start']>;

export interface WebJourney {
  readonly nixie: SpawnedNixie;

  readonly server: SpawnedNixieProcess;

  readonly enrolmentCode: string;

  readonly appURL: string;

  readonly view: Bun.WebView;

  readonly startServer: () => Promise<SpawnedNixieProcess>;
}

export async function startWebJourney(): Promise<WebJourney> {
  const nixie = await startSpawnedNixie();

  const relay = startAPIRelay();

  const startServer = async () => {
    const server = nixie.harness.start();

    const [listening] = await Promise.all([server.waitForLogEvent('http.listening'), server.ready]);

    relay.retarget(`http://127.0.0.1:${String(listening['port'])}`);

    return server;
  };

  const server = await startServer();
  const issued = await server.waitForLogEvent('enrolment_code.issued');
  const web = await startBuiltWeb(relay.url);

  const app = startFrontProxy({ apiURL: relay.url, webURL: web.url });
  const view = createBrowserView();

  onTestFinished(() => {
    view.close();
  });

  // Bun runs one Chrome for the whole test process, and its views share one cookie jar
  await view.navigate('about:blank');
  await view.cdp('Network.clearBrowserCookies');

  return {
    nixie,
    server,
    enrolmentCode: String(issued['code']),
    appURL: app.url,
    view,
    startServer,
  };
}
