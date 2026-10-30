import type { LogEntry } from '../../src/contract.ts';
import { type ProbeClient, buildProbeClient } from '../build-probe-client.ts';
import { flushReceipts } from '../flush-receipts.ts';
import { type ProbeStore, openProbeStore } from '../open-probe-store.ts';
import { formatCallError } from './format-call-error.ts';
import { getElement } from './get-element.ts';
import { renderEntries } from './render-entries.ts';

export interface StartedPage {
  client: ProbeClient;
  store: ProbeStore;
  registration: ServiceWorkerRegistration;
  vapidPublicKey: string;
  // shows the log entries of these kinds and refreshes them every few seconds
  pollLog: (kinds: LogEntry['kind'][]) => void;
}

// Every page registers the service worker, shows its session, and sends any push receipt the
// service worker could not report.
export async function startPage(headers?: Record<string, string>): Promise<StartedPage> {
  const client = buildProbeClient({ origin: location.origin, ...(headers && { headers }) });
  const store = openProbeStore(indexedDB);

  await navigator.serviceWorker.register('/sw.js');

  const registration = await navigator.serviceWorker.ready;
  const config = await client.config();

  getElement('#session', HTMLElement).textContent =
    `Session: ${config.session ?? 'none: pair this phone on the home page'}`;
  void flushReceipts(client, store);

  return {
    client,
    store,
    registration,
    vapidPublicKey: config.vapidPublicKey,
    pollLog: (kinds) => {
      const list = getElement('#log', HTMLElement);
      const refresh = () =>
        client.log().then(
          (entries) => renderEntries(list, entries, kinds),
          (error: unknown) => renderEntries(list, `log refused: ${formatCallError(error)}`, kinds),
        );

      void refresh();
      setInterval(() => void refresh(), 3000);
    },
  };
}
