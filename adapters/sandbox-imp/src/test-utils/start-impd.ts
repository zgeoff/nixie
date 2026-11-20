import { onTestFinished } from 'bun:test';
import { nativeWebSocket } from '@heynixie/testing';
import type { RecordedCall, TestImpd, TestImpdOptions } from '@impz/testing';
import { startTestImpd } from '@impz/testing';
import { registerSharedImpdStop } from '../mocks/stop-shared-impd';

// The mock server's preload wraps WebSocket, and the wrapper refuses the close code that impd's
// fault proxy sends upstream. The proxy opens its sockets from the global class, so Bun's own class
// stays in place until the test finishes.
export function startImpd(options: TestImpdOptions = {}): Promise<TestImpd> {
  const wrapped = globalThis.WebSocket;

  Object.assign(globalThis, { WebSocket: nativeWebSocket });

  onTestFinished(() => {
    Object.assign(globalThis, { WebSocket: wrapped });
  });

  return startTestImpd(options);
}

export interface SharedImpdTest {
  readonly impd: TestImpd;

  // the oRPC calls that impd has answered since this test started
  readonly readCalls: () => readonly RecordedCall[];

  // the input of each call to the procedure since this test started
  readonly readInputs: (procedure: string) => Record<string, unknown>[];
}

const sharedImpds = new Map<string, Promise<TestImpd>>();

// One impd per distinct set of options serves every test of a file, which the test preload stops
// when the file ends. Each test takes a clean impd: no fault, no imp and no secret from an earlier
// test. An image stays, so `seedImageOnce` adds each name once.
export async function startSharedImpd(options: TestImpdOptions = {}): Promise<SharedImpdTest> {
  const key = JSON.stringify(options);
  const started = sharedImpds.get(key) ?? startSharedImpdOnce(options);

  sharedImpds.set(key, started);

  const impd = await started;

  impd.clearFaults();

  await removeLeftovers(impd);

  const offset = impd.calls.length;
  const readCalls = (): readonly RecordedCall[] => impd.calls.slice(offset);

  return {
    impd,
    readCalls,
    readInputs: (procedure) =>
      readCalls()
        .filter((call) => call.procedure === procedure)
        .map((call) => (isRecord(call.input) ? call.input : {})),
  };
}

async function startSharedImpdOnce(options: TestImpdOptions): Promise<TestImpd> {
  const wrapped = globalThis.WebSocket;

  Object.assign(globalThis, { WebSocket: nativeWebSocket });

  const impd = await startTestImpd(options);

  registerSharedImpdStop(async () => {
    sharedImpds.clear();

    await impd.stop();

    Object.assign(globalThis, { WebSocket: wrapped });
  });

  return impd;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function removeLeftovers(impd: TestImpd): Promise<void> {
  const imps = await impd.client.imps.list();

  await Promise.all(imps.map((imp) => impd.client.imps.destroy({ name: imp.name })));

  const secrets = await impd.client.secrets.list();

  await Promise.all(secrets.map((secret) => impd.client.secrets.delete({ name: secret.name })));
}

const seededImages = new WeakMap<Pick<TestImpd, 'seedImage'>, Map<string, Promise<void>>>();

export function seedImageOnce(impd: Pick<TestImpd, 'seedImage'>, name: string): Promise<void> {
  const seeded = seededImages.get(impd) ?? new Map<string, Promise<void>>();

  seededImages.set(impd, seeded);

  const held = seeded.get(name) ?? impd.seedImage(name);

  seeded.set(name, held);

  return held;
}
