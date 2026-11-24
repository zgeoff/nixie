import { expect, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { startTestDevices } from '../test-utils';
import { startWaitingShows } from './start-waiting-shows';

async function setupTest() {
  const devices = await startTestDevices();

  const stop = startWaitingShows({
    log: devices.log,
    definitions: devices.definitions,
    clock: devices.clock,
    streams: devices.streams,
    onFailure: (error) => {
      throw error;
    },
  });

  return {
    ...devices,
    stop,
    readShowing: async () => {
      const listed = await devices.call('devices.list', {});

      return listed.status === 'ok' ? listed.result : null;
    },
  };
}

test('it counts the minutes of a show from the time its device comes online', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice({ name: 'desk panel' });

  await ctx.call('device.show', {
    device: device.deviceID,
    content: { kind: 'markdown', text: '# Saturday' },
    minutes: 10,
  });

  ctx.clock.advance(2 * 60 * 60_000);
  ctx.streams.open(device.deviceID, { width: 800, height: 600, pixelRatio: 1 });

  await waitForCondition(async () => {
    const listed = await ctx.readShowing();

    return JSON.stringify(listed).includes('2026-11-21T10:10:00.000Z');
  });

  const showing = await ctx.readShowing();

  expect(showing).toMatchObject({
    devices: [{ showing: { kind: 'markdown', until: '2026-11-21T10:10:00.000Z' } }],
  });
});
