import { onTestFinished } from 'bun:test';
import { startBuiltWeb, startFrontProxy } from '@heynixie/web/test-utils';
import { startAPIRelay } from './start-api-relay';
import { startSpawnedNixie } from './start-spawned-nixie';

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

export interface WebJourneyOptions {
  // gives nixie calls, priced at this many dollars a minute, on the test build's fake speech layer
  readonly voicePricePerMinute?: number;

  // leaves the computer and the code tool's sections out of nixie's config
  readonly isComputerOff?: boolean;
  readonly isCodeOff?: boolean;
  readonly isGoogleOff?: boolean;
  readonly isDevicesOff?: boolean;

  // a script that every page runs first, such as a microphone stand-in
  readonly headScript?: string;
}

export async function startWebJourney(options: WebJourneyOptions = {}): Promise<WebJourney> {
  const nixieOptions = {
    ...(options.voicePricePerMinute === undefined
      ? {}
      : { voicePricePerMinute: options.voicePricePerMinute }),
    ...(options.isComputerOff === true ? { isComputerOff: true } : {}),
    ...(options.isCodeOff === true ? { isCodeOff: true } : {}),
    ...(options.isGoogleOff === true ? { isGoogleOff: true } : {}),
    ...(options.isDevicesOff === true ? { isDevicesOff: true } : {}),
  };

  const nixie = await startSpawnedNixie(nixieOptions);

  const relay = startAPIRelay();
  const target = { nixieURL: relay.url };

  const startServer = async () => {
    const server = nixie.harness.start();

    const [listening] = await Promise.all([server.waitForLogEvent('http.listening'), server.ready]);

    target.nixieURL = `http://127.0.0.1:${String(listening['port'])}`;

    relay.retarget(target.nixieURL);

    return server;
  };

  const server = await startServer();
  const issued = await server.waitForLogEvent('enrolment_code.issued');
  const web = await startBuiltWeb(relay.url);

  // the relay forwards requests only, so the front proxy bridges a WebSocket to nixie itself
  const app = startFrontProxy({
    apiURL: () => target.nixieURL,
    webURL: web.url,
    ...(options.headScript === undefined ? {} : { headScript: options.headScript }),
  });

  const view = new Bun.WebView({ backend: 'chrome' });

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
