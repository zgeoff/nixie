// One call as nixie would hold it: the device offers, the server creates the session with its key
// and attaches the sideband. The session always closes, and its billed seconds go to the ledger.
import { appendFile } from 'node:fs/promises';
import { attachSideband } from './attach-sideband.ts';
import type { Sideband } from './attach-sideband.ts';
import { createLiveSession } from './create-live-session.ts';
import { startDevice } from './start-device.ts';
import type { Device } from './start-device.ts';

export interface Call {
  device: Device;
  key: string;
  mark: (label: string, detail?: Record<string, unknown>) => void;
  sdpOffer: string;
  sessionID: string;
  sideband: Sideband;
  started: Record<string, unknown>;
}

const startTimeoutMs = 15_000;

export async function withCall(
  input: { key: string; label: string; session: Record<string, unknown> },
  body: (call: Call) => Promise<void>,
): Promise<void> {
  const device = await startDevice();
  const sdpOffer = await device.createOffer();
  const created = await createLiveSession({ key: input.key, sdpOffer, session: input.session });
  if (created.kind === 'refused') {
    await device.close();
    throw new Error(`create: ${created.status} ${created.body}`);
  }
  await device.applyAnswer(created.sdpAnswer);
  const sideband = await attachSideband(input.key, created.sessionID);
  const mark: Call['mark'] = (label, detail) =>
    sideband.log.push({ event: { type: 'probe.mark', label, ...detail }, receivedAtMs: Date.now() });
  try {
    const started = await sideband.waitFor((event) => event.type === 'session.started', startTimeoutMs);
    if (!started) {
      throw new Error('no session.started on the sideband');
    }
    await body({ device, key: input.key, mark, sdpOffer, sessionID: created.sessionID, sideband, started: started.event });
  } finally {
    const closed = await sideband.close();
    await writeCallLog(input.label, created.sessionID, sideband, device, closed);
    await device.close();
  }
}

async function writeCallLog(
  label: string,
  sessionID: string,
  sideband: Sideband,
  device: Device,
  closed: Record<string, unknown> | undefined,
): Promise<void> {
  const channel = await device.readChannelEvents();
  const playback = await device.readPlayback();
  const entries = [
    ...sideband.log.map((entry) => ({ connection: 'sideband', ...entry })),
    ...channel.map((entry) => ({ connection: 'device', receivedAtMs: entry.atMs, event: entry.event ?? entry })),
  ].toSorted((left, right) => left.receivedAtMs - right.receivedAtMs);
  const path = new URL(`./results/${label}.jsonl`, import.meta.url).pathname;
  await Bun.write(path, entries.map((entry) => JSON.stringify(entry)).join('\n'));
  await Bun.write(path.replace('.jsonl', '.playback.json'), JSON.stringify(playback));
  const usage = closed?.usage;
  await appendFile(
    new URL('./results/ledger.jsonl', import.meta.url).pathname,
    `${JSON.stringify({ label, sessionID, closedReason: closed?.reason ?? 'unconfirmed', usage })}\n`,
  );
}
