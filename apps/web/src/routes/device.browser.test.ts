import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { deviceStore } from '../mocks/device-store';
import { store } from '../mocks/store';
import { setupSignedInBrowser } from '../test-utils/setup-signed-in-browser';
import { startBuiltWeb } from '../test-utils/start-built-web';
import { startFrontProxy } from '../test-utils/start-front-proxy';
import { startStubAPI } from '../test-utils/start-stub-api';
import { waitForPage } from '../test-utils/wait-for-page';

interface Viewport {
  readonly width: number;
  readonly height: number;
}

async function setupTest() {
  const api = startStubAPI();

  const web = await startBuiltWeb(api.url);

  const proxy = startFrontProxy({ apiURL: api.url, webURL: web.url });

  const view = new Bun.WebView({ backend: 'chrome' });

  onTestFinished(async () => {
    await view.cdp('Emulation.clearDeviceMetricsOverride');
  });

  onTestFinished(() => {
    view.close();
  });

  await view.navigate('about:blank');
  await view.cdp('Network.clearBrowserCookies');

  const session = await store.sessions.create({ deviceName: 'desk panel' });

  await setupSignedInBrowser(view, { appURL: proxy.url, token: session.token });

  return {
    appURL: proxy.url,
    view,
    setViewport: (size: Viewport) =>
      view.cdp('Emulation.setDeviceMetricsOverride', {
        ...size,
        deviceScaleFactor: 1,
        mobile: false,
      }),
    waitForPage: (expression: string) => waitForPage(view, expression, 8000),
  };
}

test('it hydrates under its content security policy, switches the screen on and shows the scene', async () => {
  const ctx = await setupTest();

  await ctx.view.navigate(`${ctx.appURL}/device`);
  await ctx.waitForPage(`document.body.innerText.includes('Switch on screen')`);

  // the button answers only once React has hydrated the page under the policy
  await ctx.view.click('button');

  await ctx.waitForPage(
    `document.querySelector('[data-testid="screen"] h1')?.innerText === 'Saturday'`,
  );

  const policy = await fetch(`${ctx.appURL}/device`).then((response) =>
    response.headers.get('content-security-policy'),
  );

  expect(policy).toContain("frame-ancestors 'none'");
});

test('it enters and leaves full screen from the toggle, and follows the browser on Escape', async () => {
  const ctx = await setupTest();

  await ctx.view.navigate(`${ctx.appURL}/device`);
  await ctx.waitForPage(`document.querySelector('button[name=fullscreen]:enabled') !== null`);
  await ctx.view.click('button[name=fullscreen]');

  await ctx.waitForPage(
    `document.fullscreenElement === document.documentElement && document.querySelector('button[name=fullscreen]').innerText === 'Leave full screen'`,
  );

  await ctx.view.click('button[name=fullscreen]');

  await ctx.waitForPage(
    `document.fullscreenElement === null && document.querySelector('button[name=fullscreen]').innerText === 'Full screen'`,
  );
});

test('it sends one resize with the new size after the window resizes', async () => {
  const ctx = await setupTest();

  await ctx.setViewport({ width: 1000, height: 700 });
  await ctx.view.navigate(`${ctx.appURL}/device`);
  await ctx.waitForPage(`document.body.innerText.includes('Switch on screen')`);
  await ctx.view.click('button');
  await ctx.waitForPage(`document.querySelector('[data-testid="screen"] h1') !== null`);
  await ctx.setViewport({ width: 800, height: 600 });
  await ctx.setViewport({ width: 820, height: 610 });

  await waitFor(() => {
    expect(deviceStore.resizes.findMany()).toHaveLength(1);
  });

  await ctx.setViewport({ width: 840, height: 620 });

  await waitFor(() => {
    expect(deviceStore.resizes.findMany()).toHaveLength(2);
  });

  const resizes = deviceStore.resizes.findMany().map((row) => ({
    width: row.width,
    height: row.height,
  }));

  expect(resizes).toStrictEqual([
    { width: 820, height: 610 },
    { width: 840, height: 620 },
  ]);
});
