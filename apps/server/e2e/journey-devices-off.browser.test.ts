import { expect, test } from 'bun:test';
import { createTestClient } from '@heynixie/server/test-utils';
import { setupSignedInBrowser, waitForPage } from '@heynixie/web/test-utils';
import { startWebJourney } from '../src/test-utils/start-web-journey';

async function setupTest() {
  const journey = await startWebJourney({ isDevicesOff: true, isComputerOff: true });
  const api = await createTestClient(journey.server);

  await setupSignedInBrowser(journey.view, { appURL: journey.appURL, token: api.token });

  return { ...journey, api };
}

test('it hides the Device view menu entry of a nixie with no devices section, and says so on a visit to its pages', async () => {
  const ctx = await setupTest();

  await ctx.view.navigate(`${ctx.appURL}/tasks`);

  // the menu shows every entry until nixie says which features are on, and this nixie has no
  // computer either, so the Computer entry going shows that the features arrived
  await waitForPage(
    ctx.view,
    "![...document.querySelectorAll('header > nav a')].some((link) => link.textContent === 'Computer')",
  );

  const hasDeviceEntry = await ctx.view.evaluate(
    "[...document.querySelectorAll('header > nav a')].some((link) => ['Device view', 'Add a device'].includes(link.textContent))",
  );

  await ctx.view.navigate(`${ctx.appURL}/device-view`);

  await waitForPage(
    ctx.view,
    "document.body.innerText.includes('This feature is off in this nixie')",
  );

  expect(hasDeviceEntry).toBe(false);
});

test('it shows the feature-off page on the device page of a nixie with no devices section', async () => {
  const ctx = await setupTest();

  await ctx.view.navigate(`${ctx.appURL}/device`);

  await waitForPage(
    ctx.view,
    "document.body.innerText.includes('This feature is off in this nixie')",
  );

  const hasFailure = await ctx.view.evaluate(
    "document.body.innerText.includes('could not reach nixie')",
  );

  expect(hasFailure).toBe(false);
});

test('it shows the feature-off page, not the enrolment form, to a signed-out visit of the device page', async () => {
  const ctx = await setupTest();

  await ctx.view.cdp('Network.clearBrowserCookies');
  await ctx.view.navigate(`${ctx.appURL}/device`);

  await waitForPage(
    ctx.view,
    "document.body.innerText.includes('This feature is off in this nixie')",
  );

  const hasEnrolForm = await ctx.view.evaluate(
    "document.body.innerText.includes('Enrol this browser')",
  );

  expect(hasEnrolForm).toBe(false);
});
