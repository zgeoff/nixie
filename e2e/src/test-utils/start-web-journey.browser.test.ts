import { expect, onTestFinished, test } from 'bun:test';
import { probeProcessGone } from '@heynixie/testing';
import { waitForPage } from '@heynixie/web/test-utils';
import { startWebJourney } from './start-web-journey';

test('it serves the web app signed out on one origin, with nixie behind it', async () => {
  const journey = await startWebJourney();

  await journey.view.navigate(`${journey.appURL}/`);

  await waitForPage(journey.view, "document.body.innerText.includes('Enrol this browser')");

  const health = await fetch(`${journey.appURL}/health/ready`);

  expect(health.status).toBe(200);
});

test('it starts nixie again on the same data behind the same origin', async () => {
  const journey = await startWebJourney();

  journey.server.signal('SIGTERM');

  await journey.server.exited;

  const again = await journey.startServer();
  const ready = await fetch(`${journey.appURL}/health/ready`);

  expect({
    isFirstGone: probeProcessGone(journey.server.pid),
    status: ready.status,
  }).toStrictEqual({ isFirstGone: true, status: 200 });

  expect(probeProcessGone(again.pid)).toBeFalse();
});

test('it stops nixie and the origin, and closes the view, when the test finishes', async () => {
  const journey = await startWebJourney();

  onTestFinished(async () => {
    const reached = await fetch(`${journey.appURL}/`).then(
      () => true,
      () => false,
    );

    // a closed view throws from evaluate before it returns a promise
    const viewUsed = await Promise.try(() => journey.view.evaluate('1')).then(
      () => true,
      () => false,
    );

    expect({
      isNixieGone: probeProcessGone(journey.server.pid),
      reached,
      viewUsed,
    }).toStrictEqual({ isNixieGone: true, reached: false, viewUsed: false });
  });
});
