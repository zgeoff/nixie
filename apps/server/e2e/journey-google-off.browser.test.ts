import { expect, test } from 'bun:test';
import { createTestClient } from '@heynixie/server/test-utils';
import { setupSignedInBrowser, waitForPage } from '@heynixie/web/test-utils';
import { startWebJourney } from '../src/test-utils/start-web-journey';

async function setupTest() {
  const journey = await startWebJourney({ isGoogleOff: true, isComputerOff: true });
  const api = await createTestClient(journey.server);

  await setupSignedInBrowser(journey.view, { appURL: journey.appURL, token: api.token });

  return { ...journey, api };
}

test('it hides the Connections menu entry of a nixie with no google section, and says so on a visit to its page and to its return route', async () => {
  const ctx = await setupTest();

  await ctx.view.navigate(`${ctx.appURL}/tasks`);

  // the menu shows every entry until nixie says which features are on, and this nixie has no
  // computer either, so the Computer entry going shows that the features arrived
  await waitForPage(
    ctx.view,
    "![...document.querySelectorAll('header > nav a')].some((link) => link.textContent === 'Computer')",
  );

  const hasConnectionsEntry = await ctx.view.evaluate(
    "[...document.querySelectorAll('header > nav a')].some((link) => link.textContent === 'Connections')",
  );

  await ctx.view.navigate(`${ctx.appURL}/settings/connections`);

  await waitForPage(
    ctx.view,
    "document.body.innerText.includes('This feature is off in this nixie')",
  );

  // Google's return route is the one page of this feature that a browser reaches from outside nixie
  await ctx.view.navigate(`${ctx.appURL}/connections/google/return?state=abc&code=4%2F0Ab`);

  await waitForPage(
    ctx.view,
    "document.body.innerText.includes('This feature is off in this nixie')",
  );

  expect(hasConnectionsEntry).toBe(false);
});
