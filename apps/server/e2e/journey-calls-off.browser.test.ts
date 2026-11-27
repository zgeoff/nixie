import { expect, test } from 'bun:test';
import { createTestClient } from '@heynixie/server/test-utils';
import { setupSignedInBrowser, waitForPage } from '@heynixie/web/test-utils';
import { startWebJourney } from '../src/test-utils/start-web-journey';

async function setupTest() {
  const journey = await startWebJourney({ isComputerOff: true });
  const api = await createTestClient(journey.server);

  await setupSignedInBrowser(journey.view, { appURL: journey.appURL, token: api.token });

  return { ...journey, api };
}

test('it hides the Call menu entry of a nixie with no voice section, and says so on a visit to its page', async () => {
  const ctx = await setupTest();

  await ctx.view.navigate(`${ctx.appURL}/tasks`);

  // the menu shows every entry until nixie says which features are on, and this nixie has no
  // computer, so the Computer entry going shows that the features arrived
  await waitForPage(
    ctx.view,
    "![...document.querySelectorAll('header > nav a')].some((link) => link.textContent === 'Computer')",
  );

  const hasCallEntry = await ctx.view.evaluate(
    "[...document.querySelectorAll('header > nav a')].some((link) => link.textContent === 'Call')",
  );

  await ctx.view.navigate(`${ctx.appURL}/call`);

  await waitForPage(
    ctx.view,
    "document.body.innerText.includes('This feature is off in this nixie')",
  );

  expect(hasCallEntry).toBe(false);
});
