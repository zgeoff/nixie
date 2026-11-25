import { expect, test } from 'bun:test';
import { startTestDevices } from '../test-utils';
import { readPageFrame } from './read-page-frame';
import { readPageImage } from './read-page-image';

async function setupTest() {
  const ctx = await startTestDevices();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  const issue = async () => {
    const layout = await ctx.readLayout(device.deviceID);

    const pond = layout?.regions.find((region) => region.name === 'pond');
    const images = pond?.shown?.content.kind === 'html' ? (pond.shown.content.images ?? []) : [];

    return ctx.streams.tickets.issue(device.deviceID, 'pond', pond?.shown?.shownID ?? '', images);
  };

  const source = () => ({ log: ctx.log, nowMs: ctx.clock.now(), streams: ctx.streams });

  return {
    ...ctx,
    device,
    issue,
    readFrame: (ticket: string) => readPageFrame(source(), ticket, 'https://nixie.test'),
    readImage: (ticket: string) => readPageImage(source(), ticket),
    fillPage: (content: Record<string, unknown>, minutes?: number) =>
      ctx.call('device.region', {
        device: device.deviceID,
        region: 'pond',
        content: { kind: 'html', ...content },
        ...(minutes === undefined ? {} : { minutes }),
      }),
  };
}

test('#readPageFrame serves the page that a ticket was issued for, with its policy', async () => {
  const ctx = await setupTest();

  await ctx.fillPage({ html: '<p>ripples</p>' });

  const tickets = await ctx.issue();
  const frame = await ctx.readFrame(tickets.frame);

  expect([frame?.document.includes('<p>ripples</p>'), frame?.policy]).toStrictEqual([
    true,
    expect.stringContaining("connect-src 'none'"),
  ]);
});

test('#readPageFrame serves nothing for a ticket that nobody issued', async () => {
  const ctx = await setupTest();

  await ctx.fillPage({ html: '<p>ripples</p>' });

  const served = await ctx.readFrame('0e0b4b3e-0000-4000-8000-000000000000');

  expect(served).toBeNull();
});

test('#readPageFrame serves nothing once new content replaced the page', async () => {
  const ctx = await setupTest();

  await ctx.fillPage({ html: '<p>ripples</p>' });

  const tickets = await ctx.issue();

  await ctx.fillPage({ html: '<p>other</p>' });

  const served = await ctx.readFrame(tickets.frame);

  expect(served).toBeNull();
});

test('#readPageFrame serves nothing once the minutes of the page passed', async () => {
  const ctx = await setupTest();

  await ctx.fillPage({ html: '<p>ripples</p>' }, 1);

  const tickets = await ctx.issue();

  ctx.clock.advance(61_000);

  const served = await ctx.readFrame(tickets.frame);

  expect(served).toBeNull();
});

test('#readPageFrame names the URL of each declared image under the API origin', async () => {
  const ctx = await setupTest();

  await ctx.seed.image('k3x9m2p7qa');
  await ctx.fillPage({ html: '<p>ripples</p>', images: ['k3x9m2p7qa'] });

  const tickets = await ctx.issue();
  const frame = await ctx.readFrame(tickets.frame);

  expect(frame?.document).toContain(
    `"k3x9m2p7qa":"https://nixie.test/rpc/device/images/${tickets.images[0]?.ticket ?? ''}"`,
  );
});

test('#readPageImage serves a declared image by its ticket', async () => {
  const ctx = await setupTest();

  await ctx.seed.image('k3x9m2p7qa');
  await ctx.fillPage({ html: '<p>ripples</p>', images: ['k3x9m2p7qa'] });

  const tickets = await ctx.issue();
  const image = await ctx.readImage(tickets.images[0]?.ticket ?? '');

  expect(image).toMatchObject({ bytes: new Uint8Array([1, 2, 3]) });
});

test('#readPageImage serves nothing to the ticket of a frame', async () => {
  const ctx = await setupTest();

  await ctx.seed.image('k3x9m2p7qa');
  await ctx.fillPage({ html: '<p>ripples</p>', images: ['k3x9m2p7qa'] });

  const tickets = await ctx.issue();
  const served = await ctx.readImage(tickets.frame);

  expect(served).toBeNull();
});

test('#readPageImage serves nothing once new content replaced the page', async () => {
  const ctx = await setupTest();

  await ctx.seed.image('k3x9m2p7qa');
  await ctx.fillPage({ html: '<p>ripples</p>', images: ['k3x9m2p7qa'] });

  const tickets = await ctx.issue();

  await ctx.fillPage({ html: '<p>other</p>' });

  const served = await ctx.readImage(tickets.images[0]?.ticket ?? '');

  expect(served).toBeNull();
});

test('#readPageImage serves nothing once a forget removed the image', async () => {
  const ctx = await setupTest();
  const seeded = await ctx.seed.image('k3x9m2p7qa');

  await ctx.fillPage({ html: '<p>ripples</p>', images: ['k3x9m2p7qa'] });

  const tickets = await ctx.issue();

  await ctx.removeKey(seeded.sequence);

  const served = await ctx.readImage(tickets.images[0]?.ticket ?? '');

  expect(served).toBeNull();
});
