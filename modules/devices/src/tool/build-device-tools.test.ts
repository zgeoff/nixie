import { expect, test } from 'bun:test';
import { buildToolRegistry } from '@heynixie/tools';
import { startTestDevices } from '../test-utils';
import { buildDeviceTools } from './build-device-tools';

async function setupTest() {
  const ctx = await startTestDevices();

  const registry = buildToolRegistry(
    buildDeviceTools({
      log: ctx.log,
      definitions: ctx.definitions,
      clock: ctx.clock,
      streams: ctx.streams,
      readCallSession: ctx.readCallSession,
    }),
  );

  return {
    ...ctx,
    isValid: (tool: string, input: unknown) =>
      registry.findTool(tool)?.parseInput(input).isValid ?? null,
  };
}

test('it registers the device tools', async () => {
  const ctx = await setupTest();

  expect(ctx.isValid('device.layout', { device: 'dk4m7q2w9x', clear: true })).toBeTrue();
});

test('it lets a layout with an overlap and a bad name reach the tool, which refuses it', async () => {
  const ctx = await setupTest();

  expect(
    ctx.isValid('device.layout', {
      device: 'dk4m7q2w9x',
      columns: ['0fr'],
      rows: ['1fr'],
      regions: [
        { name: 'Pond!', column: 1, row: 1 },
        { name: 'note', column: 1, row: 1 },
      ],
    }),
  ).toBeTrue();
});

test('it lets a page with packages reach the region tool, which refuses it by name', async () => {
  const ctx = await setupTest();

  expect(
    ctx.isValid('device.region', {
      device: 'dk4m7q2w9x',
      region: 'pond',
      content: { kind: 'html', html: '<p>ripples</p>', packages: ['chart.js@4.4.6'] },
    }),
  ).toBeTrue();
});

test.each([
  { title: 'a clock', content: { kind: 'live', live: 'clock', format: 'HH:mm:ss' } },
  {
    title: 'a countdown',
    content: { kind: 'live', live: 'countdown', to: '2026-12-24T18:00:00Z', label: 'Eve' },
  },
  { title: 'an image', content: { kind: 'image', image: 'k3x9m2p7qa', fit: 'fill' } },
])('it takes $title as the content of a region', async (row) => {
  const ctx = await setupTest();

  expect(
    ctx.isValid('device.region', {
      device: 'dk4m7q2w9x',
      region: 'pond',
      content: row.content,
      minutes: 30,
      // oxlint-disable-next-line unicorn/no-thenable -- the tool's input is named then
      then: 'previous',
    }),
  ).toBeTrue();
});

test('it refuses minutes below 1 for a region', async () => {
  const ctx = await setupTest();

  expect(
    ctx.isValid('device.region', {
      device: 'dk4m7q2w9x',
      region: 'pond',
      content: { kind: 'markdown', markdown: 'a' },
      minutes: 0,
    }),
  ).toBeFalse();
});
