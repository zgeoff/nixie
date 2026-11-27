import { expect, onTestFinished, test } from 'bun:test';
import { defaultAPISettings, readSessions } from '@heynixie/api';
import { buildTestClient, createDeviceSession } from '@heynixie/api/test-utils';
import { waitFor } from '@zgeoff/testing';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { readDeviceByIdentity } from '../device/read-device-by-identity';
import { startTestDevicesAPI } from '../test-utils/start-test-devices-api';
import type { Device } from '../types';
import { streamLiveDevice } from './stream-live-device';

interface EnrolledPanel {
  readonly token: string;
  readonly device: Device;
}

async function setupTest() {
  const api = await startTestDevicesAPI({ ...defaultAPISettings, lastSeenIntervalMs: 50 });
  const owner = await createDeviceSession(api.context, 'laptop');

  const ownerClient = buildTestClient(api.url, owner.token);

  return {
    ...api,
    enrolPanel: async (name: string) => {
      const issued = await ownerClient.sessions.issueCode({
        clientActionID: crypto.randomUUID(),
        scope: 'device',
      });

      const enrolled = await buildTestClient(api.url).sessions.enrol({
        clientActionID: crypto.randomUUID(),
        code: issued.code,
        deviceName: name,
        tokenDelivery: 'bearer',
      });

      const device = await readDeviceByIdentity(api.writer.db, enrolled.sessionID);

      invariant(enrolled.token !== undefined, 'a bearer enrolment returns its token');
      invariant(device, 'the enrolled panel has its device row');

      return { sessionID: enrolled.sessionID, token: enrolled.token, device };
    },
    follow: (panel: EnrolledPanel, signal?: AbortSignal) =>
      streamLiveDevice(api.streams, api.context, {
        device: panel.device,
        token: panel.token,
        isKeptActive: true,
        pixels: { width: 800, height: 600, pixelRatio: 1 },
        signal,
      }),
    readLastUsedMs: async (sessionID: string) => {
      const sessions = await readSessions(api.context, null);

      return sessions.find((session) => session.sessionID === sessionID)?.lastUsedAt.getTime();
    },
  };
}

test.each([
  {
    when: 'once it opened',
    stop: async (events: AsyncGenerator, stopping: AbortController) => {
      await events.next();

      stopping.abort();
    },
  },
  {
    when: 'before it opened',
    stop: async (events: AsyncGenerator, stopping: AbortController) => {
      stopping.abort();

      await events.next();
    },
  },
])(
  'it stops keeping a device session fresh when its stream stops $when, though nothing reads the stream again',
  async (row) => {
    const ctx = await setupTest();
    const stopped = await ctx.enrolPanel('hall panel');
    const open = await ctx.enrolPanel('desk panel');

    const stopping = new AbortController();

    const stoppedEvents = ctx.follow(stopped, stopping.signal);
    const openEvents = ctx.follow(open);

    onTestFinished(() => openEvents.return(undefined));

    onTestFinished(() => {
      stopping.abort();
    });

    await openEvents.next();

    const before = await ctx.readLastUsedMs(stopped.sessionID);

    await row.stop(stoppedEvents, stopping);

    // each refresh of the open stream's session marks one more interval in which a stream that
    // still kept its session fresh would have refreshed it too
    const waitForOpenRefresh = async () => {
      ctx.clock.advance(ctx.context.settings.lastSeenIntervalMs);

      const nowMs = ctx.clock.now();

      await waitFor(async () => {
        const lastUsedMs = await ctx.readLastUsedMs(open.sessionID);

        expect(lastUsedMs).toBe(nowMs);
      });
    };

    await waitForOpenRefresh();
    await waitForOpenRefresh();
    await waitForOpenRefresh();

    const after = await ctx.readLastUsedMs(stopped.sessionID);

    expect(after).toBe(before);
  },
);

test('it logs a refresh of the device session that fails, with the ID of the device', async () => {
  const ctx = await setupTest();
  const panel = await ctx.enrolPanel('hall panel');

  const events = ctx.follow(panel);

  onTestFinished(() => events.return(undefined));

  await events.next();
  await ctx.writer.stop();

  const failed = await waitFor(() => {
    const lines = ctx.logged
      .map((line) => z.object({ event: z.string(), fields: z.unknown() }).parse(JSON.parse(line)))
      .filter((line) => line.event === 'live.keep_active_failed');

    expect(lines).not.toBeArrayOfSize(0);

    return lines;
  });

  expect(failed[0]).toMatchObject({ fields: { deviceID: panel.device.deviceID } });
});
