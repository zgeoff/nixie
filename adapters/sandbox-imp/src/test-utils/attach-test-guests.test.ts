import { expect, onTestFinished, test } from 'bun:test';
import { TEST_TOKEN, startTestImpd } from '@impz/testing';
import { buildImpPort } from '../build-imp-port';
import { attachTestGuests } from './attach-test-guests';

async function setupTest() {
  const impd = await startTestImpd();

  onTestFinished(impd.stop);

  return { impd };
}

test('it starts the stand-in guest of an imp before its create returns', async () => {
  const ctx = await setupTest();

  await ctx.impd.seedImage('harbour-image');

  const guested = attachTestGuests(
    ctx.impd,
    buildImpPort({ url: ctx.impd.url, token: TEST_TOKEN }),
  );

  await guested.port.createImp({
    name: 'harbour',
    image: 'harbour-image',
    vcpus: 1,
    memoryMib: 512,
    diskMib: 1024,
    policy: { mode: 'none', allow: [] },
    backup: false,
  });

  expect(guested.getGuest('harbour')).toStrictEqual({ connect: expect.any(Function) });
});

test('it refuses the guest of an imp that the port did not create', async () => {
  const ctx = await setupTest();

  const guested = attachTestGuests(
    ctx.impd,
    buildImpPort({ url: ctx.impd.url, token: TEST_TOKEN }),
  );

  expect(() => guested.getGuest('lighthouse')).toThrow(
    'no imp named lighthouse was created through this port',
  );
});
