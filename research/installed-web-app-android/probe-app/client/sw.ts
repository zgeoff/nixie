// The service worker's entry: the browser's scope and a client that calls the probe's own origin.
import { buildProbeClient } from './build-probe-client.ts';
import { registerWorker, type WorkerScope } from './register-worker.ts';

declare const self: WorkerScope & { location: { origin: string } };

registerWorker(self, buildProbeClient({ origin: self.location.origin }));
